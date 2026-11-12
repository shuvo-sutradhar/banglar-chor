import type { XZ } from './npcBrain';

/**
 * Tiny navigation layer: static obstacle footprints + a hand-placed waypoint graph with A*.
 * Used when the straight line to a target is blocked (e.g. walking around Rahim's house).
 * README §7 allows simple waypoint navigation in small spaces; this is real pathfinding,
 * not random circling.
 */
export type RectObstacle = { kind: 'rect'; minX: number; maxX: number; minZ: number; maxZ: number };
export type CircleObstacle = { kind: 'circle'; x: number; z: number; r: number };
export type Obstacle = RectObstacle | CircleObstacle;

export function segmentHitsRect(a: XZ, b: XZ, r: RectObstacle, inflate: number): boolean {
  const minX = r.minX - inflate;
  const maxX = r.maxX + inflate;
  const minZ = r.minZ - inflate;
  const maxZ = r.maxZ + inflate;
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, a.x - minX) && clip(dx, maxX - a.x) && clip(-dz, a.z - minZ) && clip(dz, maxZ - a.z) && t0 <= t1;
}

export function segmentHitsCircle(a: XZ, b: XZ, c: CircleObstacle, inflate: number): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2));
  return Math.hypot(a.x + dx * t - c.x, a.z + dz * t - c.z) < c.r + inflate;
}

export function segmentClear(a: XZ, b: XZ, obstacles: readonly Obstacle[], inflate: number): boolean {
  for (const o of obstacles) {
    if (o.kind === 'rect' ? segmentHitsRect(a, b, o, inflate) : segmentHitsCircle(a, b, o, inflate)) return false;
  }
  return true;
}

export class NavGraph {
  readonly nodes: readonly XZ[];
  private readonly edges: number[][];
  private readonly obstacles: readonly Obstacle[];
  private readonly inflate: number;

  constructor(nodes: readonly XZ[], obstacles: readonly Obstacle[], inflate = 0.45) {
    this.nodes = nodes;
    this.obstacles = obstacles;
    this.inflate = inflate;
    this.edges = nodes.map((a, i) => nodes.map((b, j) => (i !== j && segmentClear(a, b, obstacles, inflate) ? j : -1)).filter((j) => j >= 0));
  }

  clear(a: XZ, b: XZ): boolean {
    return segmentClear(a, b, this.obstacles, this.inflate);
  }

  neighbours(i: number): readonly number[] {
    return this.edges[i] ?? [];
  }

  /** Returns waypoints to follow (excluding `from`, ending with `to`). Falls back to direct. */
  findPath(from: XZ, to: XZ): XZ[] {
    if (this.clear(from, to)) return [to];
    const d = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z);
    const starts = this.nodes.map((n, i) => (this.clear(from, n) ? i : -1)).filter((i) => i >= 0);
    const goals = new Set(this.nodes.map((n, i) => (this.clear(n, to) ? i : -1)).filter((i) => i >= 0));
    if (starts.length === 0 || goals.size === 0) return [to];
    const g = new Map<number, number>();
    const f = new Map<number, number>();
    const came = new Map<number, number>();
    const open = new Set<number>();
    for (const s of starts) {
      const node = this.nodes[s] as XZ;
      g.set(s, d(from, node));
      f.set(s, d(from, node) + d(node, to));
      open.add(s);
    }
    while (open.size) {
      let current = -1;
      let best = Number.POSITIVE_INFINITY;
      for (const i of open) {
        const v = f.get(i) ?? Number.POSITIVE_INFINITY;
        if (v < best) {
          best = v;
          current = i;
        }
      }
      if (goals.has(current)) {
        const path: XZ[] = [to];
        let c: number | undefined = current;
        while (c !== undefined) {
          path.unshift(this.nodes[c] as XZ);
          c = came.get(c);
        }
        return path;
      }
      open.delete(current);
      const cn = this.nodes[current] as XZ;
      for (const n of this.neighbours(current)) {
        const tentative = (g.get(current) ?? 0) + d(cn, this.nodes[n] as XZ);
        if (tentative < (g.get(n) ?? Number.POSITIVE_INFINITY)) {
          came.set(n, current);
          g.set(n, tentative);
          f.set(n, tentative + d(this.nodes[n] as XZ, to));
          open.add(n);
        }
      }
    }
    return [to];
  }
}
