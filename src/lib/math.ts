export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Frame-rate independent exponential smoothing. `lambda` is the response rate (1/s). */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** Wrap an angle to [-PI, PI). */
export function wrapAngle(angle: number): number {
  let a = (angle + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Damp an angle along the shortest arc. */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const delta = wrapAngle(target - current);
  return wrapAngle(current + delta * (1 - Math.exp(-lambda * dt)));
}

/** Move `current` toward `target` by at most `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}
