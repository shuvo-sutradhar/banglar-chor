/**
 * Cheap CPU-time counters (read by the perf scripts via `__sidhel.perf()`).
 * `rig`  = procedural HumanRig pose updates (NPCs, and the thief when it falls back);
 * `mixer`= the thief GLB's AnimationMixer + morph/cosmetic update;
 * `sim`  = one physics frame: every before-step system (player, NPC brains, night director) +
 *          the Rapier world step(s), measured from the first before-step to the last after-step.
 * `renders` counts React commits of HUD components that update during play (they should stay
 * rare: a few per second at most, never per frame).
 * Rendering (skinning, draws) is GPU-side and measured separately through renderer counters.
 */
export type PerfKey = 'rig' | 'mixer' | 'sim';

const totals = { rigMs: 0, rigCalls: 0, mixerMs: 0, mixerCalls: 0, simMs: 0, simCalls: 0, since: 0 };
const renders = new Map<string, number>();

export function timed(key: PerfKey, fn: () => void): void {
  const t = performance.now();
  fn();
  totals[`${key}Ms`] += performance.now() - t;
  totals[`${key}Calls`]++;
}

let simStart = -1;
export function simBegin(): void {
  if (simStart < 0) simStart = performance.now();
}
export function simEnd(): void {
  if (simStart < 0) return;
  totals.simMs += performance.now() - simStart;
  totals.simCalls++;
  simStart = -1;
}

export function countRender(name: string): void {
  renders.set(name, (renders.get(name) ?? 0) + 1);
}

export function resetPerf(): void {
  totals.rigMs = totals.rigCalls = totals.mixerMs = totals.mixerCalls = totals.simMs = totals.simCalls = 0;
  totals.since = performance.now();
  renders.clear();
}

export function readPerf() {
  return { ...totals, elapsedMs: performance.now() - totals.since, renders: Object.fromEntries(renders) };
}
