/**
 * Procedural Web Audio sound substitutes (TEMPORARY — no recorded assets yet; docs/AUDIO_DIRECTION.md).
 * - Created/unlocked only after a user gesture (README §14 autoplay rule).
 * - Distance attenuation relative to the player for world sounds.
 * - Suspends on pause / hidden tab; every sound also has a caption elsewhere.
 * Fails silently when Web Audio is unavailable; gameplay never depends on audio.
 */
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
  | 'grumble';

type PlayOptions = { at?: { x: number; z: number }; gain?: number };

export type AmbienceKind = 'night' | 'morning' | 'market';

class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: { stop: () => void; kind: AmbienceKind } | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private listener = { x: 0, z: 0 };
  private volume = 0.8;
  private muted = false;

  /** Call from a click/tap handler. Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.applyVolume();
        const len = this.ctx.sampleRate;
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;
    this.applyVolume();
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

  setListener(x: number, z: number): void {
    this.listener.x = x;
    this.listener.z = z;
  }

  private applyVolume(): void {
    if (this.master && this.ctx) this.master.gain.setValueAtTime(this.muted ? 0 : this.volume * 0.6, this.ctx.currentTime);
  }

  private attenuation(opts?: PlayOptions): number {
    const g = opts?.gain ?? 1;
    if (!opts?.at) return g;
    const d = Math.hypot(opts.at.x - this.listener.x, opts.at.z - this.listener.z);
    return g * Math.max(0, 1 - d / 28);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || gain <= 0.001) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, gain: number, filterFreq: number, when = 0, q = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer || gain <= 0.001) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  play(id: SoundId, opts?: PlayOptions): void {
    if (!this.ctx) return;
    const a = this.attenuation(opts);
    try {
      switch (id) {
        case 'footstep':
          // soft bare foot on packed earth: a short low thump, slightly varied
          this.noise(0.07, 0.12 * a, 260 + Math.random() * 120, 0, 1.4);
          break;
        case 'coins':
          [0, 0.06, 0.13].forEach((w, i) => this.tone(2400 + i * 380 + Math.random() * 200, 0.12, 'triangle', 0.07 * a, w));
          break;
        case 'grumble':
          this.tone(150, 0.28, 'sawtooth', 0.04 * a, 0, 115);
          this.tone(120, 0.22, 'sawtooth', 0.035 * a, 0.22, 100);
          break;
        case 'tap-perfect':
          this.tone(880, 0.12, 'triangle', 0.25 * a);
          this.tone(1320, 0.1, 'sine', 0.12 * a, 0.03);
          break;
        case 'tap-good':
          this.tone(660, 0.12, 'triangle', 0.2 * a);
          break;
        case 'tap-miss':
          this.noise(0.18, 0.35 * a, 300, 0, 2);
          this.tone(120, 0.15, 'square', 0.12 * a);
          break;
        case 'entry-fail':
          this.noise(0.8, 0.6 * a, 200, 0, 0.7);
          this.tone(80, 0.6, 'sawtooth', 0.25 * a, 0, 40);
          break;
        case 'entry-success':
          [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.2 * a, i * 0.09));
          break;
        case 'pickup':
          this.tone(500, 0.09, 'sine', 0.18 * a, 0, 900);
          break;
        case 'drop-clang':
          [1180, 1730, 2410].forEach((f) => this.tone(f, 0.9, 'triangle', 0.12 * a));
          this.noise(0.15, 0.25 * a, 3000, 0, 3);
          break;
        case 'drop-soft':
          this.noise(0.12, 0.2 * a, 400, 0, 1);
          break;
        case 'cluck':
          [0, 0.13, 0.24].forEach((w, i) => this.tone(700 + i * 90, 0.07, 'square', 0.12 * a, w, 420));
          break;
        case 'alarm-ring':
          for (let i = 0; i < 14; i++) this.tone(2100, 0.06, 'square', 0.1 * a, i * 0.11);
          break;
        case 'radio':
          [392, 440, 494, 440, 392, 330, 392].forEach((f, i) => this.tone(f, 0.22, 'sawtooth', 0.08 * a, i * 0.24));
          this.noise(1.6, 0.06 * a, 2500, 0, 0.5);
          break;
        case 'rattle':
          this.noise(0.08, 0.15 * a, 4000, 0, 4);
          this.noise(0.06, 0.1 * a, 5000, 0.07, 4);
          break;
        case 'alert':
          this.tone(330, 0.12, 'square', 0.18 * a);
          this.tone(494, 0.25, 'square', 0.18 * a, 0.12);
          break;
        case 'suspicious':
          this.tone(440, 0.18, 'sine', 0.14 * a, 0, 560);
          break;
        case 'shout':
          this.tone(260, 0.35, 'sawtooth', 0.12 * a, 0, 380);
          break;
        case 'caught':
          [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.22 * a, i * 0.22));
          this.noise(0.6, 0.3 * a, 500, 0.1, 0.6);
          break;
        case 'snore':
          this.noise(0.9, 0.12 * a, 180, 0, 3);
          break;
        case 'prep-hit':
          this.tone(740, 0.1, 'triangle', 0.18 * a, 0, 980);
          break;
        case 'prep-miss':
          this.tone(220, 0.2, 'square', 0.12 * a, 0, 150);
          break;
        case 'prep-done':
          [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.18 * a, i * 0.1));
          break;
      }
    } catch {
      /* audio must never break gameplay */
    }
  }

  /**
   * Ambience beds (procedural): night crickets/frogs, dawn birdsong, market crowd murmur with the
   * odd bell. Switching kinds cross-fades by stopping the old loop.
   */
  startAmbience(kind: AmbienceKind = 'night'): void {
    if (!this.ctx) return;
    if (this.ambience?.kind === kind) return;
    this.stopAmbience();
    let alive = true;
    const loop = () => {
      if (!alive || !this.ctx) return;
      if (this.ctx.state === 'running') {
        if (kind === 'night') {
          for (let i = 0; i < 3; i++) this.noise(0.05, 0.03, 4800 + Math.random() * 600, i * 0.08, 8);
          if (Math.random() < 0.15) this.tone(140 + Math.random() * 40, 0.12, 'sine', 0.05, 0.3, 110); // frog
          if (Math.random() < 0.035) {
            // a dog barking somewhere far off
            const f = 330 + Math.random() * 60;
            [0, 0.2].forEach((w) => this.tone(f, 0.09, 'sawtooth', 0.018, 0.5 + w, f * 0.8));
          }
        } else if (kind === 'morning') {
          const f = 2200 + Math.random() * 1400;
          for (let i = 0; i < 3; i++) this.tone(f + i * 180, 0.08, 'sine', 0.05, i * 0.1, f * 1.25);
          if (Math.random() < 0.3) [0, 0.12].forEach((w) => this.tone(3600 + Math.random() * 500, 0.05, 'sine', 0.035, 0.45 + w, 4200)); // second bird
          if (Math.random() < 0.2) [0, 0.18, 0.36].forEach((w) => this.tone(520, 0.14, 'triangle', 0.05, w, 760)); // rooster-ish
        } else {
          this.noise(0.9, 0.05, 600 + Math.random() * 500, 0, 0.6); // crowd murmur
          if (Math.random() < 0.25) this.tone(180 + Math.random() * 120, 0.25, 'sawtooth', 0.025, 0.2, 240);
          if (Math.random() < 0.08) this.tone(1800, 0.4, 'triangle', 0.04, 0.4); // stall bell
        }
      }
      timer = window.setTimeout(loop, kind === 'market' ? 500 + Math.random() * 500 : 700 + Math.random() * 900);
    };
    let timer = window.setTimeout(loop, 300);
    this.ambience = {
      kind,
      stop: () => {
        alive = false;
        window.clearTimeout(timer);
      },
    };
  }

  stopAmbience(): void {
    this.ambience?.stop();
    this.ambience = null;
  }
}

export const audio = new AudioManagerImpl();
