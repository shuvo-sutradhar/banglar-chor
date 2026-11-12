import { createRng } from '../../lib/rng';
import { WORLD_BOUNDS } from '../data/tuning';
import { isClearForScatter, POND } from './layout';

export type PropInstance = { x: number; z: number; rotY: number; scale: number };

/** Cosmetic RNG seed — independent from gameplay randomness (README §3). */
const SCATTER_SEED = 0x51d4e1;

/** Deterministic scatter of vegetation around the playable area. */
function scatter(seed: number, count: number, minR: number, maxR: number, roadClearance: number, extra: number, existing: PropInstance[]): PropInstance[] {
  const rng = createRng(seed);
  const out: PropInstance[] = [];
  let attempts = 0;
  while (out.length < count && attempts < count * 40) {
  attempts++;
  const x = rng.range(-maxR, maxR);
  const z = rng.range(-maxR, maxR);
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge < minR) continue;
  if (!isClearForScatter({ x, z }, roadClearance, extra)) continue;
  if (existing.concat(out).some((p) => Math.hypot(p.x - x, p.z - z) < 2.2 + extra)) continue;
  out.push({ x, z, rotY: rng.range(0, Math.PI * 2), scale: rng.range(0.85, 1.2) });
  }
  return out;
}

function boundaryBamboo(): PropInstance[] {
  const rng = createRng(SCATTER_SEED + 9);
  const out: PropInstance[] = [];
  const h = WORLD_BOUNDS.halfSize;
  for (let side = 0; side < 4; side++) {
  for (let t = -h; t <= h; t += 3.1) {
    const inset = rng.range(-1, 2.5);
    const along = t + rng.range(-0.8, 0.8);
    const pos =
      side === 0 ? { x: along, z: -h - inset } : side === 1 ? { x: along, z: h + inset } : side === 2 ? { x: -h - inset, z: along } : { x: h + inset, z: along };
    out.push({ ...pos, rotY: rng.range(0, Math.PI * 2), scale: rng.range(0.9, 1.3) });
  }
  }
  return out;
}

/** Deterministic vegetation placement (same every load). */
export function buildVegetationLayout() {
  const groves = scatter(SCATTER_SEED, 26, 6, WORLD_BOUNDS.halfSize - 4, 4.5, 0.6, []);
  const palms = scatter(SCATTER_SEED + 1, 14, 4, WORLD_BOUNDS.halfSize - 3, 3.5, 0, groves);
  const bananas = scatter(SCATTER_SEED + 2, 16, 3, WORLD_BOUNDS.halfSize - 3, 3.2, 0, [...groves, ...palms]);
  const bushes = scatter(SCATTER_SEED + 3, 40, 2, WORLD_BOUNDS.halfSize - 2, 2.6, -0.8, [...groves, ...palms, ...bananas]);
  const reeds: PropInstance[] = [];
  const rr = createRng(SCATTER_SEED + 4);
  for (let i = 0; i < 34; i++) {
    const a = rr.range(0.6, Math.PI * 2 - 0.6) + Math.PI; // leave the west ghat side open
    const r = POND.radius + rr.range(-0.3, 0.5);
    reeds.push({ x: POND.x + Math.cos(a) * r, z: POND.z + Math.sin(a) * r, rotY: rr.range(0, 6), scale: rr.range(0.8, 1.3) });
  }
  return { groves: [...groves, ...boundaryBamboo()], palms, bananas, bushes, reeds };
}
