import { describe, expect, it } from 'vitest';
import { distanceToRoad, isClearForScatter, pointInZone, resolveZones, ZONES, HOUSES, POND } from '../game/world/layout';
import { buildVegetationLayout } from '../game/world/vegetationLayout';
import { PLAYER_SPAWN } from '../game/data/tuning';

describe('village layout', () => {
  it('interior zone wins inside the cowshed and drives the interior camera', () => {
    const r = resolveZones({ x: -12.5, z: 24 });
    expect(r.interior).toBe(true);
    expect(r.label?.id).toBe('cowshed-inside');
  });
  it('house yards report their names; open road reports nothing', () => {
    expect(resolveZones({ x: -9, z: 6 }).label?.labelBn).toBe('রহিম চাচার মাটির ঘর');
    expect(resolveZones({ x: 0, z: 30 }).label).toBeNull();
  });
  it('spawn point is on the road and outside every zone', () => {
    expect(distanceToRoad({ x: PLAYER_SPAWN[0], z: PLAYER_SPAWN[2] })).toBeLessThan(1);
    for (const z of ZONES) expect(pointInZone({ x: PLAYER_SPAWN[0], z: PLAYER_SPAWN[2] }, z)).toBe(false);
  });
  it('vegetation never blocks the road, houses or pond (no impossible paths)', () => {
    const layout = buildVegetationLayout();
    const all = [...layout.groves, ...layout.palms, ...layout.bananas];
    for (const p of all) {
      const onBoundary = Math.max(Math.abs(p.x), Math.abs(p.z)) > 37;
      if (onBoundary) continue;
      expect(distanceToRoad(p)).toBeGreaterThan(3);
      expect(Math.hypot(p.x - HOUSES.rahim.x, p.z - HOUSES.rahim.z)).toBeGreaterThan(7);
      expect(Math.hypot(p.x - POND.x, p.z - POND.z)).toBeGreaterThan(POND.radius + 2);
    }
    expect(isClearForScatter({ x: 0, z: 10 }, 3)).toBe(false);
  });
  it('layout is deterministic', () => {
    expect(buildVegetationLayout()).toEqual(buildVegetationLayout());
  });
});
