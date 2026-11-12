import { clamp } from '../../lib/math';
import { PLAYER_TUNING } from '../data/tuning';

export type MovementMode = 'idle' | 'walk' | 'run' | 'crouch-idle' | 'crouch-walk' | 'airborne';

export type Vec2 = { x: number; z: number };

/**
 * Convert 2D input (x = right, y = forward) into a world-space XZ direction relative to the camera.
 * Camera yaw convention: the camera sits at target + (sin(yaw), _, cos(yaw)) * distance,
 * so its horizontal forward vector is (-sin(yaw), -cos(yaw)).
 * Writes into `out` to avoid per-frame allocation; returns input magnitude clamped to [0, 1].
 */
export function cameraRelativeDirection(inputX: number, inputY: number, cameraYaw: number, out: Vec2): number {
  const magnitude = Math.min(1, Math.hypot(inputX, inputY));
  if (magnitude < 1e-4) {
    out.x = 0;
    out.z = 0;
    return 0;
  }
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  // forward = (-sin, -cos), right = (cos, -sin)
  const x = -sin * inputY + cos * inputX;
  const z = -cos * inputY - sin * inputX;
  const len = Math.hypot(x, z);
  out.x = x / len;
  out.z = z / len;
  return magnitude;
}

export function resolveMovementMode(params: {
  inputMagnitude: number;
  sprintHeld: boolean;
  crouched: boolean;
  grounded: boolean;
}): MovementMode {
  const { inputMagnitude, sprintHeld, crouched, grounded } = params;
  if (!grounded) return 'airborne';
  const moving = inputMagnitude > 0.05;
  if (crouched) return moving ? 'crouch-walk' : 'crouch-idle';
  if (!moving) return 'idle';
  return sprintHeld ? 'run' : 'walk';
}

/** Speed multiplier from carried load ratio (0 = empty, 1 = full capacity). */
export function loadSpeedMultiplier(loadRatio: number): number {
  return 1 - PLAYER_TUNING.fullLoadSpeedPenalty * clamp(loadRatio, 0, 1);
}

export function targetSpeedFor(mode: MovementMode, inputMagnitude: number, loadRatio = 0): number {
  let base: number;
  switch (mode) {
    case 'run':
      base = PLAYER_TUNING.runSpeed;
      break;
    case 'walk':
    case 'airborne':
      base = PLAYER_TUNING.walkSpeed;
      break;
    case 'crouch-walk':
      base = PLAYER_TUNING.crouchSpeed;
      break;
    default:
      base = 0;
  }
  // Analog input scales walking speed; sprint always aims for full speed when moving.
  const analog = mode === 'run' ? 1 : clamp(inputMagnitude, 0, 1);
  return base * analog * loadSpeedMultiplier(loadRatio);
}

/**
 * Accelerate the horizontal velocity toward `desired` with separate accel/decel limits.
 * Mutates and returns `velocity`.
 */
export function stepHorizontalVelocity(velocity: Vec2, desired: Vec2, dt: number): Vec2 {
  const dx = desired.x - velocity.x;
  const dz = desired.z - velocity.z;
  const deltaLen = Math.hypot(dx, dz);
  if (deltaLen < 1e-6) return velocity;
  const speeding = Math.hypot(desired.x, desired.z) >= Math.hypot(velocity.x, velocity.z);
  const rate = speeding ? PLAYER_TUNING.acceleration : PLAYER_TUNING.deceleration;
  const maxStep = rate * dt;
  if (deltaLen <= maxStep) {
    velocity.x = desired.x;
    velocity.z = desired.z;
  } else {
    velocity.x += (dx / deltaLen) * maxStep;
    velocity.z += (dz / deltaLen) * maxStep;
  }
  return velocity;
}
