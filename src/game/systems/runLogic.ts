import { generateHouseLoot, HOUSE_PROFILES, type HouseId } from '../data/houses';
import { LOOT, lootScoreValue, type LootId } from '../data/loot';
import type { InventoryItem, WorldItem } from './inventory';

export type NightOutcome = 'escaped-with-loot' | 'escaped-empty' | 'caught' | 'dawn-caught';

export type RunEventType = 'pickup' | 'drop' | 'alert' | 'chase' | 'catch' | 'escape' | 'entry-success' | 'entry-fail' | 'house-enter' | 'house-exit' | 'confiscate';

export type RunEvent = {
  id: number;
  atSec: number;
  type: RunEventType;
  itemId?: LootId;
  instanceId?: string;
  value?: number;
  context?: string;
};

export type RunState = {
  id: string;
  seed: number;
  startTimeIso: string;
  houseIdsEntered: readonly HouseId[];
  holesOpened: readonly HouseId[];
  inventory: readonly InventoryItem[];
  worldItems: readonly WorldItem[];
  confiscated: readonly InventoryItem[];
  events: readonly RunEvent[];
  detections: number;
  chases: number;
  caughtCount: number;
  outcome: NightOutcome | null;
};

export type LocalToWorld = (houseId: HouseId, local: [number, number, number]) => [number, number, number];

export function createRun(seed: number, startTimeIso: string, toWorld: LocalToWorld): RunState {
  const placements = generateHouseLoot('rahim', seed);
  const slots = HOUSE_PROFILES.rahim.slots;
  const worldItems: WorldItem[] = placements.map((p) => {
    const slot = slots.find((s) => s.id === p.slotId);
    if (!slot) throw new Error(`Unknown loot slot ${p.slotId}`);
    return { instanceId: p.instanceId, lootId: p.lootId, sourceHouseId: p.houseId, position: toWorld(p.houseId, slot.local), dropped: false };
  });
  return {
    id: `run-${seed.toString(36)}`,
    seed,
    startTimeIso,
    houseIdsEntered: [],
    holesOpened: [],
    inventory: [],
    worldItems,
    confiscated: [],
    events: [],
    detections: 0,
    chases: 0,
    caughtCount: 0,
    outcome: null,
  };
}

export function appendEvent(run: RunState, ev: Omit<RunEvent, 'id'>): RunState {
  return { ...run, events: [...run.events, { ...ev, id: run.events.length + 1 }] };
}

/**
 * Resolve the night exactly once (idempotent). A catch confiscates ALL carried loot (GAME_DESIGN §2);
 * escapes keep inventory unchanged.
 */
export function resolveNight(run: RunState, outcome: NightOutcome, atSec: number): RunState {
  if (run.outcome) return run;
  if (outcome === 'caught' || outcome === 'dawn-caught') {
    let next: RunState = { ...run, outcome, caughtCount: run.caughtCount + 1, confiscated: [...run.confiscated, ...run.inventory], inventory: [] };
    next = appendEvent(next, { type: 'catch', atSec, context: outcome });
    for (const item of run.inventory) next = appendEvent(next, { type: 'confiscate', atSec, itemId: item.lootId, instanceId: item.instanceId, value: LOOT[item.lootId].baseValue });
    return next;
  }
  return appendEvent({ ...run, outcome }, { type: 'escape', atSec, context: outcome });
}

/** Escape outcome depends on what is actually carried at the exit. */
export function escapeOutcome(run: RunState): NightOutcome {
  return run.inventory.length > 0 ? 'escaped-with-loot' : 'escaped-empty';
}

export const SCORE_RULES = {
  cleanEscapeBonus: 500,
  stealthBonusMax: 300,
  stealthPenaltyPerDetection: 100,
  caughtPenalty: 600,
  safeReturnScore: 50,
} as const;

export type NightSummary = {
  outcome: NightOutcome;
  escapedItems: InventoryItem[];
  confiscatedItems: InventoryItem[];
  escapedLootScore: number;
  cleanEscapeBonus: number;
  stealthBonus: number;
  riskBonus: number;
  caughtPenalty: number;
  score: number;
};

/**
 * Provisional night score — a pure function of the run (README §12 subset; market terms arrive in
 * Phase 3). Never negative, always an integer, no double credit.
 */
export function computeNightSummary(run: RunState): NightSummary {
  const outcome = run.outcome ?? escapeOutcome(run);
  const caught = outcome === 'caught' || outcome === 'dawn-caught';
  const escapedItems = caught ? [] : [...run.inventory];
  const escapedLootScore = escapedItems.reduce((s, i) => s + lootScoreValue(i.lootId), 0);
  const entered = run.houseIdsEntered.length > 0;
  const cleanEscapeBonus = !caught && entered && escapedItems.length > 0 ? SCORE_RULES.cleanEscapeBonus : 0;
  const stealthBonus =
    !caught && entered ? Math.max(0, SCORE_RULES.stealthBonusMax - SCORE_RULES.stealthPenaltyPerDetection * run.detections) : 0;
  const riskBonus = !caught && escapedItems.length > 0 ? Math.min(400, Math.max(...run.houseIdsEntered.map((h) => HOUSE_PROFILES[h].riskBonus), 0)) : 0;
  const caughtPenalty = caught ? SCORE_RULES.caughtPenalty : 0;
  const safeReturn = outcome === 'escaped-empty' ? SCORE_RULES.safeReturnScore : 0;
  const raw = escapedLootScore + cleanEscapeBonus + stealthBonus + riskBonus + safeReturn - caughtPenalty;
  const score = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  return { outcome, escapedItems, confiscatedItems: caught ? [...run.confiscated] : [], escapedLootScore, cleanEscapeBonus, stealthBonus, riskBonus, caughtPenalty, score };
}

/** Night clock (GAME_DESIGN §2): 1:00 → 4:30 AM over ~6 real minutes. */
export const NIGHT_CLOCK = {
  startMinutes: 60,
  dawnWarningMinutes: 240,
  endMinutes: 270,
  realSeconds: 360,
} as const;

export function nightMinutesAt(elapsedSec: number): number {
  const { startMinutes, endMinutes, realSeconds } = NIGHT_CLOCK;
  return Math.min(endMinutes, startMinutes + ((endMinutes - startMinutes) * elapsedSec) / realSeconds);
}
