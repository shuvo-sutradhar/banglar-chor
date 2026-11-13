export type JoystickVector = { x: number; y: number; magnitude: number };

/**
 * Convert a raw thumb offset (screen pixels, y down) into a normalized stick vector
 * (x right, y forward) with a radial dead zone, rescaled so output starts at 0
 * just outside the dead zone and reaches 1 at the rim.
 */
export function normalizeJoystick(dxPx: number, dyPx: number, radiusPx: number, deadZone: number): JoystickVector {
  const radius = Math.max(1, radiusPx);
  const dist = Math.hypot(dxPx, dyPx);
  const raw = Math.min(1, dist / radius);
  if (raw <= deadZone || dist === 0) return { x: 0, y: 0, magnitude: 0 };
  const magnitude = (raw - deadZone) / (1 - deadZone);
  const nx = dxPx / dist;
  const ny = -dyPx / dist;
  return { x: nx * magnitude, y: ny * magnitude, magnitude };
}

/** Joystick radius adapts to the viewport so it is usable on small phones and tablets. */
export function adaptiveJoystickRadius(viewportWidth: number, viewportHeight: number): number {
  const short = Math.min(viewportWidth, viewportHeight);
  return Math.round(Math.min(78, Math.max(46, short * 0.15)));
}

/** Ignore a second tap on the same context button within this window (bounced / double touch). */
export const TAP_GUARD_MS = 220;

/**
 * Floating joystick: when the thumb drags beyond 1.35 × radius, the base follows so the stick
 * never needs to travel back across a large dead distance to reverse direction.
 */
export function followOrigin(ox: number, oy: number, x: number, y: number, radius: number, slack = 1.35): { x: number; y: number } {
  const dx = x - ox;
  const dy = y - oy;
  const d = Math.hypot(dx, dy);
  const max = radius * slack;
  if (d <= max) return { x: ox, y: oy };
  const k = (d - max) / d;
  return { x: ox + dx * k, y: oy + dy * k };
}
