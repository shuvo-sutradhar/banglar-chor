import { HOUSES, localToWorld } from '../world/layout';

/**
 * Rahim's house gameplay geometry (single source of truth for visuals + systems).
 * Local frame: front = +z (road side), back wall at z = -2.125 faces the village edge.
 */
export const RAHIM_HOLE = { halfWidth: 0.65, bottom: 0.3, top: 1.55 } as const;

const w = (lx: number, ly: number, lz: number) => localToWorld(HOUSES.rahim, [lx, ly, lz]);

/** Where the sidh interaction sits (outside the back wall) and where it is usable from. */
export const SIDH_TARGET = w(0, 0.8, -2.6);
/** Exit interaction just inside the opening. */
export const SIDH_EXIT_TARGET = w(0, 0.8, -1.55);
/** Feet positions for the scripted crawl through the opening. */
export const CRAWL_OUTSIDE = w(0, 0.02, -3.3);
export const CRAWL_MID = w(0, 0.3, -2.125);
export const CRAWL_INSIDE = w(0, 0.3, -1.25);
/** World heading facing into the house through the back wall. */
export const HEADING_INTO_HOUSE = HOUSES.rahim.rotY;
export const HEADING_OUT_OF_HOUSE = HOUSES.rahim.rotY + Math.PI;
/** Rahim's cot (local 1.9, _, -0.9) — he sleeps here. */
export const RAHIM_COT_LOCAL: [number, number, number] = [1.9, 0.79, -0.9];
export const RAHIM_COT = w(...RAHIM_COT_LOCAL);
/** Interior rectangle (world) used to test "player is inside". */
export const RAHIM_INTERIOR = { minX: -14, maxX: -10, minZ: 3.25, maxZ: 8.75 } as const;

export function insideRahimHouse(x: number, z: number): boolean {
  return x >= RAHIM_INTERIOR.minX && x <= RAHIM_INTERIOR.maxX && z >= RAHIM_INTERIOR.minZ && z <= RAHIM_INTERIOR.maxZ;
}
