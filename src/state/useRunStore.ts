import { create } from 'zustand';
import { LOOT } from '../game/data/loot';
import type { HouseId } from '../game/data/houses';
import { crossedLoadCue, dropItem, loadRatio, pickupItem, type PickupFailure } from '../game/systems/inventory';
import { appendEvent, createRun, resolveNight, type NightOutcome, type RunState } from '../game/systems/runLogic';
import { HOUSES, localToWorld } from '../game/world/layout';
import type { NpcState } from '../game/ai/npcBrain';

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
  caughtBy: 'mojnu' | 'rahim' | 'dawn' | null;
  setCaughtBy: (by: 'mojnu' | 'rahim' | 'dawn' | null) => void;

  newRun: (seed: number) => void;
  pickup: (instanceId: string, atSec: number) => { ok: true; cue: number | null } | { ok: false; reason: PickupFailure | 'no-run' };
  drop: (instanceId: string, position: [number, number, number], atSec: number) => boolean;
  markHouseEntered: (house: HouseId, atSec: number) => void;
  markHouseExited: (house: HouseId, atSec: number) => void;
  openHole: (house: HouseId, atSec: number) => void;
  recordEntryFail: (atSec: number) => void;
  recordDetection: (atSec: number, npcId: string) => void;
  recordChase: (atSec: number) => void;
  resolve: (outcome: NightOutcome, atSec: number) => void;
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
  resolve: (outcome, atSec) => {
    const run = get().run;
    if (run) set({ run: resolveNight(run, outcome, atSec), inventoryOpen: false });
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
