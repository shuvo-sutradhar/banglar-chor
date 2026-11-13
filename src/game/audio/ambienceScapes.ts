/**
 * Layered, spatialised ambience beds (docs/AUDIO_DIRECTION.md §2). All sounds are synthesised
 * here (original, no samples). Each scape = continuous beds (wind, cricket chorus, crowd) plus
 * sparse one-shot "events" scheduled from emitters placed at real village/bazaar positions, so a
 * frog croaks from the pond and a dog barks from the edge of the fields, panned and dulled by
 * distance relative to the player's camera. Levels are deliberately unequal: beds sit low, close
 * events mid, distant ones faint.
 */
import type { AudioEngine } from './AudioManager';
import { HOUSES, POND } from '../world/layout';

export type AmbienceKind = 'night' | 'morning' | 'market' | 'safehouse';

export type AmbienceScape = { stop: (fade?: number) => void };

type XZ = { x: number; z: number };

/** One sparse event layer: fires every `min..max` seconds (scaled by `density`). */
export type EventLayer = { id: string; min: number; max: number; fire: (e: AudioEngine) => void };

/** Pure: the next delay for a layer (exported for tests: within bounds, never zero). */
export function nextDelay(layer: Pick<EventLayer, 'min' | 'max'>, r: number, density = 1): number {
  const span = layer.min + (layer.max - layer.min) * Math.min(1, Math.max(0, r));
  return Math.max(0.2, span / Math.max(0.1, density));
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

// Emitters at real places (village coordinates, docs/... layout.ts).
const FROG_SPOTS: readonly XZ[] = [POND, { x: POND.x + 5, z: POND.z - 3 }, { x: -27, z: 32 }, { x: 26, z: -18 }];
const DOG_SPOTS: readonly XZ[] = [{ x: 40, z: -34 }, { x: -44, z: 12 }, { x: 18, z: 48 }, { x: -30, z: -44 }];
const OWL_SPOTS: readonly XZ[] = [{ x: -24, z: -4 }, { x: 22, z: 6 }, { x: 4, z: -30 }];
const HOUSE_SPOTS: readonly XZ[] = [HOUSES.kuddus, HOUSES.morol, { x: HOUSES.rahim.x - 1, z: HOUSES.rahim.z }];

/** A looping noise bed through a filter, with slow random "gusts" on gain and cutoff. */
function bed(e: AudioEngine, out: AudioNode, opts: { type: BiquadFilterType; freq: number; q: number; gain: number; pan?: number; gust?: [number, number]; freqSwing?: number }) {
  const ctx = e.context!;
  const src = ctx.createBufferSource();
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // Brown-ish noise for wind (smoother than white).
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
    d[i] = last * 3.2;
  }
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = opts.type;
  f.frequency.value = opts.freq;
  f.Q.value = opts.q;
  const g = ctx.createGain();
  g.gain.value = opts.gain;
  let node: AudioNode = g;
  if (opts.pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = opts.pan;
    g.connect(p);
    node = p;
  }
  node.connect(out);
  src.connect(f).connect(g);
  src.start(0, Math.random() * 2);
  const gust = () => {
    const t = ctx.currentTime;
    const [lo, hi] = opts.gust ?? [1, 1];
    const k = rnd(lo, hi);
    g.gain.setTargetAtTime(opts.gain * k, t, rnd(0.8, 2.5));
    if (opts.freqSwing) f.frequency.setTargetAtTime(opts.freq * (1 + opts.freqSwing * (k - 1)), t, 1.5);
  };
  return { gust, stop: () => { try { src.stop(); } catch { /* stopped */ } } };
}

function scape(e: AudioEngine, beds: (out: AudioNode) => { gust: () => void; stop: () => void }[], layers: readonly EventLayer[]): AmbienceScape {
  const ctx = e.context;
  const bus = e.busNode('ambience');
  if (!ctx || !bus) return { stop: () => {} };
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.5);
  out.connect(bus);
  const running = beds(out);
  const next = new Map(layers.map((l) => [l.id, ctx.currentTime + nextDelay(l, Math.random())]));
  let gustAt = 0;
  const timer = window.setInterval(() => {
    if (ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t >= gustAt) {
      for (const b of running) b.gust();
      gustAt = t + rnd(2, 5);
    }
    for (const l of layers) {
      if (t >= (next.get(l.id) ?? 0)) {
        try {
          l.fire(e);
        } catch {
          /* never break the loop */
        }
        next.set(l.id, t + nextDelay(l, Math.random()));
      }
    }
  }, 200);
  return {
    stop: (fade = 0.8) => {
      window.clearInterval(timer);
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
      window.setTimeout(() => {
        for (const b of running) b.stop();
        out.disconnect();
      }, fade * 1000 + 200);
    },
  };
}

/** A world-positioned ambience one-shot (bus 'ambience'). */
function at(e: AudioEngine, p: XZ, range: number, gain: number) {
  return e.route({ at: p, range, gain, bus: 'ambience' }, 'ambience');
}

/** Around the listener (insects, rustles): a random point 4–14 m away. */
function near(e: AudioEngine): XZ {
  const l = e.listenerPos;
  const a = Math.random() * Math.PI * 2;
  const d = rnd(4, 14);
  return { x: l.x + Math.cos(a) * d, z: l.z + Math.sin(a) * d };
}

// ------------------------------------------------------------------ night village
export const NIGHT_LAYERS: readonly EventLayer[] = [
  {
    id: 'cricket-near',
    min: 0.35,
    max: 0.9,
    fire: (e) => {
      const r = at(e, near(e), 22, 0.05);
      if (!r) return;
      const f = rnd(4300, 5200);
      const n = 3 + Math.floor(Math.random() * 2);
      for (let k = 0; k < 2; k++) e.pulses(r.input, f, n, 0.018, 0.042, r.gain, k * rnd(0.32, 0.45), 'sine', 0.002);
    },
  },
  {
    id: 'frog',
    min: 1.2,
    max: 4.5,
    fire: (e) => {
      const p = pick(FROG_SPOTS);
      const r = at(e, p, 45, 0.18);
      if (!r) return;
      const f = rnd(110, 170);
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) e.formant(r.input, f * 1.15, f, 0.13, rnd(480, 650), r.gain, i * rnd(0.22, 0.3), 'sawtooth', 4);
    },
  },
  {
    id: 'dog-far',
    min: 22,
    max: 60,
    fire: (e) => {
      const p = pick(DOG_SPOTS);
      e.play('dog-bark', { at: p, range: 95, gain: 0.55, bus: 'ambience' });
      if (Math.random() < 0.4) e.play('dog-bark', { at: pick(DOG_SPOTS), range: 95, gain: 0.35, bus: 'ambience', when: 1.4 });
    },
  },
  {
    id: 'owl',
    min: 28,
    max: 65,
    fire: (e) => {
      const r = at(e, pick(OWL_SPOTS), 60, 0.12);
      if (!r) return;
      const f = rnd(330, 380);
      e.tone(r.input, f, 0.32, 'sine', r.gain, 0, f * 0.94);
      e.tone(r.input, f * 0.97, 0.5, 'sine', r.gain * 0.9, 0.55, f * 0.9);
    },
  },
  {
    id: 'nightjar',
    min: 35,
    max: 80,
    fire: (e) => {
      const r = at(e, pick(OWL_SPOTS), 55, 0.05);
      if (r) e.pulses(r.input, rnd(1600, 1900), 50, 0.012, 0.026, r.gain, 0, 'triangle');
    },
  },
  {
    id: 'leaves',
    min: 3,
    max: 9,
    fire: (e) => {
      const r = at(e, near(e), 20, 0.05);
      if (r) for (let i = 0; i < 4; i++) e.noise(r.input, rnd(0.08, 0.2), r.gain, rnd(3500, 6000), i * rnd(0.05, 0.12), 1.2, 'bandpass', undefined, 0.02);
    },
  },
  {
    id: 'house',
    min: 25,
    max: 55,
    fire: (e) => {
      const kind = pick(['pot-clatter', 'cough', 'door-creak', 'cough', 'cat-yowl'] as const);
      e.play(kind, { at: pick(HOUSE_SPOTS), range: 32, gain: 0.45, bus: 'ambience' });
    },
  },
];

function nightBeds(e: AudioEngine) {
  return (out: AudioNode) => [
    bed(e, out, { type: 'lowpass', freq: 420, q: 0.5, gain: 0.07, pan: -0.5, gust: [0.4, 1.6], freqSwing: 0.6 }),
    bed(e, out, { type: 'lowpass', freq: 520, q: 0.5, gain: 0.06, pan: 0.5, gust: [0.4, 1.6], freqSwing: 0.6 }),
    // far cricket chorus: a narrow shimmer band
    bed(e, out, { type: 'bandpass', freq: 4700, q: 18, gain: 0.05, gust: [0.7, 1.2] }),
    // leaves in the wind
    bed(e, out, { type: 'highpass', freq: 3800, q: 0.4, gain: 0.012, gust: [0.2, 1.8] }),
  ];
}

// ------------------------------------------------------------------ morning (dawn walk, safehouse by day)
export const MORNING_LAYERS: readonly EventLayer[] = [
  {
    id: 'doel',
    min: 1.5,
    max: 4,
    fire: (e) => {
      // magpie-robin style: a varied run of clear whistles with slides
      const r = at(e, near(e), 40, 0.07);
      if (!r) return;
      const n = 3 + Math.floor(Math.random() * 4);
      let t = 0;
      for (let i = 0; i < n; i++) {
        const f = rnd(1800, 3400);
        const d = rnd(0.07, 0.18);
        e.tone(r.input, f, d, 'sine', r.gain, t, f * rnd(0.8, 1.3));
        t += d + rnd(0.03, 0.1);
      }
    },
  },
  {
    id: 'bulbul',
    min: 3,
    max: 7,
    fire: (e) => {
      const r = at(e, near(e), 35, 0.05);
      if (r) [0, 0.11, 0.2].forEach((w) => e.tone(r.input, rnd(2400, 2900), 0.08, 'sine', r.gain, w, 3300));
    },
  },
  {
    id: 'rooster',
    min: 18,
    max: 40,
    fire: (e) => {
      const r = at(e, pick(HOUSE_SPOTS), 70, 0.12);
      if (!r) return;
      e.formant(r.input, 480, 620, 0.25, 1400, r.gain, 0, 'sawtooth', 3);
      e.formant(r.input, 640, 700, 0.35, 1500, r.gain, 0.27, 'sawtooth', 3);
      e.formant(r.input, 700, 430, 0.6, 1300, r.gain, 0.64, 'sawtooth', 3);
    },
  },
  {
    id: 'cow',
    min: 20,
    max: 45,
    fire: (e) => {
      const r = at(e, { x: -12, z: 24 }, 60, 0.12);
      if (r) e.formant(r.input, 130, 105, 1.3, 420, r.gain, 0, 'sawtooth', 2.5);
    },
  },
];

function morningBeds(e: AudioEngine) {
  return (out: AudioNode) => [bed(e, out, { type: 'lowpass', freq: 700, q: 0.5, gain: 0.035, gust: [0.5, 1.4], freqSwing: 0.4 })];
}

// ------------------------------------------------------------------ market
export const MARKET_LAYERS: readonly EventLayer[] = [
  {
    id: 'murmur',
    min: 0.25,
    max: 0.6,
    fire: (e) => {
      const r = at(e, near(e), 26, 0.06);
      if (!r) return;
      // syllabic chatter: short vowel-like formant blips
      const n = 2 + Math.floor(Math.random() * 4);
      const f0 = rnd(120, 230);
      for (let i = 0; i < n; i++) e.formant(r.input, f0 * rnd(0.9, 1.15), f0 * rnd(0.85, 1.1), rnd(0.07, 0.14), pick([500, 700, 1100, 1600]), r.gain, i * rnd(0.09, 0.16), 'sawtooth', 2);
    },
  },
  {
    id: 'hawker',
    min: 5,
    max: 11,
    fire: (e) => {
      const r = at(e, near(e), 40, 0.1);
      if (!r) return;
      const f = rnd(190, 260);
      e.formant(r.input, f, f * 1.25, 0.45, 900, r.gain, 0, 'sawtooth', 2.5);
      e.formant(r.input, f * 1.25, f * 0.9, 0.6, 750, r.gain, 0.5, 'sawtooth', 2.5);
    },
  },
  {
    id: 'rickshaw-bell',
    min: 9,
    max: 22,
    fire: (e) => {
      const r = at(e, near(e), 45, 0.06);
      if (r) for (let i = 0; i < 6; i++) e.tone(r.input, 2600, 0.05, 'triangle', r.gain, i * 0.07);
    },
  },
  {
    id: 'cups',
    min: 6,
    max: 14,
    fire: (e) => {
      const r = at(e, near(e), 20, 0.05);
      if (r) [0, 0.09].forEach((w) => e.tone(r.input, rnd(3000, 4200), 0.12, 'triangle', r.gain, w));
    },
  },
];

function marketBeds(e: AudioEngine) {
  return (out: AudioNode) => [
    bed(e, out, { type: 'bandpass', freq: 520, q: 0.8, gain: 0.05, pan: -0.4, gust: [0.7, 1.3] }),
    bed(e, out, { type: 'bandpass', freq: 760, q: 0.8, gain: 0.045, pan: 0.4, gust: [0.7, 1.3] }),
  ];
}

// ------------------------------------------------------------------ safehouse (quiet day yard)
export const SAFEHOUSE_LAYERS: readonly EventLayer[] = [MORNING_LAYERS[0]!, MORNING_LAYERS[1]!, MORNING_LAYERS[3]!];

export function ambienceFor(kind: AmbienceKind, e: AudioEngine): AmbienceScape {
  switch (kind) {
    case 'night':
      return scape(e, nightBeds(e), NIGHT_LAYERS);
    case 'morning':
      return scape(e, morningBeds(e), MORNING_LAYERS);
    case 'market':
      return scape(e, marketBeds(e), MARKET_LAYERS);
    case 'safehouse':
      return scape(e, morningBeds(e), SAFEHOUSE_LAYERS);
  }
}
