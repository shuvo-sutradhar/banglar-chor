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

export type CameraPresetId = 'exploration' | 'interior';

export type CameraPreset = {
  distance: number;
  /** Height of the look-at point above the player's feet. */
  targetHeight: number;
  defaultPitch: number;
  fov: number;
};

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPreset> = {
  exploration: { distance: 5.4, targetHeight: 1.45, defaultPitch: 0.32, fov: 55 },
  interior: { distance: 3.1, targetHeight: 1.3, defaultPitch: 0.45, fov: 62 },
};

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
