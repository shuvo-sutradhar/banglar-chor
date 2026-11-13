import type { MerchantId } from '../data/merchants';
import type { XZ } from '../ai/npcBrain';
import type { Obstacle } from '../ai/navGraph';

/**
 * Morning bazaar (হাট) layout — a separate zone that replaces the village scenery after dawn.
 * Origin at the big banyan tree. Entrance (and one exit) at the south gate (+Z), second exit at the
 * north gate (−Z). Single source of truth for colliders, nav, NPC routes and interaction points.
 */
export const BAZAAR_BOUNDS = { halfX: 26, halfZ: 23 } as const;
/** Spawn well inside the gate so the follow camera starts clear of the gate signboard. */
export const BAZAAR_SPAWN: readonly [number, number, number] = [0, 0.05, 15.5];
export const GATE_HALF_WIDTH = 3;

export const TREE = { x: 0, z: 0, trunkR: 1.2, platformR: 2.4, platformH: 0.45 } as const;

export type StallDef = {
  id: string;
  /** Centre of the stall footprint and the direction its counter faces (front = local +z). */
  x: number;
  z: number;
  rotY: number;
  width: number;
  depth: number;
  roof: 'tin' | 'cloth' | 'thatch';
  clothColor?: string;
  signBn: string;
  signBg: string;
  merchant?: MerchantId;
  goods: 'metal' | 'electronics' | 'general' | 'tea' | 'veg' | 'pots';
};

export const STALLS: readonly StallDef[] = [
  { id: 'hashem', x: -13.5, z: -2, rotY: Math.PI / 2, width: 5, depth: 3, roof: 'tin', signBn: 'হাশেম কাকার হাঁড়িপাতিল', signBg: '#e3ba70', merchant: 'hashem', goods: 'metal' },
  { id: 'jalil', x: 13.5, z: -2, rotY: -Math.PI / 2, width: 5, depth: 3, roof: 'tin', signBn: 'জলিল ইলেকট্রনিক্স', signBg: '#9fd0e8', merchant: 'jalil', goods: 'electronics' },
  { id: 'bokul', x: -6, z: -15, rotY: 0, width: 5, depth: 3, roof: 'cloth', clothColor: '#a45d46', signBn: 'বকুল আপার দোকান', signBg: '#f4d1c4', merchant: 'bokul', goods: 'general' },
  { id: 'tea', x: 13, z: 12, rotY: -Math.PI / 2, width: 4, depth: 2.6, roof: 'thatch', signBn: 'চা-বিস্কুট', signBg: '#f6f1e8', goods: 'tea' },
  { id: 'veg', x: -13, z: 11, rotY: Math.PI / 2, width: 4.5, depth: 2.6, roof: 'cloth', clothColor: '#456a3d', signBn: 'তাজা সবজি', signBg: '#d8ecc0', goods: 'veg' },
  { id: 'pots', x: 7, z: -15, rotY: 0, width: 4, depth: 2.6, roof: 'thatch', signBn: 'মাটির হাঁড়ি-কলসি', signBg: '#e9c9a8', goods: 'pots' },
];

/** Front-of-counter point (where the player stands to talk) and where the merchant stands. */
export function stallFront(s: StallDef, out = 1.2): XZ {
  return { x: s.x + Math.sin(s.rotY) * (s.depth / 2 + out), z: s.z + Math.cos(s.rotY) * (s.depth / 2 + out) };
}
export function stallKeeperSpot(s: StallDef): XZ {
  return { x: s.x - Math.sin(s.rotY) * (s.depth / 2 - 0.6), z: s.z - Math.cos(s.rotY) * (s.depth / 2 - 0.6) };
}

/** Tea-stall benches (customers sit here) — local to the world. */
export const TEA_BENCHES: readonly { x: number; z: number; rotY: number }[] = [
  { x: 9.4, z: 10.6, rotY: Math.PI / 2 },
  { x: 9.4, z: 13.4, rotY: Math.PI / 2 },
];

/** Exits: walking into either gate zone offers to finish the market (or ends a chase as an escape). */
export function inBazaarExit(p: XZ): 'north' | 'south' | null {
  if (Math.abs(p.x) <= GATE_HALF_WIDTH + 0.5 && p.z <= -BAZAAR_BOUNDS.halfZ + 1.6) return 'north';
  if (Math.abs(p.x) <= GATE_HALF_WIDTH + 0.5 && p.z >= BAZAAR_BOUNDS.halfZ - 1.0) return 'south';
  return null;
}

export const BAZAAR_OBSTACLES: readonly Obstacle[] = [
  { kind: 'circle', x: TREE.x, z: TREE.z, r: TREE.platformR },
  ...STALLS.map((s): Obstacle => {
    const rotated = Math.abs(Math.sin(s.rotY)) > 0.5;
    const hx = (rotated ? s.depth : s.width) / 2 + 0.3;
    const hz = (rotated ? s.width : s.depth) / 2 + 0.3;
    return { kind: 'rect', minX: s.x - hx, maxX: s.x + hx, minZ: s.z - hz, maxZ: s.z + hz };
  }),
  ...TEA_BENCHES.map((b): Obstacle => ({ kind: 'rect', minX: b.x - 0.3, maxX: b.x + 0.3, minZ: b.z - 1.0, maxZ: b.z + 1.0 })),
];

/** Lanes between the tree and the stalls (verified clear by unit tests). */
export const WATCHMAN_ROUTE: readonly XZ[] = [
  { x: 0, z: 15 },
  { x: 7.5, z: 7 },
  { x: 8, z: -8 },
  { x: 0, z: -10 },
  { x: -8, z: -8 },
  { x: -7.5, z: 7 },
];

/** Rahim Chacha shopping: enters by the north gate, then visits each stall front like a customer. */
export const RAHIM_ROUTE: readonly XZ[] = [
  { x: 0, z: -19 },
  { x: 1, z: -12 },
  { x: -6, z: -10.5 },
  { x: -9.5, z: -2 },
  { x: -7.5, z: 9 },
  { x: 0, z: 13 },
  { x: 7.5, z: 9 },
  { x: 9.5, z: -2 },
  { x: 5, z: -10 },
];

/** Background shoppers. */
export const SHOPPER_ROUTES: readonly (readonly XZ[])[] = [
  [
    { x: -4, z: 6 },
    { x: 4, z: 6 },
    { x: 5, z: -6 },
    { x: -5, z: -6 },
  ],
  [
    { x: 7, z: -12 },
    { x: -8, z: -11 },
    { x: -9, z: 4 },
    { x: 0, z: 9 },
  ],
];

export const BAZAAR_NAV_NODES: readonly XZ[] = [
  ...WATCHMAN_ROUTE,
  ...RAHIM_ROUTE,
  { x: 0, z: 19 },
  { x: 0, z: -19 },
  { x: -4, z: 4 },
  { x: 4, z: 4 },
  { x: 4, z: -4 },
  { x: -4, z: -4 },
  { x: -18, z: 5 },
  { x: 18, z: 5 },
  { x: -18, z: -10 },
  { x: 18, z: -10 },
  { x: 0, z: -19.5 },
];

/** Light pools don't matter in daylight; exposure is uniform (everyone can be seen in the hat). */
export const BAZAAR_LIGHTS: readonly { x: number; z: number; radius: number }[] = [];
