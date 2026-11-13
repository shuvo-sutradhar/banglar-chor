/**
 * Cheap CPU-time counters for character animation (read by the perf scripts via `__sidhel.perf()`).
 * `rig` = procedural HumanRig pose updates (NPCs, and the thief when it falls back);
 * `mixer` = the thief GLB's AnimationMixer + morph/cosmetic update. Rendering (skinning, draws) is
 * GPU-side and measured separately through renderer counters.
 */
export type PerfKey = 'rig' | 'mixer';

const totals = { rigMs: 0, rigCalls: 0, mixerMs: 0, mixerCalls: 0, since: 0 };

export function timed(key: PerfKey, fn: () => void): void {
  const t = performance.now();
  fn();
  totals[`${key}Ms`] += performance.now() - t;
  totals[`${key}Calls`]++;
}

export function resetPerf(): void {
  totals.rigMs = totals.rigCalls = totals.mixerMs = totals.mixerCalls = 0;
  totals.since = performance.now();
}

export function readPerf() {
  return { ...totals, elapsedMs: performance.now() - totals.since };
}
