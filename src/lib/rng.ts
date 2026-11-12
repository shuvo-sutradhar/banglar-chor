/**
 * Deterministic seeded pseudo-random generator (mulberry32).
 * Simulation randomness (loot, events) and cosmetic randomness (prop scatter)
 * must use separate instances so changing scenery never changes gameplay.
 */
export type Rng = {
  readonly seed: number;
  /** Float in [0, 1). */
  next: () => number;
  /** Float in [min, max). */
  range: (min: number, max: number) => number;
  /** Integer in [min, max] inclusive. */
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
};

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick called with an empty list');
    return items[Math.floor(next() * items.length)] as T;
  }
  return {
    seed: seed >>> 0,
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    pick,
  };
}

/** Stable 32-bit FNV-1a hash of a string, for deriving seeds (e.g. from a date). */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
