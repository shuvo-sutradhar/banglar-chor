export type GamePhase =
  | 'menu'
  | 'preparation'
  | 'night'
  | 'entry'
  | 'interior'
  | 'chase'
  | 'night-resolution'
  | 'dawn'
  | 'bazaar'
  | 'bargain'
  | 'caught'
  | 'results';

/**
 * Allowed run-state transitions (README §4). Every transition must be listed here;
 * anything else throws so bugs surface immediately instead of corrupting a run.
 * (The temporary Phase 1 `menu -> night` shortcut was removed in Phase 2; see D-007.)
 */
export const PHASE_TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  menu: ['preparation'],
  preparation: ['night', 'menu'],
  night: ['entry', 'chase', 'caught', 'night-resolution', 'menu'],
  entry: ['interior', 'night', 'chase', 'caught', 'night-resolution', 'menu'],
  interior: ['night', 'chase', 'caught', 'night-resolution', 'menu'],
  chase: ['night', 'interior', 'caught', 'night-resolution', 'menu'],
  caught: ['night-resolution', 'results', 'menu'],
  // Phase 2 ends the run at night-resolution; Phase 3 continues to dawn/bazaar/results.
  'night-resolution': ['dawn', 'results', 'preparation', 'menu'],
  dawn: ['bazaar', 'menu'],
  bazaar: ['bargain', 'results', 'chase', 'menu'],
  bargain: ['bazaar', 'chase', 'results', 'menu'],
  results: ['menu', 'preparation'],
};

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return PHASE_TRANSITIONS[from].includes(to);
}

export class InvalidPhaseTransitionError extends Error {
  constructor(from: GamePhase, to: GamePhase) {
    super(`Invalid game phase transition: ${from} -> ${to}`);
    this.name = 'InvalidPhaseTransitionError';
  }
}

export function assertTransition(from: GamePhase, to: GamePhase): GamePhase {
  if (!canTransition(from, to)) throw new InvalidPhaseTransitionError(from, to);
  return to;
}

/** Phases where the player avatar exists and real-time simulation runs. */
export function isSimulationPhase(phase: GamePhase): boolean {
  return phase !== 'menu' && phase !== 'results';
}
