/**
 * Event-driven Web Audio engine (Phase 4B, docs/AUDIO_DIRECTION.md).
 *
 * - Mix buses: master → { ambience, sfx, voice, ui }, each with its own user volume.
 * - Created/unlocked only after a user gesture (browser autoplay rule).
 * - Spatial world sounds: distance roll-off, air absorption (distant = duller) and stereo
 *   panning relative to the camera's yaw.
 * - Every sound here is ORIGINAL and synthesised at runtime (no third-party samples). Recorded
 *   dialogue is loaded from files listed in the voice manifest when they exist (see voice.ts).
 * - Suspends with pause / hidden tab; `dispose()` closes the context (tests, teardown).
 * Fails silently when Web Audio is unavailable: gameplay never depends on audio.
 */
import { ambienceFor, type AmbienceKind, type AmbienceScape } from './ambienceScapes';

export type { AmbienceKind } from './ambienceScapes';

export type SoundId =
  | 'tap-perfect'
  | 'tap-good'
  | 'tap-miss'
  | 'entry-fail'
  | 'entry-success'
  | 'pickup'
  | 'drop-clang'
  | 'drop-soft'
  | 'cluck'
  | 'alarm-ring'
  | 'radio'
  | 'rattle'
  | 'alert'
  | 'suspicious'
  | 'caught'
  | 'snore'
  | 'prep-hit'
  | 'prep-miss'
  | 'prep-done'
  | 'shout'
  | 'footstep'
  | 'coins'
  | 'grumble'
  // Phase 4B
  | 'dig-scrape'
  | 'dig-thunk'
  | 'tool-clang'
  | 'breath'
  | 'pant'
  | 'eat-crunch'
  | 'slurp'
  | 'gulp'
  | 'buy'
  | 'no-money'
  | 'equip'
  | 'ui-tap'
  | 'rest-sigh'
  | 'dust-poof'
  | 'boing'
  | 'slide-whistle'
  | 'wah-wah'
  | 'run-steps'
  | 'dog-bark'
  | 'pot-clatter'
  | 'door-creak'
  | 'cough'
  | 'cat-yowl';

export type Bus = 'ambience' | 'sfx' | 'voice' | 'ui';

export type PlayOptions = {
  /** World position (x, z). Omit for "in the head" sounds (thief, UI). */
  at?: { x: number; z: number };
  gain?: number;
  /** Seconds from now. */
  when?: number;
  bus?: Bus;
  /** Distance (m) at which a world sound becomes inaudible (default 28). */
  range?: number;
  /** Cancellation group (e.g. 'catch'): `stopGroup` silences everything scheduled in it. */
  group?: string;
};

/** Which bus each sound belongs to (UI feedback is its own bus so it can be mixed separately). */
const UI_SOUNDS: ReadonlySet<SoundId> = new Set(['ui-tap', 'buy', 'no-money', 'equip', 'coins', 'prep-hit', 'prep-miss', 'prep-done']);

export type MixLevels = { master: number; ambience: number; sfx: number; voice: number; muted: boolean };

/** Pure: effective gain of a bus (0 when muted). Exported for tests. */
export function busGain(levels: MixLevels, bus: Bus | 'master'): number {
  if (levels.muted) return 0;
  if (bus === 'master') return levels.master * 0.7;
  if (bus === 'ui') return levels.sfx;
  return levels[bus];
}

/** Pure spatial model: gain falloff, stereo pan (−1 left … 1 right) and an air-absorption cutoff. */
export function spatialize(listener: { x: number; z: number; yaw: number }, at: { x: number; z: number }, range = 28): { gain: number; pan: number; cutoff: number; distance: number } {
  const dx = at.x - listener.x;
  const dz = at.z - listener.z;
  const distance = Math.hypot(dx, dz);
  // Smooth roll-off: full within 2 m, inaudible at `range`.
  const k = Math.min(1, Math.max(0, (distance - 2) / Math.max(1, range - 2)));
  const gain = (1 - k) * (1 - k);
  // Camera right vector for yaw: forward = (−sin, −cos) ⇒ right = (cos, −sin).
  const rx = Math.cos(listener.yaw);
  const rz = -Math.sin(listener.yaw);
  const pan = distance < 0.5 ? 0 : Math.max(-0.85, Math.min(0.85, ((dx * rx + dz * rz) / distance) * 0.85));
  const cutoff = Math.max(900, 18000 * Math.exp(-distance / 22));
  return { gain, pan, cutoff, distance };
}

type Voice = { stop: (when?: number) => void };

class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses = new Map<Bus, GainNode>();
  private ambience: AmbienceScape | null = null;
  private ambienceKind: AmbienceKind | null = null;
  private pendingAmbience: AmbienceKind | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private listener = { x: 0, z: 0, yaw: 0 };
  private levels: MixLevels = { master: 0.8, ambience: 0.8, sfx: 0.9, voice: 1, muted: false };
  private groups = new Map<string, Set<Voice>>();
  /** Counters for tests/debug (how many sounds were triggered per id). */
  readonly counts = new Map<SoundId, number>();
  private plays = 0;

  /** Call from a click/tap handler. Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        for (const b of ['ambience', 'sfx', 'voice', 'ui'] as Bus[]) {
          const g = this.ctx.createGain();
          g.connect(this.master);
          this.buses.set(b, g);
        }
        this.applyLevels();
        const len = this.ctx.sampleRate * 2;
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        if (this.pendingAmbience) this.startAmbience(this.pendingAmbience);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get state(): { unlocked: boolean; running: boolean; ambience: AmbienceKind | null; plays: number; activeGroups: string[] } {
    return { unlocked: this.ctx !== null, running: this.ctx?.state === 'running', ambience: this.ambienceKind, plays: this.plays, activeGroups: [...this.groups.entries()].filter(([, v]) => v.size > 0).map(([k]) => k) };
  }

  /** Back-compat: master volume + mute. */
  setVolume(volume: number, muted: boolean): void {
    this.levels = { ...this.levels, master: volume, muted };
    this.applyLevels();
  }

  setMix(levels: Partial<MixLevels>): void {
    this.levels = { ...this.levels, ...levels };
    this.applyLevels();
  }

  setSuspended(suspended: boolean): void {
    if (!this.ctx) return;
    try {
      if (suspended && this.ctx.state === 'running') void this.ctx.suspend();
      if (!suspended && this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      /* ignore */
    }
  }

  setListener(x: number, z: number, yaw = this.listener.yaw): void {
    this.listener.x = x;
    this.listener.z = z;
    this.listener.yaw = yaw;
  }

  get listenerPos(): { x: number; z: number; yaw: number } {
    return this.listener;
  }

  /** Destination for a bus (voice playback uses this). */
  busNode(bus: Bus): AudioNode | null {
    return this.buses.get(bus) ?? null;
  }

  private applyLevels(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(busGain(this.levels, 'master'), t, 0.03);
    for (const [b, g] of this.buses) g.gain.setTargetAtTime(busGain(this.levels, b), t, 0.03);
  }

  // ------------------------------------------------------------------ routing primitives
  /**
   * Build the output chain for one sound: [panner] → [air-absorption lowpass] → bus.
   * Returns the input node and the effective gain, or null when inaudible.
   */
  route(opts: PlayOptions | undefined, defaultBus: Bus): { input: AudioNode; gain: number } | null {
    const ctx = this.ctx;
    const busId = opts?.bus ?? defaultBus;
    const bus = this.buses.get(busId);
    if (!ctx || !bus) return null;
    // A silent bus (muted, or its slider at 0) builds no nodes at all: no CPU or GC churn.
    if (busGain(this.levels, busId) <= 0 || busGain(this.levels, 'master') <= 0) return null;
    let gain = opts?.gain ?? 1;
    let node: AudioNode = bus;
    if (opts?.at) {
      const s = spatialize(this.listener, opts.at, opts.range);
      gain *= s.gain;
      if (gain < 0.002) return null;
      if (s.cutoff < 17000) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = s.cutoff;
        lp.connect(node);
        node = lp;
      }
      if (ctx.createStereoPanner && Math.abs(s.pan) > 0.02) {
        const p = ctx.createStereoPanner();
        p.pan.value = s.pan;
        p.connect(node);
        node = p;
      }
    }
    return { input: node, gain };
  }

  private track(group: string | undefined, v: Voice, endAt: number): void {
    if (!group || !this.ctx) return;
    let set = this.groups.get(group);
    if (!set) this.groups.set(group, (set = new Set()));
    set.add(v);
    window.setTimeout(() => set?.delete(v), Math.max(0, (endAt - this.ctx.currentTime) * 1000) + 100);
  }

  /** Silence everything scheduled in a group (e.g. skipping the catch sequence). */
  stopGroup(group: string): void {
    const set = this.groups.get(group);
    if (!set) return;
    for (const v of set) v.stop();
    set.clear();
  }

  tone(out: AudioNode, freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number, group?: string): void {
    const ctx = this.ctx;
    if (!ctx || gain <= 0.0005) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.012, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    this.track(group, { stop: () => { try { osc.stop(); } catch { /* already stopped */ } } }, t0 + dur);
  }

  noise(out: AudioNode, dur: number, gain: number, filterFreq: number, when = 0, q = 1, type: BiquadFilterType = 'bandpass', group?: string, attack = 0.004): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer || gain <= 0.0005) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.02);
    this.track(group, { stop: () => { try { src.stop(); } catch { /* already stopped */ } } }, t0 + dur);
  }

  /** Pulsed tone (amplitude-modulated): crickets, frog trills, nightjars. */
  pulses(out: AudioNode, freq: number, count: number, on: number, period: number, gain: number, when = 0, type: OscillatorType = 'sine', drift = 0): void {
    for (let i = 0; i < count; i++) this.tone(out, freq * (1 + drift * i), on, type, gain, when + i * period);
  }

  /** A formant-filtered tone (barks, moos, crows): oscillator through a bandpass. */
  formant(out: AudioNode, f0: number, f1: number, dur: number, formantHz: number, gain: number, when = 0, type: OscillatorType = 'sawtooth', q = 3, group?: string): void {
    const ctx = this.ctx;
    if (!ctx || gain <= 0.0005) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = formantHz;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur / 4));
    g.gain.setValueAtTime(gain, t0 + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(bp).connect(g).connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    this.track(group, { stop: () => { try { osc.stop(); } catch { /* already stopped */ } } }, t0 + dur);
  }

  // ------------------------------------------------------------------ one-shot SFX
  play(id: SoundId, opts?: PlayOptions): void {
    this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
    if (!this.ctx) return;
    const r = this.route(opts, UI_SOUNDS.has(id) ? 'ui' : 'sfx');
    if (!r) return;
    this.plays++;
    const o = r.input;
    const a = r.gain;
    const w = opts?.when ?? 0;
    const grp = opts?.group;
    const T = (f: number, d: number, ty: OscillatorType, g: number, wh = 0, sl?: number) => this.tone(o, f, d, ty, g * a, w + wh, sl, grp);
    const N = (d: number, g: number, f: number, wh = 0, q = 1, ty: BiquadFilterType = 'bandpass', att = 0.004) => this.noise(o, d, g * a, f, w + wh, q, ty, grp, att);
    const F = (f0: number, f1: number, d: number, fh: number, g: number, wh = 0, ty: OscillatorType = 'sawtooth', q = 3) => this.formant(o, f0, f1, d, fh, g * a, w + wh, ty, q, grp);
    try {
      switch (id) {
        case 'footstep':
          N(0.07, 0.12, 260 + Math.random() * 120, 0, 1.4);
          N(0.03, 0.04, 1800 + Math.random() * 600, 0.01, 2);
          break;
        case 'coins':
          [0, 0.06, 0.13].forEach((wh, i) => T(2400 + i * 380 + Math.random() * 200, 0.12, 'triangle', 0.07, wh));
          break;
        case 'grumble':
          F(150, 115, 0.28, 600, 0.09);
          F(120, 100, 0.22, 500, 0.08, 0.22);
          break;
        case 'tap-perfect':
          T(880, 0.12, 'triangle', 0.25);
          T(1320, 0.1, 'sine', 0.12, 0.03);
          break;
        case 'tap-good':
          T(660, 0.12, 'triangle', 0.2);
          break;
        case 'tap-miss':
          N(0.18, 0.35, 300, 0, 2);
          T(120, 0.15, 'square', 0.12);
          break;
        case 'entry-fail':
          N(0.8, 0.6, 200, 0, 0.7);
          T(80, 0.6, 'sawtooth', 0.25, 0, 40);
          break;
        case 'entry-success':
          [523, 659, 784].forEach((f, i) => T(f, 0.18, 'triangle', 0.2, i * 0.09));
          break;
        case 'pickup':
          T(500, 0.09, 'sine', 0.18, 0, 900);
          break;
        case 'drop-clang':
          [1180, 1730, 2410].forEach((f) => T(f, 0.9, 'triangle', 0.12));
          N(0.15, 0.25, 3000, 0, 3);
          break;
        case 'drop-soft':
          N(0.12, 0.2, 400, 0, 1);
          break;
        case 'cluck':
          [0, 0.13, 0.24].forEach((wh, i) => T(700 + i * 90, 0.07, 'square', 0.12, wh, 420));
          break;
        case 'alarm-ring':
          for (let i = 0; i < 14; i++) T(2100, 0.06, 'square', 0.1, i * 0.11);
          break;
        case 'radio':
          [392, 440, 494, 440, 392, 330, 392].forEach((f, i) => T(f, 0.22, 'sawtooth', 0.08, i * 0.24));
          N(1.6, 0.06, 2500, 0, 0.5);
          break;
        case 'rattle':
          N(0.08, 0.15, 4000, 0, 4);
          N(0.06, 0.1, 5000, 0.07, 4);
          break;
        case 'alert':
          T(330, 0.12, 'square', 0.18);
          T(494, 0.25, 'square', 0.18, 0.12);
          break;
        case 'suspicious':
          T(440, 0.18, 'sine', 0.14, 0, 560);
          break;
        case 'shout':
          F(260, 380, 0.35, 900, 0.25);
          break;
        case 'caught':
          [392, 349, 311, 262].forEach((f, i) => T(f, 0.28, 'triangle', 0.22, i * 0.22));
          N(0.6, 0.3, 500, 0.1, 0.6);
          break;
        case 'snore':
          N(0.9, 0.12, 180, 0, 3, 'bandpass', 0.3);
          F(90, 70, 0.9, 260, 0.06, 0, 'sawtooth', 2);
          break;
        case 'prep-hit':
          T(740, 0.1, 'triangle', 0.18, 0, 980);
          break;
        case 'prep-miss':
          T(220, 0.2, 'square', 0.12, 0, 150);
          break;
        case 'prep-done':
          [392, 523, 659, 784].forEach((f, i) => T(f, 0.2, 'triangle', 0.18, i * 0.1));
          break;
        // ---- Phase 4B: tool, body, food, shop, catch, village life
        case 'dig-scrape':
          // the cartoon spade biting into packed earth: a gritty noise sweep + soft thud
          N(0.22, 0.32, 900, 0, 1.2, 'bandpass', 0.02);
          N(0.12, 0.25, 180, 0.04, 1.5);
          break;
        case 'dig-thunk':
          N(0.14, 0.4, 140, 0, 2);
          T(95, 0.16, 'sine', 0.3, 0, 60);
          N(0.25, 0.12, 2400, 0.05, 1, 'highpass'); // crumbs of earth falling
          break;
        case 'tool-clang':
          // metal-on-brick: inharmonic partials, the "too loud" mistake sound
          [870, 1390, 2210, 3150].forEach((f, i) => T(f, 0.7 - i * 0.1, 'triangle', 0.16));
          N(0.1, 0.3, 3500, 0, 3);
          break;
        case 'breath':
          N(0.55, 0.06, 1200, 0, 0.8, 'bandpass', 0.18);
          break;
        case 'pant':
          for (let i = 0; i < 3; i++) {
            N(0.22, 0.09, 1400, i * 0.42, 0.9, 'bandpass', 0.05);
            N(0.18, 0.05, 900, i * 0.42 + 0.22, 0.9, 'bandpass', 0.05);
          }
          break;
        case 'eat-crunch':
          for (let i = 0; i < 4; i++) N(0.06, 0.18, 2600 + Math.random() * 1500, i * 0.11, 2.5);
          break;
        case 'slurp':
          T(300, 0.35, 'sine', 0.08, 0, 900);
          N(0.35, 0.06, 1800, 0, 4, 'bandpass', 0.05);
          break;
        case 'gulp':
          T(260, 0.12, 'sine', 0.16, 0, 120);
          break;
        case 'buy':
          [0, 0.07].forEach((wh, i) => T(2200 + i * 500, 0.14, 'triangle', 0.09, wh));
          T(1046, 0.25, 'sine', 0.08, 0.14);
          break;
        case 'no-money':
          T(196, 0.18, 'square', 0.08);
          T(165, 0.26, 'square', 0.08, 0.16);
          break;
        case 'equip':
          N(0.08, 0.2, 2200, 0, 3);
          T(620, 0.08, 'triangle', 0.1, 0.05, 820);
          break;
        case 'ui-tap':
          T(1200, 0.04, 'sine', 0.06);
          break;
        case 'rest-sigh':
          N(0.9, 0.08, 700, 0, 0.7, 'bandpass', 0.25);
          F(220, 150, 0.8, 700, 0.05, 0.05, 'sawtooth', 2);
          break;
        case 'dust-poof':
          N(0.5, 0.45, 320, 0, 0.6, 'lowpass', 0.01);
          N(0.3, 0.15, 1600, 0.02, 0.8);
          break;
        case 'boing':
          T(180, 0.45, 'sine', 0.18, 0, 520);
          T(185, 0.45, 'triangle', 0.08, 0.02, 530);
          break;
        case 'slide-whistle':
          T(500, 0.6, 'sine', 0.1, 0, 1600);
          break;
        case 'wah-wah':
          [[392, 370], [370, 349], [349, 330], [330, 262]].forEach(([f0, f1], i) => F(f0!, f1!, i === 3 ? 0.9 : 0.36, 900, 0.22, i * 0.4, 'sawtooth', 2));
          break;
        case 'run-steps':
          for (let i = 0; i < 8; i++) N(0.06, 0.2 + 0.03 * i, 220 + Math.random() * 80, i * 0.16, 1.5);
          break;
        case 'dog-bark':
          [0, 0.24, 0.62].forEach((wh) => {
            const f = 420 + Math.random() * 80;
            F(f, f * 0.72, 0.14, 1100, 0.3, wh, 'sawtooth', 2.5);
            N(0.1, 0.12, 1300, wh, 1.5);
          });
          break;
        case 'pot-clatter':
          [740, 1120, 1610].forEach((f, i) => T(f, 0.5, 'triangle', 0.08, i * 0.03));
          N(0.25, 0.18, 2400, 0, 2);
          T(980, 0.3, 'triangle', 0.06, 0.18);
          break;
        case 'door-creak':
          F(160, 420, 0.9, 1400, 0.12, 0, 'sawtooth', 6);
          break;
        case 'cough':
          [0, 0.3].forEach((wh) => {
            N(0.16, 0.22, 600, wh, 1.2, 'bandpass', 0.01);
            F(240, 180, 0.14, 800, 0.08, wh, 'sawtooth', 2);
          });
          break;
        case 'cat-yowl':
          F(500, 900, 0.5, 1300, 0.12, 0, 'sawtooth', 4);
          F(900, 600, 0.4, 1300, 0.1, 0.5, 'sawtooth', 4);
          break;
      }
    } catch {
      /* audio must never break gameplay */
    }
  }

  // ------------------------------------------------------------------ ambience
  /**
   * Layered ambience (ambienceScapes.ts): night village, morning, market. Switching kinds
   * cross-fades. Requested before unlock → started on unlock.
   */
  startAmbience(kind: AmbienceKind = 'night'): void {
    this.pendingAmbience = kind;
    if (!this.ctx) return;
    if (this.ambienceKind === kind) return;
    this.ambience?.stop(1.2);
    this.ambience = ambienceFor(kind, this);
    this.ambienceKind = kind;
  }

  stopAmbience(): void {
    this.pendingAmbience = null;
    this.ambience?.stop(0.8);
    this.ambience = null;
    this.ambienceKind = null;
  }

  /** Close everything (page teardown / tests). */
  dispose(): void {
    this.stopAmbience();
    for (const g of this.groups.keys()) this.stopGroup(g);
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.master = null;
    this.buses.clear();
  }
}

export type AudioEngine = AudioManagerImpl;
export const audio = new AudioManagerImpl();
