import { Color, Vector3 } from 'three';

/**
 * Global time-of-day factor: 0 = night, 1 = morning. Animated by the dawn transition and read by
 * lights/sky every frame (a plain mutable object — no React state, no re-renders).
 */
export const daylight = { factor: 0 };

const NIGHT_SKY = new Color('#152039');
const DAWN_SKY = new Color('#e9a77d');
const DAY_SKY = new Color('#b7d6ea');

/** Three-stop sky gradient: night → warm dawn (at 0.4) → hazy morning blue. */
export function skyColorAt(t: number, out: Color): Color {
  if (t <= 0.4) return out.copy(NIGHT_SKY).lerp(DAWN_SKY, t / 0.4);
  return out.copy(DAWN_SKY).lerp(DAY_SKY, (t - 0.4) / 0.6);
}

const MOON_DIR = new Vector3(-0.45, 0.8, -0.4).normalize();
const SUNRISE_DIR = new Vector3(0.95, 0.18, 0.25).normalize();
const MORNING_DIR = new Vector3(0.55, 0.8, 0.3).normalize();

/** Key-light direction: the moon at night, a sun rising in the east and climbing. */
export function keyLightDirAt(t: number, out: Vector3): Vector3 {
  if (t <= 0.35) return out.copy(MOON_DIR).lerp(SUNRISE_DIR, t / 0.35).normalize();
  return out.copy(SUNRISE_DIR).lerp(MORNING_DIR, (t - 0.35) / 0.65).normalize();
}

const MOON_COLOR = new Color('#a6b9d8');
const SUNRISE_COLOR = new Color('#ffb070');
const DAY_COLOR = new Color('#fff4e0');

/** Key-light colour: cool moonlight → warm sunrise → soft white morning. */
export function keyLightColorAt(t: number, out: Color): Color {
  if (t <= 0.4) return out.copy(MOON_COLOR).lerp(SUNRISE_COLOR, t / 0.4);
  return out.copy(SUNRISE_COLOR).lerp(DAY_COLOR, (t - 0.4) / 0.6);
}
