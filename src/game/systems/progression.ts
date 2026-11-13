/**
 * Persistent progression between nights (docs/ECONOMY_AND_PROGRESSION.md): saved money, energy,
 * owned/equipped equipment, supplies, the next-night food buff and the village's memory.
 *
 * Every operation is a pure function `profile → result` so it can be tested exhaustively and
 * applied atomically by the store. Guarantees:
 * - a run's earnings are banked exactly once (by run id);
 * - every purchase carries a transaction id and is applied at most once (double clicks,
 *   duplicated events, re-dispatch after an error);
 * - money never goes negative; the free meal / nap are limited to once per day.
 * localStorage is NOT tamper-proof: these are honest-play guarantees, not anti-cheat.
 */
import { z } from 'zod';
import { EQUIPMENT_BY_ID, ENERGY_RULES, FOOD_BY_ID, STARTER_EQUIPPED, SUPPLIES, type EquipMods, type EquipmentId, type EquipSlot, type FoodEffectId, type FoodId, type SupplyId } from '../data/economy';

const equipIds = Object.keys(EQUIPMENT_BY_ID) as [EquipmentId, ...EquipmentId[]];
const effectIds = ['sharp-eyes', 'second-wind', 'big-lungs'] as const;

export const MAX_TX_IDS = 80;
export const MAX_CREDITED = 50;

export const profileSchema = z.object({
  /** Persistent saved money (taka). */
  bank: z.number().int().nonnegative(),
  lifetimeEarned: z.number().int().nonnegative(),
  spentFood: z.number().int().nonnegative(),
  spentUpgrades: z.number().int().nonnegative(),
  /** Overall energy 0–100. */
  energy: z.number().min(0).max(100),
  owned: z.array(z.enum(equipIds)),
  equipped: z.object({ tool: z.enum(equipIds), bag: z.enum(equipIds), footwear: z.enum(equipIds) }),
  supplies: z.object({ 'gur-chira': z.number().int().min(0).max(9) }),
  /** Temporary food effect for the NEXT night only. */
  buff: z.enum(effectIds).nullable(),
  /** Nights started (the "day" counter). */
  day: z.number().int().nonnegative(),
  freeMealDay: z.number().int(),
  napDay: z.number().int(),
  /** Run ids already banked (bounded, newest last). */
  creditedRuns: z.array(z.string().max(64)).max(MAX_CREDITED),
  /** Transaction ids already applied (bounded, newest last). */
  txIds: z.array(z.string().max(64)).max(MAX_TX_IDS),
  /** Village memory of the thief's recent nights (Stage 5). */
  heat: z.number().min(0).max(100),
  lastIncident: z.enum(['none', 'seen', 'chased', 'caught', 'robbed']),
});

export type Profile = z.output<typeof profileSchema>;

export function createProfile(): Profile {
  return {
    bank: 0,
    lifetimeEarned: 0,
    spentFood: 0,
    spentUpgrades: 0,
    energy: ENERGY_RULES.start,
    owned: Object.values(STARTER_EQUIPPED),
    equipped: { ...STARTER_EQUIPPED },
    supplies: { 'gur-chira': 0 },
    buff: null,
    day: 0,
    freeMealDay: -1,
    napDay: -1,
    creditedRuns: [],
    txIds: [],
    heat: 0,
    lastIncident: 'none',
  };
}

export type Failure = 'funds' | 'owned' | 'not-owned' | 'daily-limit' | 'full' | 'unknown' | 'duplicate' | 'none-left';
export type OpResult = { ok: true; profile: Profile } | { ok: false; reason: Failure; profile: Profile };

const fail = (profile: Profile, reason: Failure): OpResult => ({ ok: false, reason, profile });

function withTx(p: Profile, txId: string): Profile {
  return { ...p, txIds: [...p.txIds, txId].slice(-MAX_TX_IDS) };
}

const seen = (p: Profile, txId: string) => p.txIds.includes(txId);

/** Combined modifiers of everything equipped. */
export function equippedMods(p: Pick<Profile, 'equipped'>): Required<EquipMods> {
  const m: Required<EquipMods> = { entryProgress: 1, entryNoise: 1, entryStamina: 1, carryKg: 0, footstepNoise: 1, sprintCost: 1, runSpeed: 1 };
  for (const slot of ['tool', 'bag', 'footwear'] as EquipSlot[]) {
    const mods = EQUIPMENT_BY_ID[p.equipped[slot]].mods;
    m.entryProgress *= mods.entryProgress ?? 1;
    m.entryNoise *= mods.entryNoise ?? 1;
    m.entryStamina *= mods.entryStamina ?? 1;
    m.carryKg += mods.carryKg ?? 0;
    m.footstepNoise *= mods.footstepNoise ?? 1;
    m.sprintCost *= mods.sprintCost ?? 1;
    m.runSpeed *= mods.runSpeed ?? 1;
  }
  return m;
}

export function eat(p: Profile, foodId: FoodId, txId: string): OpResult {
  if (seen(p, txId)) return fail(p, 'duplicate');
  const food = FOOD_BY_ID[foodId];
  if (!food) return fail(p, 'unknown');
  if (food.oncePerDay && p.freeMealDay === p.day) return fail(p, 'daily-limit');
  if (p.bank < food.cost) return fail(p, 'funds');
  if (p.energy >= 100 && !food.effect) return fail(p, 'full');
  const next: Profile = {
    ...p,
    bank: p.bank - food.cost,
    spentFood: p.spentFood + food.cost,
    energy: Math.min(100, p.energy + food.energy),
    // A stronger effect replaces a weaker one; the last meal before the night counts.
    buff: food.effect ?? p.buff,
    freeMealDay: food.oncePerDay ? p.day : p.freeMealDay,
  };
  return { ok: true, profile: withTx(next, txId) };
}

/** Free nap: once per day. */
export function nap(p: Profile, txId: string): OpResult {
  if (seen(p, txId)) return fail(p, 'duplicate');
  if (p.napDay === p.day) return fail(p, 'daily-limit');
  if (p.energy >= 100) return fail(p, 'full');
  return { ok: true, profile: withTx({ ...p, energy: Math.min(100, p.energy + ENERGY_RULES.napEnergy), napDay: p.day }, txId) };
}

export function buyEquipment(p: Profile, id: EquipmentId, txId: string): OpResult {
  if (seen(p, txId)) return fail(p, 'duplicate');
  const item = EQUIPMENT_BY_ID[id];
  if (!item) return fail(p, 'unknown');
  if (p.owned.includes(id)) return fail(p, 'owned');
  if (p.bank < item.cost) return fail(p, 'funds');
  const next: Profile = {
    ...p,
    bank: p.bank - item.cost,
    spentUpgrades: p.spentUpgrades + item.cost,
    owned: [...p.owned, id],
    // Buying equips it (the player can switch back at any time).
    equipped: { ...p.equipped, [item.slot]: id },
  };
  return { ok: true, profile: withTx(next, txId) };
}

export function equip(p: Profile, id: EquipmentId): OpResult {
  const item = EQUIPMENT_BY_ID[id];
  if (!item) return fail(p, 'unknown');
  if (!p.owned.includes(id)) return fail(p, 'not-owned');
  return { ok: true, profile: { ...p, equipped: { ...p.equipped, [item.slot]: id } } };
}

export function buySupply(p: Profile, id: SupplyId, txId: string): OpResult {
  if (seen(p, txId)) return fail(p, 'duplicate');
  const s = SUPPLIES[id];
  if (!s) return fail(p, 'unknown');
  if (p.supplies[id] >= s.max) return fail(p, 'full');
  if (p.bank < s.cost) return fail(p, 'funds');
  return { ok: true, profile: withTx({ ...p, bank: p.bank - s.cost, spentUpgrades: p.spentUpgrades + s.cost, supplies: { ...p.supplies, [id]: p.supplies[id] + 1 } }, txId) };
}

/** Night start: the loadout used tonight. Consumes the food buff and advances the day. */
export type NightLoadout = { energy: number; mods: Required<EquipMods>; buff: FoodEffectId | null; supplies: Record<SupplyId, number>; day: number; heat: number; lastIncident: Profile['lastIncident'] };

export function startNight(p: Profile): { profile: Profile; loadout: NightLoadout } {
  const loadout: NightLoadout = { energy: p.energy, mods: equippedMods(p), buff: p.buff, supplies: { ...p.supplies }, day: p.day + 1, heat: p.heat, lastIncident: p.lastIncident };
  return { profile: { ...p, buff: null, day: p.day + 1 }, loadout };
}

/** What the night/market changed, reported once at the end of the run. */
export type RunSettlement = {
  runId: string;
  /** Money kept after the bazaar (after fines). */
  money: number;
  energyEnd: number;
  /** Supplies still unused. */
  suppliesLeft: Record<SupplyId, number>;
  detections: number;
  chases: number;
  caught: boolean;
  robbed: boolean;
};

/** Village memory (Stage 5): fades by half each night, grows with what villagers saw. */
export function nextHeat(heat: number, s: Pick<RunSettlement, 'detections' | 'chases' | 'caught' | 'robbed'>): number {
  const raw = heat * 0.5 + s.detections * 10 + s.chases * 12 + (s.caught ? 25 : 0) + (s.robbed ? 10 : 0);
  return Math.round(Math.min(100, Math.max(0, raw)));
}

export function incidentOf(s: Pick<RunSettlement, 'detections' | 'chases' | 'caught' | 'robbed'>): Profile['lastIncident'] {
  if (s.caught) return 'caught';
  if (s.chases > 0) return 'chased';
  if (s.detections > 0) return 'seen';
  if (s.robbed) return 'robbed';
  return 'none';
}

/** Bank a finished run exactly once (idempotent by run id). */
export function settleRun(p: Profile, s: RunSettlement): OpResult {
  if (p.creditedRuns.includes(s.runId)) return fail(p, 'duplicate');
  const money = Math.max(0, Math.floor(s.money));
  const next: Profile = {
    ...p,
    bank: p.bank + money,
    lifetimeEarned: p.lifetimeEarned + money,
    energy: Math.min(100, Math.max(ENERGY_RULES.floor, s.energyEnd)),
    supplies: { ...s.suppliesLeft },
    heat: nextHeat(p.heat, s),
    lastIncident: incidentOf(s),
    creditedRuns: [...p.creditedRuns, s.runId].slice(-MAX_CREDITED),
  };
  return { ok: true, profile: next };
}

/** Spend one supply during the night (in-run copy of the counts; saved at settlement). */
export function useSupply(counts: Record<SupplyId, number>, id: SupplyId): Record<SupplyId, number> | null {
  if ((counts[id] ?? 0) <= 0) return null;
  return { ...counts, [id]: counts[id] - 1 };
}
