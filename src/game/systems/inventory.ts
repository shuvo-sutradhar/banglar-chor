import { LOOT, type LootId } from '../data/loot';
import type { HouseId } from '../data/houses';

/** Maximum effective carrying capacity in kg (README §8 greed system). */
export const CARRY_CAPACITY_KG = 6;

export type InventoryItem = { instanceId: string; lootId: LootId; sourceHouseId: HouseId };
export type WorldItem = InventoryItem & { position: [number, number, number]; dropped: boolean };

export type ItemsState = { inventory: readonly InventoryItem[]; worldItems: readonly WorldItem[] };

export type PickupFailure = 'missing' | 'duplicate' | 'over-capacity';
export type PickupResult = { ok: true; state: ItemsState; item: InventoryItem } | { ok: false; reason: PickupFailure };
export type DropResult = { ok: true; state: ItemsState; item: WorldItem } | { ok: false; reason: 'missing' };

export function totalWeight(items: readonly InventoryItem[]): number {
  // Sum in tenths to avoid floating-point drift (0.1 + 0.2 ...).
  return items.reduce((s, i) => s + Math.round(LOOT[i.lootId].weight * 10), 0) / 10;
}

export function loadRatio(items: readonly InventoryItem[]): number {
  return Math.min(1, totalWeight(items) / CARRY_CAPACITY_KG);
}

export function canCarry(items: readonly InventoryItem[], lootId: LootId): boolean {
  return Math.round((totalWeight(items) + LOOT[lootId].weight) * 10) <= CARRY_CAPACITY_KG * 10;
}

export function estimatedValueTotal(items: readonly InventoryItem[]): number {
  return items.reduce((s, i) => s + LOOT[i.lootId].baseValue, 0);
}

/** Atomic pickup: the item leaves the world and enters the inventory exactly once. */
export function pickupItem(state: ItemsState, instanceId: string): PickupResult {
  if (state.inventory.some((i) => i.instanceId === instanceId)) return { ok: false, reason: 'duplicate' };
  const world = state.worldItems.find((w) => w.instanceId === instanceId);
  if (!world) return { ok: false, reason: 'missing' };
  if (!canCarry(state.inventory, world.lootId)) return { ok: false, reason: 'over-capacity' };
  const item: InventoryItem = { instanceId: world.instanceId, lootId: world.lootId, sourceHouseId: world.sourceHouseId };
  return {
    ok: true,
    item,
    state: { inventory: [...state.inventory, item], worldItems: state.worldItems.filter((w) => w.instanceId !== instanceId) },
  };
}

/** Atomic drop: the item leaves the inventory and reappears in the world at `position`. */
export function dropItem(state: ItemsState, instanceId: string, position: [number, number, number]): DropResult {
  const item = state.inventory.find((i) => i.instanceId === instanceId);
  if (!item) return { ok: false, reason: 'missing' };
  const world: WorldItem = { ...item, position, dropped: true };
  return {
    ok: true,
    item: world,
    state: { inventory: state.inventory.filter((i) => i.instanceId !== instanceId), worldItems: [...state.worldItems, world] },
  };
}

export const LOAD_CUES = [0.6, 0.85, 1] as const;

/** Returns the highest load threshold crossed upward between two ratios, or null. */
export function crossedLoadCue(before: number, after: number): (typeof LOAD_CUES)[number] | null {
  let crossed: (typeof LOAD_CUES)[number] | null = null;
  for (const cue of LOAD_CUES) if (before < cue - 1e-9 && after >= cue - 1e-9) crossed = cue;
  return crossed;
}
