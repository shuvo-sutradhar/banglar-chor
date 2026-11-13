import { create } from 'zustand';
import { LOOT } from '../game/data/loot';
import type { HouseId } from '../game/data/houses';
import { crossedLoadCue, dropItem, loadRatio, pickupItem, type PickupFailure } from '../game/systems/inventory';
import { appendEvent, createRun, resolveNight, type NightOutcome, type RunState } from '../game/systems/runLogic';
import { HOUSES, localToWorld } from '../game/world/layout';
import type { NpcState } from '../game/ai/npcBrain';
import { enterMarket, finishMarket, recordMarketEvent, sellItem, updateMerchant } from '../game/systems/market';
import type { MerchantId } from '../game/data/merchants';
import type { MerchantState } from '../game/systems/bargaining';
import type { MarketOutcome } from '../game/systems/runLogic';

export type DangerLevel = { state: NpcState | 'calm'; suspicion: number; npcNameBn: string | null };

type RunStore = {
  run: RunState | null;
  /** Coarse clock for the HUD (minutes past midnight, updated every 5 game minutes). */
  nightMinutes: number;
  dawnWarning: boolean;
  rahimAwake: boolean;
  /** Seconds left before an awake Rahim grabs a player still inside (null = not counting). */
  rahimGrabIn: number | null;
  danger: DangerLevel;
  inventoryOpen: boolean;
  /** Who made the catch (drives the catch-scene lines). */
  caughtBy: 'mojnu' | 'rahim' | 'dawn' | 'watchman' | null;
  setCaughtBy: (by: 'mojnu' | 'rahim' | 'dawn' | 'watchman' | null) => void;

  // ---- Phase 3 market ----
  /** Merchant whose trade panel is open (phase 'bargain'). */
  activeMerchant: MerchantId | null;
  /** Watchman is looking for the player after an alarm. */
  wanted: boolean;
  /** Rahim-in-the-market recognition meter 0..100 (HUD). */
  rahimRecognition: number;
  /** Which gate the player is standing in (asks to finish the market). */
  exitPrompt: 'north' | 'south' | null;
  enterMarket: (atSec: number) => boolean;
  sell: (instanceId: string, merchantId: MerchantId, price: number, state: MerchantState, atSec: number) => boolean;
  commitMerchant: (merchantId: MerchantId, state: MerchantState) => void;
  recordMarket: (type: 'recognition' | 'excuse' | 'market-alarm' | 'market-chase' | 'sale-refused', atSec: number, context?: string, instanceId?: string) => void;
  finishMarket: (outcome: MarketOutcome, atSec: number) => void;
  setActiveMerchant: (m: MerchantId | null) => void;
  setWanted: (v: boolean) => void;
  setRahimRecognition: (v: number) => void;
  setExitPrompt: (v: 'north' | 'south' | null) => void;

  newRun: (seed: number) => void;
  pickup: (instanceId: string, atSec: number) => { ok: true; cue: number | null } | { ok: false; reason: PickupFailure | 'no-run' };
  drop: (instanceId: string, position: [number, number, number], atSec: number) => boolean;
  markHouseEntered: (house: HouseId, atSec: number) => void;
  markHouseExited: (house: HouseId, atSec: number) => void;
  openHole: (house: HouseId, atSec: number) => void;
  recordEntryFail: (atSec: number) => void;
  recordDetection: (atSec: number, npcId: string) => void;
  recordChase: (atSec: number) => void;
  resolve: (outcome: NightOutcome, atSec: number, by?: 'mojnu' | 'rahim' | 'dawn') => void;
  setNightMinutes: (m: number) => void;
  setDawnWarning: (v: boolean) => void;
  setRahimAwake: (v: boolean) => void;
  setRahimGrabIn: (v: number | null) => void;
  setDanger: (d: DangerLevel) => void;
  setInventoryOpen: (open: boolean) => void;
};

const rahimToWorld = (_house: HouseId, local: [number, number, number]) => localToWorld(HOUSES.rahim, local);

export const useRunStore = create<RunStore>()((set, get) => ({
  run: null,
  nightMinutes: 60,
  dawnWarning: false,
  rahimAwake: false,
  rahimGrabIn: null,
  danger: { state: 'calm', suspicion: 0, npcNameBn: null },
  inventoryOpen: false,
  caughtBy: null,
  setCaughtBy: (caughtBy) => set({ caughtBy }),
  activeMerchant: null,
  wanted: false,
  rahimRecognition: 0,
  exitPrompt: null,
  enterMarket: (atSec) => {
    const run = get().run;
    if (!run) return false;
    const next = enterMarket(run, atSec);
    if (next === run && !run.market) return false;
    set({ run: next, wanted: false, rahimRecognition: 0, activeMerchant: null, exitPrompt: null });
    return true;
  },
  sell: (instanceId, merchantId, price, state, atSec) => {
    const run = get().run;
    if (!run) return false;
    const r = sellItem(run, instanceId, merchantId, price, state, atSec);
    if (!r.ok) return false;
    set({ run: r.run });
    return true;
  },
  commitMerchant: (merchantId, state) => {
    const run = get().run;
    if (run) set({ run: updateMerchant(run, merchantId, state) });
  },
  recordMarket: (type, atSec, context, instanceId) => {
    const run = get().run;
    if (run) set({ run: recordMarketEvent(run, type, atSec, context, instanceId) });
  },
  finishMarket: (outcome, atSec) => {
    const run = get().run;
    if (run) set({ run: finishMarket(run, outcome, atSec), activeMerchant: null, inventoryOpen: false, exitPrompt: null });
  },
  setActiveMerchant: (activeMerchant) => set({ activeMerchant }),
  setWanted: (wanted) => {
    if (get().wanted !== wanted) set({ wanted });
  },
  setRahimRecognition: (v) => {
    const r = Math.round(v / 5) * 5;
    if (get().rahimRecognition !== r) set({ rahimRecognition: r });
  },
  setExitPrompt: (exitPrompt) => {
    if (get().exitPrompt !== exitPrompt) set({ exitPrompt });
  },

  newRun: (seed) =>
    set({
      run: createRun(seed, new Date().toISOString(), rahimToWorld),
      nightMinutes: 60,
      dawnWarning: false,
      rahimAwake: false,
      rahimGrabIn: null,
      danger: { state: 'calm', suspicion: 0, npcNameBn: null },
      inventoryOpen: false,
      caughtBy: null,
      activeMerchant: null,
      wanted: false,
      rahimRecognition: 0,
      exitPrompt: null,
    }),

  pickup: (instanceId, atSec) => {
    const run = get().run;
    if (!run || run.outcome) return { ok: false, reason: 'no-run' };
    const before = loadRatio(run.inventory);
    const r = pickupItem(run, instanceId);
    if (!r.ok) return r;
    const next = appendEvent({ ...run, ...r.state }, { type: 'pickup', atSec, itemId: r.item.lootId, instanceId, value: LOOT[r.item.lootId].baseValue });
    set({ run: next });
    return { ok: true, cue: crossedLoadCue(before, loadRatio(next.inventory)) };
  },

  drop: (instanceId, position, atSec) => {
    const run = get().run;
    if (!run || run.outcome) return false;
    const r = dropItem(run, instanceId, position);
    if (!r.ok) return false;
    set({ run: appendEvent({ ...run, ...r.state }, { type: 'drop', atSec, itemId: r.item.lootId, instanceId }) });
    return true;
  },

  markHouseEntered: (house, atSec) => {
    const run = get().run;
    if (!run) return;
    const entered = run.houseIdsEntered.includes(house) ? run.houseIdsEntered : [...run.houseIdsEntered, house];
    set({ run: appendEvent({ ...run, houseIdsEntered: entered }, { type: 'house-enter', atSec, context: house }) });
  },
  markHouseExited: (house, atSec) => {
    const run = get().run;
    if (run) set({ run: appendEvent(run, { type: 'house-exit', atSec, context: house }) });
  },
  openHole: (house, atSec) => {
    const run = get().run;
    if (!run || run.holesOpened.includes(house)) return;
    set({ run: appendEvent({ ...run, holesOpened: [...run.holesOpened, house] }, { type: 'entry-success', atSec, context: house }) });
  },
  recordEntryFail: (atSec) => {
    const run = get().run;
    if (run) set({ run: appendEvent(run, { type: 'entry-fail', atSec }) });
  },
  recordDetection: (atSec, npcId) => {
    const run = get().run;
    if (run) set({ run: appendEvent({ ...run, detections: run.detections + 1 }, { type: 'alert', atSec, context: npcId }) });
  },
  recordChase: (atSec) => {
    const run = get().run;
    if (run) set({ run: appendEvent({ ...run, chases: run.chases + 1 }, { type: 'chase', atSec }) });
  },
  resolve: (outcome, atSec, by) => {
    const run = get().run;
    if (run) set({ run: resolveNight(run, outcome, atSec, by), inventoryOpen: false });
  },
  setNightMinutes: (nightMinutes) => {
    if (get().nightMinutes !== nightMinutes) set({ nightMinutes });
  },
  setDawnWarning: (dawnWarning) => {
    if (get().dawnWarning !== dawnWarning) set({ dawnWarning });
  },
  setRahimAwake: (rahimAwake) => {
    if (get().rahimAwake !== rahimAwake) set({ rahimAwake });
  },
  setRahimGrabIn: (rahimGrabIn) => {
    if (get().rahimGrabIn !== rahimGrabIn) set({ rahimGrabIn });
  },
  setDanger: (danger) => {
    const d = get().danger;
    // Only publish meaningful changes (state change or ≥5 points) to avoid per-frame renders.
    if (d.state !== danger.state || Math.abs(d.suspicion - danger.suspicion) >= 5 || d.npcNameBn !== danger.npcNameBn) set({ danger });
  },
  setInventoryOpen: (inventoryOpen) => set({ inventoryOpen }),
}));
