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
 *
 * `menu -> night` is a deliberate Phase 1 free-roam entry (docs/DECISIONS.md D-007).
 * It is removed once the Phase 2 preparation ritual exists.
 */
export const PHASE_TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  menu: ['preparation', 'night'],
  preparation: ['night', 'menu'],
  night: ['entry', 'chase', 'caught', 'night-resolution', 'menu'],
  entry: ['interior', 'night', 'chase', 'menu'],
  interior: ['night', 'chase', 'caught', 'menu'],
  chase: ['night', 'caught', 'night-resolution', 'menu'],
  caught: ['night-resolution', 'results', 'menu'],
  'night-resolution': ['dawn', 'results', 'menu'],
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
