/**
 * Central gameplay tuning. All values are design starting points, tuned by playtesting.
 * Units: metres, seconds, radians.
 */
export const PLAYER_TUNING = {
  /** Capsule: total height = 2 * (halfHeight + radius) = 1.6 m. */
  capsuleHalfHeight: 0.45,
  capsuleRadius: 0.35,
  /** Gap Rapier keeps between the capsule and obstacles. */
  controllerOffset: 0.02,
  walkSpeed: 3.0,
  runSpeed: 5.6,
  crouchSpeed: 1.5,
  /** Horizontal acceleration / deceleration (m/s^2). */
  acceleration: 22,
  deceleration: 26,
  /** Heading turn response (1/s). */
  turnRate: 12,
  gravity: 22,
  maxFallSpeed: 30,
  autostepHeight: 0.35,
  autostepMinWidth: 0.1,
  snapToGround: 0.3,
  maxSlopeClimbDeg: 45,
  /** Below this Y the player is considered out of the world and safely respawned. */
  killPlaneY: -8,
  /** Carrying a full load reduces top speed by this fraction (used from Phase 2). */
  fullLoadSpeedPenalty: 0.45,
} as const;

export type CameraPresetId = 'exploration' | 'interior' | 'minigame' | 'chase' | 'caught' | 'conversation';

export type CameraPreset = {
  distance: number;
  /** Height of the look-at point above the player's feet. */
  targetHeight: number;
  defaultPitch: number;
  fov: number;
};

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPreset> = {
  /** Slightly closer than before so the thief reads at a glance (was 5.4 m / 55°). */
  exploration: { distance: 5.0, targetHeight: 1.4, defaultPitch: 0.3, fov: 54 },
  /** Cutaway view: the camera sits outside the small room, walls/roof cut around the sight line. */
  interior: { distance: 3.7, targetHeight: 1.05, defaultPitch: 0.78, fov: 56 },
  /** Over-the-shoulder 3/4 view of the wall during the entry challenge. */
  minigame: { distance: 2.9, targetHeight: 1.0, defaultPitch: 0.3, fov: 55 },
  /** Pulled back so pursuers stay in view. */
  chase: { distance: 6.0, targetHeight: 1.5, defaultPitch: 0.36, fov: 60 },
  /** Slow orbit around the comic catch. */
  caught: { distance: 4.8, targetHeight: 1.0, defaultPitch: 0.42, fov: 52 },
  /** Over-the-shoulder framing of a merchant during a trade. */
  conversation: { distance: 2.5, targetHeight: 1.55, defaultPitch: 0.16, fov: 50 },
};

/** Camera yaw for the entry challenge: behind-left of a thief facing Rahim's back wall (+X). */
export const MINIGAME_CAMERA_YAW = -Math.PI / 2 + 0.6;

export const CAMERA_TUNING = {
  minPitch: -0.12,
  maxPitch: 1.15,
  /** Radians per pixel of drag, multiplied by the user's sensitivity setting. */
  radiansPerPixel: 0.0052,
  /** How quickly the camera pulls in when something blocks the view (1/s). */
  occlusionPullIn: 30,
  /** How quickly the camera eases back out once clear (1/s). */
  occlusionRelease: 4,
  /** Keep this far in front of whatever blocked the view. */
  occlusionPadding: 0.25,
  minDistance: 0.7,
  targetFollowRate: 14,
  presetBlendRate: 4,
  sprintFovBoost: 5,
  minCameraHeight: 0.35,
  /** Seconds for the camera to glide from the menu view into third-person. */
  introBlendSeconds: 1.4,
} as const;

export const WORLD_BOUNDS = { halfSize: 42 } as const;

/** Spawn point at the southern village entrance, facing north (-Z). */
export const PLAYER_SPAWN: readonly [number, number, number] = [1.2, 0.05, 34];
