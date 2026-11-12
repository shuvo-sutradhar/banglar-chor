export type InteractionKind = 'inspect' | 'pick_up' | 'enter' | 'hide' | 'talk' | 'sell' | 'exit';

/** Shared interaction contract (README §7). */
export type InteractionTarget = {
  id: string;
  kind: InteractionKind;
  labelBn: string;
  maxDistance: number;
  enabled: boolean;
};

export type Point3 = { x: number; y: number; z: number };

export type RegisteredTarget = InteractionTarget & {
  /** World-space focus point used for distance and line-of-sight checks. */
  position: Point3;
  onInteract: () => void;
  /** For pick-up targets: which loot item (drives the HUD inspect card). */
  lootId?: string;
  /**
   * How close to the target point an occluding hit may be and still count as visible.
   * Large targets that sit inside their own collider (a house front) need ~0.9 m; small items
   * need almost none, otherwise they could be grabbed through a wall.
   */
  losTolerance?: number;
};

export type FocusQuery = {
  playerPosition: Point3;
  /** Normalized horizontal facing direction of the player. */
  playerForward: { x: number; z: number };
  /** Optional occlusion test; return true if the target is visible from the player. */
  hasLineOfSight?: (target: RegisteredTarget, distance: number) => boolean;
};

/**
 * Score: prefer targets in front of the player, then nearer ones.
 * Targets behind the player (beyond ~110 degrees) are only chosen when very close.
 */
export function scoreTarget(target: RegisteredTarget, query: FocusQuery): number | null {
  if (!target.enabled) return null;
  const dx = target.position.x - query.playerPosition.x;
  const dy = target.position.y - query.playerPosition.y;
  const dz = target.position.z - query.playerPosition.z;
  const horizontal = Math.hypot(dx, dz);
  const distance = Math.hypot(horizontal, dy * 0.5);
  if (distance > target.maxDistance) return null;
  const facing = horizontal > 1e-3 ? (dx * query.playerForward.x + dz * query.playerForward.z) / horizontal : 1;
  if (facing < -0.35 && distance > 1.2) return null;
  // Lower is better. Facing bonus up to 40% of the reach.
  return distance / target.maxDistance - 0.4 * facing;
}

export class InteractionRegistry {
  private readonly targets = new Map<string, RegisteredTarget>();

  register(target: RegisteredTarget): () => void {
    if (this.targets.has(target.id)) {
      throw new Error(`Duplicate interaction target id: ${target.id}`);
    }
    this.targets.set(target.id, target);
    return () => {
      if (this.targets.get(target.id) === target) this.targets.delete(target.id);
    };
  }

  get(id: string): RegisteredTarget | undefined {
    return this.targets.get(id);
  }

  get size(): number {
    return this.targets.size;
  }

  findFocus(query: FocusQuery): RegisteredTarget | null {
    let best: RegisteredTarget | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const target of this.targets.values()) {
      const score = scoreTarget(target, query);
      if (score === null || score >= bestScore) continue;
      if (query.hasLineOfSight) {
        const p = query.playerPosition;
        const d = Math.hypot(target.position.x - p.x, target.position.y - p.y, target.position.z - p.z);
        if (!query.hasLineOfSight(target, d)) continue;
      }
      best = target;
      bestScore = score;
    }
    return best;
  }

  /**
   * Attempt to interact with `focusId`. Re-validates range so a stale focus can never
   * trigger an out-of-range interaction. Returns whether the interaction ran.
   */
  interact(focusId: string | null, query: FocusQuery): boolean {
    if (!focusId) return false;
    const target = this.targets.get(focusId);
    if (!target) return false;
    if (scoreTarget(target, query) === null) return false;
    target.onInteract();
    return true;
  }
}
