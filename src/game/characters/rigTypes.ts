import type { MovementMode } from '../physics/motorMath';

/** Procedural action poses layered over locomotion (temporary until GLB animations, ART_DIRECTION A1). */
export type ActionPose =
  | 'oil-rub'
  | 'oil-miss'
  | 'tuck'
  | 'tuck-fail'
  | 'gamcha'
  | 'gamcha-fail'
  | 'proud'
  | 'dig'
  | 'crawl'
  | 'pickup'
  | 'frightened'
  | 'caught'
  | 'shout'
  | 'look-around'
  | 'sit-up'
  | 'sit'
  | 'examine'
  | 'wave';

/** Cosmetic preparation state (README §6 — purely visual fantasy). */
export type Cosmetic = { oil: number; tuck: number; headband: boolean };

/** Anything that drives a HumanRig: the player, an NPC, or a scripted vignette. */
export type RigDriver = {
  horizontalSpeed: number;
  mode: MovementMode;
  action: ActionPose | null;
  /** Seconds since `action` started (advanced by the rig). */
  actionTime: number;
  cosmetic?: Cosmetic;
  /** 0..1 carried load: shows a sack on the back that grows with it. */
  carry?: number;
};

export function setAction(driver: RigDriver, action: ActionPose | null): void {
  if (driver.action === action) return;
  driver.action = action;
  driver.actionTime = 0;
}
