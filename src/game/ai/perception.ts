import { clamp } from '../../lib/math';

export type SightConfig = {
  viewDistance: number;
  /** Full field-of-view angle in radians. */
  fov: number;
  /** Suspicion per second at mid range, standing, normal exposure. */
  baseRate: number;
  /**
   * Fairness cap (GAME_DESIGN §4): even at point-blank range, suspicion cannot rise faster
   * than this, so reaching 100 from 0 always takes >= 100 / maxRate seconds.
   */
  maxRate: number;
  /** Within this distance the player is noticed regardless of facing (bumping into someone). */
  proximityRadius: number;
};

export const VILLAGER_SIGHT: SightConfig = {
  viewDistance: 9,
  fov: (110 * Math.PI) / 180,
  baseRate: 45,
  maxRate: 80,
  proximityRadius: 1.4,
};

export type SightInput = {
  /** Vector from NPC eye to player (horizontal). */
  dx: number;
  dz: number;
  /** NPC facing (normalized, horizontal). */
  facingX: number;
  facingZ: number;
  crouched: boolean;
  running: boolean;
  /** 1 = moonlit open ground, >1 = lantern-lit, <1 = deep shadow. */
  exposure: number;
  lineOfSight: boolean;
};

/** Is the player inside the vision cone (ignoring occlusion)? */
export function inViewCone(input: Pick<SightInput, 'dx' | 'dz' | 'facingX' | 'facingZ' | 'crouched'>, cfg: SightConfig): boolean {
  const dist = Math.hypot(input.dx, input.dz);
  if (dist <= cfg.proximityRadius) return true;
  const range = cfg.viewDistance * (input.crouched ? 0.7 : 1);
  if (dist > range) return false;
  const cos = (input.dx * input.facingX + input.dz * input.facingZ) / Math.max(dist, 1e-6);
  return cos >= Math.cos(cfg.fov / 2);
}

/** Suspicion gained per second from seeing the player; 0 if not visible. */
export function sightSuspicionRate(input: SightInput, cfg: SightConfig): number {
  if (!input.lineOfSight || !inViewCone(input, cfg)) return 0;
  const dist = Math.hypot(input.dx, input.dz);
  const range = cfg.viewDistance * (input.crouched ? 0.7 : 1);
  const proximity = 1.6 - 1.1 * clamp(dist / Math.max(range, 1e-6), 0, 1); // 1.6 close → 0.5 far
  const posture = input.crouched ? 0.45 : input.running ? 1.3 : 1;
  const rate = cfg.baseRate * proximity * posture * clamp(input.exposure, 0.4, 1.8);
  return Math.min(cfg.maxRate, rate);
}

/** Exposure from nearby light sources (lantern pools make the player easier to see). */
export function exposureAt(x: number, z: number, lights: readonly { x: number; z: number; radius: number }[]): number {
  let e = 1;
  for (const l of lights) {
    const d = Math.hypot(x - l.x, z - l.z);
    if (d < l.radius) e = Math.max(e, 1 + 0.6 * (1 - d / l.radius));
  }
  return e;
}
