import { NavGraph, type Obstacle } from './navGraph';
import type { XZ } from './npcBrain';
import { buildVegetationLayout } from '../world/vegetationLayout';
import { COWSHED, HOUSES, localToWorld, POND, TEA_STALL } from '../world/layout';

/**
 * World-space AI data for the night village: obstacle footprints, patrol route, nav nodes and
 * light pools. Derived from the same layout data as the colliders so they stay in sync.
 */

/** Rahim's plinth footprint in world space (local x ±3.5, z −2.8..3.8; rotated +90°). */
export const RAHIM_FOOTPRINT = { minX: -14.8, maxX: -8.2, minZ: 2.5, maxZ: 9.5 } as const;

export const STANDALONE_HAYSTACKS: readonly [number, number][] = [
  [-19.5, 14.8],
  [-16.5, 19.5],
  [-16, -13.5],
];

function staticObstacles(): Obstacle[] {
  const obs: Obstacle[] = [
    { kind: 'rect', ...RAHIM_FOOTPRINT },
    { kind: 'rect', minX: 8, maxX: 18, minZ: -10, maxZ: 2 }, // Kuddus compound
    { kind: 'rect', minX: -15, maxX: -6.5, minZ: -24, maxZ: -16 }, // Morol house + yard
    { kind: 'rect', minX: COWSHED.x - 2.2, maxX: COWSHED.x + 2.2, minZ: COWSHED.z - 2.6, maxZ: COWSHED.z + 2.6 },
    { kind: 'rect', minX: TEA_STALL.x - 2.0, maxX: TEA_STALL.x + 0.9, minZ: TEA_STALL.z - 1.3, maxZ: TEA_STALL.z + 1.3 },
    { kind: 'circle', x: POND.x, z: POND.z, r: POND.radius },
    { kind: 'circle', x: -7.2, z: 8.9, r: 0.4 }, // Rahim's clay stove
  ];
  for (const [x, z] of STANDALONE_HAYSTACKS) obs.push({ kind: 'circle', x, z, r: 1.15 });
  const veg = buildVegetationLayout();
  for (const p of veg.groves) obs.push({ kind: 'circle', x: p.x, z: p.z, r: 0.75 * p.scale });
  for (const p of veg.palms) obs.push({ kind: 'circle', x: p.x, z: p.z, r: 0.3 * p.scale });
  for (const p of veg.bananas) obs.push({ kind: 'circle', x: p.x, z: p.z, r: 0.26 * p.scale });
  return obs;
}

export const VILLAGE_OBSTACLES: readonly Obstacle[] = staticObstacles();

/**
 * Night patrol of মজনু মিয়া: down the road, round the north side of Rahim's house, along the
 * back (where a thief would dig), the south side, and back to the road. The back leg is the
 * timing puzzle; his lantern and vision cone telegraph where he is looking.
 */
export const VILLAGER_ROUTE: readonly XZ[] = [
  { x: -1, z: 13 },
  { x: -1, z: -1 },
  { x: -7, z: -2.4 },
  { x: -16.8, z: -2.4 },
  { x: -16.8, z: 13.2 },
  { x: -7, z: 13.4 },
];

export const VILLAGER_HOME: XZ = { x: -1, z: 13 };

const NAV_NODES: XZ[] = [
  ...VILLAGER_ROUTE,
  { x: -16.4, z: 6 },
  { x: -11.5, z: 0.9 },
  { x: -11.5, z: 11.1 },
  { x: -6.4, z: 6 },
  { x: -6.6, z: 1.0 },
  { x: -6.6, z: 11.0 },
  { x: -16.4, z: 1.0 },
  { x: -16.4, z: 11.0 },
  { x: 1.5, z: 4 },
  { x: 0.5, z: 22 },
  { x: 1, z: 30 },
  { x: 1, z: 36 },
  { x: 0, z: -8 },
  { x: -2.5, z: -15 },
  { x: 3, z: 13 },
  { x: -6, z: 20 },
];

export const VILLAGE_NAV = new NavGraph(NAV_NODES, VILLAGE_OBSTACLES, 0.45);

/** Light pools that raise player exposure (house lanterns). The villager's own lantern is added at runtime. */
export const LIGHT_POOLS: readonly { x: number; z: number; radius: number }[] = [
  { ...xz(localToWorld(HOUSES.rahim, [0.85, 0, 2.45])), radius: 4 },
  { x: 12.8, z: -3.1, radius: 4 },
  { x: -8.5, z: -20.95, radius: 4 },
  { x: -13.9, z: 24, radius: 3 },
];

function xz(p: [number, number, number]): XZ {
  return { x: p[0], z: p[2] };
}

/** Safe exit at the southern village entrance (GAME_DESIGN §2). */
export const EXIT_ZONE = { minX: -3.5, maxX: 5, minZ: 37.5, maxZ: 42 } as const;

export function inExitZone(p: XZ): boolean {
  return p.x >= EXIT_ZONE.minX && p.x <= EXIT_ZONE.maxX && p.z >= EXIT_ZONE.minZ && p.z <= EXIT_ZONE.maxZ;
}
