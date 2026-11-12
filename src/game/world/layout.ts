/**
 * Village layout data (pure, no three.js) shared by visuals, colliders, zones and tests.
 * Coordinates: metres, +Y up, the village entrance is at +Z (south), the far end at -Z (north).
 */
export type XZ = { x: number; z: number };

export type Placement = { x: number; z: number; rotY: number };

/** Dirt road centreline (Catmull-Rom control points). */
export const ROAD_POINTS: readonly XZ[] = [
  { x: 0, z: 46 },
  { x: 1, z: 30 },
  { x: -1.5, z: 17 },
  { x: 1.5, z: 4 },
  { x: 0, z: -8 },
  { x: -2.5, z: -22 },
  { x: 0, z: -46 },
];
export const ROAD_WIDTH = 3.6;

export const HOUSES = {
  rahim: { x: -12, z: 6, rotY: Math.PI / 2 },
  kuddus: { x: 13, z: -4, rotY: -Math.PI / 2 },
  morol: { x: -11, z: -20, rotY: Math.PI / 2 },
} as const satisfies Record<string, Placement>;

export const COWSHED: Placement = { x: -12, z: 24, rotY: Math.PI / 2 };
export const TEA_STALL: Placement = { x: 5.6, z: 9, rotY: -Math.PI / 2 };
export const POND = { x: 13, z: 19, radius: 6 } as const;

/** Footpaths from the road to each house front. */
export const FOOTPATHS: readonly (readonly XZ[])[] = [
  [{ x: -0.5, z: 6 }, { x: -5, z: 6.4 }, { x: -9, z: 6 }],
  [{ x: 1.5, z: -4 }, { x: 5, z: -4.4 }, { x: 8.2, z: -4 }],
  [{ x: -2, z: -20 }, { x: -5.5, z: -19.6 }, { x: -8.2, z: -20 }],
  [{ x: 0.5, z: 24 }, { x: -5, z: 24.3 }, { x: -9.5, z: 24 }],
  [{ x: -1, z: 17 }, { x: 3.5, z: 18.5 }, { x: 6.6, z: 18.6 }],
];

/** Zones are oriented boxes used for HUD labels and camera presets. */
export type Zone = {
  id: string;
  labelBn: string;
  center: XZ;
  halfX: number;
  halfZ: number;
  rotY: number;
  interior: boolean;
};

export const ZONES: readonly Zone[] = [
  { id: 'rahim-yard', labelBn: 'রহিম চাচার মাটির ঘর', center: { x: -11, z: 6 }, halfX: 5.5, halfZ: 6, rotY: 0, interior: false },
  { id: 'kuddus-yard', labelBn: 'কুদ্দুস মেম্বারের বাড়ি', center: { x: 13, z: -4 }, halfX: 7, halfZ: 6.5, rotY: 0, interior: false },
  { id: 'morol-yard', labelBn: 'মোড়ল বাড়ির টিনের ঘর', center: { x: -11, z: -20 }, halfX: 5.5, halfZ: 6.5, rotY: 0, interior: false },
  { id: 'pond', labelBn: 'পুকুরঘাট', center: { x: 13, z: 19 }, halfX: 8.2, halfZ: 8.2, rotY: 0, interior: false },
  { id: 'tea-stall', labelBn: 'বন্ধ চায়ের দোকান', center: { x: 5.6, z: 9 }, halfX: 2.6, halfZ: 2.6, rotY: 0, interior: false },
  // Cowshed interior (under the roof) — switches to the tight interior camera preset.
  { id: 'cowshed-inside', labelBn: 'গোয়ালঘর (ভেতরে)', center: { x: -12.1, z: 24 }, halfX: 1.9, halfZ: 2.35, rotY: 0, interior: true },
  { id: 'cowshed', labelBn: 'গোয়ালঘর', center: { x: -12, z: 24 }, halfX: 4.5, halfZ: 4.5, rotY: 0, interior: false },
];

export function pointInZone(point: XZ, zone: Zone): boolean {
  const dx = point.x - zone.center.x;
  const dz = point.z - zone.center.z;
  const c = Math.cos(-zone.rotY);
  const s = Math.sin(-zone.rotY);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= zone.halfX && Math.abs(lz) <= zone.halfZ;
}

/** Most specific zone wins: interior zones and smaller zones take priority. */
export function resolveZones(point: XZ, zones: readonly Zone[] = ZONES): { label: Zone | null; interior: boolean } {
  let label: Zone | null = null;
  let interior = false;
  for (const zone of zones) {
    if (!pointInZone(point, zone)) continue;
    if (zone.interior) interior = true;
    if (!label || zone.halfX * zone.halfZ < label.halfX * label.halfZ) label = zone;
  }
  return { label, interior };
}

/** Sample a Catmull-Rom (centripetal-free, uniform) polyline — matches three's CatmullRomCurve3 default closely enough for placement rules. */
export function sampleCatmullRom(points: readonly XZ[], samplesPerSegment: number): XZ[] {
  const out: XZ[] = [];
  const get = (i: number): XZ => points[Math.max(0, Math.min(points.length - 1, i))] as XZ;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let k = 0; k < samplesPerSegment; k++) {
      const t = k / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push(get(points.length - 1));
  return out;
}

const ROAD_SAMPLES = sampleCatmullRom(ROAD_POINTS, 12);

export function distanceToPolyline(p: XZ, line: readonly XZ[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i] as XZ;
    const b = line[i + 1] as XZ;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
    const d = Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
    if (d < best) best = d;
  }
  return best;
}

export function distanceToRoad(p: XZ): number {
  return distanceToPolyline(p, ROAD_SAMPLES);
}

/** Keep-out circles for scattered vegetation (houses, pond, stalls, spawn). */
export const KEEP_OUT: readonly { x: number; z: number; r: number }[] = [
  { x: HOUSES.rahim.x, z: HOUSES.rahim.z, r: 7.5 },
  { x: HOUSES.kuddus.x, z: HOUSES.kuddus.z, r: 9 },
  { x: HOUSES.morol.x, z: HOUSES.morol.z, r: 8 },
  { x: COWSHED.x, z: COWSHED.z, r: 5.5 },
  { x: TEA_STALL.x, z: TEA_STALL.z, r: 3.5 },
  { x: POND.x, z: POND.z, r: POND.radius + 2.5 },
  { x: 1.2, z: 34, r: 4 },
];

export function isClearForScatter(p: XZ, roadClearance: number, extraRadius = 0): boolean {
  if (distanceToRoad(p) < roadClearance) return false;
  for (const path of FOOTPATHS) if (distanceToPolyline(p, path) < 1.6 + extraRadius) return false;
  for (const k of KEEP_OUT) if (Math.hypot(p.x - k.x, p.z - k.z) < k.r + extraRadius) return false;
  return true;
}
