/**
 * Optional hooks that UI-driven minigames register so automated browser tests (with `?debug=1`)
 * can read their timing state. Read-only for tests; gameplay never depends on this.
 */
export type DebugHooks = {
  prep?: () => { stage: string; msUntilSweetSpot: number; idealHoldMs: number };
  entry?: () => { msUntilNextBeat: number; time: number; progress: number; noise: number; status: string; hintVisible: boolean; resting: boolean; stamina: number; tool: string; clipPhase: number | null };
  persuade?: () => { msUntilSweet: number; speed: number };
  trade?: () => { phase: string; offer: number; reservation: number; countersLeft: number; patience: number; suspicion: number; examining: boolean; item: string | null };
  dawn?: () => { progress: number };
  /** Thief GLB animation controller state (clip playing, playback rate, cross-fade weight). */
  anim?: () => { clip: string | null; timeScale: number; weight: number; clips: number; blink: boolean };
};

export const debugHooks: DebugHooks = {};

export function debugEnabled(): boolean {
  return import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
}

/** `?debug=1&nonpc=1` removes the patrolling villager (Rahim stays) — only to isolate deterministic browser tests. */
export function npcsDisabledForTests(): boolean {
  const q = new URLSearchParams(window.location.search);
  return q.has('debug') && q.has('nonpc');
}
