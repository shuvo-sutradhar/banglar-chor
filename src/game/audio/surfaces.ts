/**
 * Sound-design helpers (Phase 4C, docs/AUDIO_DIRECTION.md §8). Pure and unit-tested:
 * - which ground the thief is on (footstep timbre);
 * - per-category pickup sounds;
 * - a no-immediate-repeat variant picker so short sounds don't machine-gun.
 */
import { distanceToPolyline, distanceToRoad, FOOTPATHS, POND, resolveZones, ROAD_WIDTH } from '../world/layout';
import type { LootCategory } from '../data/loot';
import type { SoundId } from './AudioManager';

export type Surface = 'grass' | 'dirt' | 'mud-floor' | 'packed' | 'wet';

/** Ground under a world position. The bazaar is packed earth everywhere. */
export function surfaceAt(x: number, z: number, zone: 'village' | 'bazaar'): Surface {
  if (zone === 'bazaar') return 'packed';
  const p = { x, z };
  if (resolveZones(p).interior) return 'mud-floor';
  if (Math.hypot(x - POND.x, z - POND.z) < POND.radius + 1.2) return 'wet';
  if (distanceToRoad(p) <= ROAD_WIDTH / 2 + 0.3) return 'dirt';
  for (const path of FOOTPATHS) if (distanceToPolyline(p, path) <= 0.9) return 'dirt';
  return 'grass';
}

export const FOOTSTEP_SOUND: Record<Surface, SoundId> = {
  grass: 'step-grass',
  dirt: 'step-dirt',
  'mud-floor': 'step-mud',
  packed: 'step-packed',
  wet: 'step-wet',
};

export const PICKUP_SOUND: Record<LootCategory, SoundId> = {
  metal: 'pickup-metal',
  household: 'pickup-wood',
  electronics: 'pickup-wood',
  livestock: 'cluck',
  jewelry: 'pickup-jingle',
  junk: 'pickup-soft',
};

/**
 * Picks among `n` variants, never the same one twice in a row (per key). `r` in [0, 1).
 * Pure given the memo map, so it's testable.
 */
export function pickVariant(memo: Map<string, number>, key: string, n: number, r: number): number {
  if (n <= 1) return 0;
  const last = memo.get(key) ?? -1;
  let i = Math.floor(r * (n - (last >= 0 ? 1 : 0)));
  if (last >= 0 && i >= last) i++;
  memo.set(key, i);
  return i;
}
