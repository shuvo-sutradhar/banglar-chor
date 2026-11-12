import { createRng } from '../../lib/rng';
import type { LootId } from './loot';
import type { EntryConfig } from '../systems/entryChallenge';

export type HouseId = 'rahim' | 'kuddus' | 'morol';

export type LootSlot = {
  id: string;
  /** Position in the house's LOCAL frame (front = +z), y = base height. */
  local: [number, number, number];
  /** Weighted candidates; `null` means the slot may be empty. */
  candidates: readonly { lootId: LootId | null; weight: number }[];
};

export type HouseProfile = {
  id: HouseId;
  nameBn: string;
  enterable: boolean;
  /** 0..400 risk bonus at settlement (README §12). */
  riskBonus: number;
  entry: EntryConfig;
  slots: readonly LootSlot[];
};

/**
 * Rahim Chacha's mud house: easy entry, modest items, sleepy homeowner, hen surprise.
 * Kuddus and Morol become enterable in Phase 5; their profiles exist so data stays uniform.
 */
export const HOUSE_PROFILES: Readonly<Record<HouseId, HouseProfile>> = {
  rahim: {
    id: 'rahim',
    nameBn: 'রহিম চাচার মাটির ঘর',
    enterable: true,
    riskBonus: 100,
    entry: {
      beatInterval: 1.05,
      firstBeatDelay: 1.6,
      perfectWindow: 0.08,
      goodWindow: 0.17,
      progressPerfect: 20,
      progressGood: 12,
      noiseMiss: 22,
      noiseLapse: 9,
      noiseHit: 2,
      noiseDecayPerSec: 3.5,
    },
    slots: [
      { id: 'shelf-left', local: [-2.5, 1.26, -1.1], candidates: [{ lootId: 'old-radio', weight: 3 }, { lootId: 'alarm-clock', weight: 1 }] },
      { id: 'shelf-mid', local: [-2.5, 1.26, -0.4], candidates: [{ lootId: 'lantern', weight: 1 }] },
      { id: 'shelf-right', local: [-2.5, 1.26, 0.3], candidates: [{ lootId: 'alarm-clock', weight: 3 }, { lootId: 'broken-torch', weight: 1 }] },
      { id: 'floor-corner', local: [-2.2, 0.3, 1.55], candidates: [{ lootId: 'brass-pot', weight: 1 }] },
      { id: 'mat', local: [-0.9, 0.32, 0.9], candidates: [{ lootId: 'metal-plate', weight: 3 }, { lootId: 'brass-pot', weight: 1 }] },
      { id: 'basket', local: [0.2, 0.3, 1.45], candidates: [{ lootId: 'chicken', weight: 4 }, { lootId: null, weight: 1 }] },
      { id: 'trunk-top', local: [1.95, 0.82, 1.45], candidates: [{ lootId: 'fake-jewelry', weight: 19 }, { lootId: 'actual-jewelry', weight: 1 }] },
      { id: 'cot-side', local: [0.95, 0.3, -1.55], candidates: [{ lootId: 'dentures', weight: 2 }, { lootId: 'broken-torch', weight: 1 }] },
    ],
  },
  kuddus: {
    id: 'kuddus', nameBn: 'কুদ্দুস মেম্বারের বাড়ি', enterable: false, riskBonus: 250,
    entry: { beatInterval: 0.9, firstBeatDelay: 1.6, perfectWindow: 0.07, goodWindow: 0.14, progressPerfect: 18, progressGood: 10, noiseMiss: 25, noiseLapse: 10, noiseHit: 3, noiseDecayPerSec: 3 },
    slots: [],
  },
  morol: {
    id: 'morol', nameBn: 'মোড়ল বাড়ির টিনের ঘর', enterable: false, riskBonus: 400,
    entry: { beatInterval: 0.8, firstBeatDelay: 1.6, perfectWindow: 0.06, goodWindow: 0.12, progressPerfect: 16, progressGood: 9, noiseMiss: 28, noiseLapse: 12, noiseHit: 4, noiseDecayPerSec: 2.5 },
    slots: [],
  },
};

export type LootPlacement = { instanceId: string; lootId: LootId; slotId: string; houseId: HouseId };

/** Deterministic loot generation per house and run seed (simulation RNG, not cosmetic). */
export function generateHouseLoot(houseId: HouseId, seed: number): LootPlacement[] {
  const profile = HOUSE_PROFILES[houseId];
  const rng = createRng((seed ^ (houseId.length * 0x9e3779b1)) >>> 0);
  const out: LootPlacement[] = [];
  for (const slot of profile.slots) {
    const total = slot.candidates.reduce((s, c) => s + c.weight, 0);
    let roll = rng.next() * total;
    let chosen: LootId | null = null;
    for (const c of slot.candidates) {
      roll -= c.weight;
      if (roll <= 0) {
        chosen = c.lootId;
        break;
      }
    }
    if (chosen) out.push({ instanceId: `${houseId}:${slot.id}:${seed >>> 0}`, lootId: chosen, slotId: slot.id, houseId });
  }
  return out;
}
