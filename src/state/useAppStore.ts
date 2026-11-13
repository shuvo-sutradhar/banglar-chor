import { create } from 'zustand';
import { assertTransition, type GamePhase } from '../game/systems/runPhases';
import { addCompletedRun, getBrowserStorage, PersistenceService, type CompletedRun, type LoadNotice, type SaveDocument } from './persistence';
import { computeRunScore, summaryLine } from '../game/systems/scoring';
import { canEnterMarket } from '../game/systems/market';
import { daylight } from '../game/effects/daylight';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { useRunStore } from './useRunStore';
import { buyEquipment, buySupply, eat, equip, nap, settleRun, startNight, type OpResult, type Profile } from '../game/systems/progression';
import { beginNightBody, currentEnergy, nightBody } from '../game/systems/nightBody';
import type { EquipmentId, FoodId, SupplyId } from '../game/data/economy';

export type Overlay = 'none' | 'settings' | 'help';

/** Phases with no live simulation where pausing makes no sense. */
const UNPAUSABLE: readonly GamePhase[] = ['menu', 'night-resolution', 'results'];
// (dawn is pausable: its animation honours pause)

type AppState = {
  phase: GamePhase;
  paused: boolean;
  overlay: Overlay;
  settings: Settings;
  preparationDone: boolean;
  storageNotice: LoadNotice;
  sceneReady: boolean;
  contextLost: boolean;
  /** Incremented each time a new run starts so 3D state remounts cleanly. */
  sessionId: number;
  /** Which 3D zone is loaded: the night village or the morning bazaar. */
  zone: 'village' | 'bazaar';
  nickname: string;
  /** Completed runs on THIS device (newest first). */
  runs: CompletedRun[];
  /** The run just finished (shown on the results screen). */
  lastResult: CompletedRun | null;
  /** False when the last save failed (storage blocked / quota). */
  lastSaveOk: boolean;
  /** Persistent progression (money, energy, equipment, village memory). */
  profile: Profile;
  /** What the last run changed in the bank (results / safehouse summary). */
  lastSettlement: { runId: string; earned: number; bankBefore: number; bankAfter: number; energyBefore: number; energyAfter: number } | null;
  /** results / menu → the safehouse (eat, rest, upgrade, then the next night). */
  goSafehouse: () => void;
  eatFood: (food: FoodId, txId: string) => OpResult;
  takeNap: (txId: string) => OpResult;
  buyItem: (id: EquipmentId, txId: string) => OpResult;
  equipItem: (id: EquipmentId) => OpResult;
  buySupplies: (id: SupplyId, txId: string) => OpResult;
  setNickname: (name: string) => void;
  /** night-resolution → dawn (only after an escape with loot). */
  startDawn: () => void;
  /** dawn → bazaar: swap the zone; inventory carries over unchanged. */
  enterBazaar: () => void;
  /** Any ending → results; saves the run locally exactly once. */
  showResults: () => void;

  /** Menu / results → preparation, with a fresh run. */
  startRun: () => void;
  /** Validated phase change (throws on an illegal transition). */
  goTo: (phase: GamePhase) => void;
  completePreparation: () => void;
  returnToMenu: () => void;
  setPaused: (paused: boolean) => void;
  togglePause: () => void;
  setOverlay: (overlay: Overlay) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  resetGraphics: () => void;
  dismissStorageNotice: () => void;
  setSceneReady: (ready: boolean) => void;
  setContextLost: (lost: boolean) => void;
};

const persistence = new PersistenceService(getBrowserStorage());
const initial = persistence.load();
let savedDoc: SaveDocument = initial.document;

function persist(patch: Partial<SaveDocument>): boolean {
  savedDoc = { ...savedDoc, ...patch };
  return persistence.save(savedDoc);
}

const NICK_WORDS = ['চতুর', 'চুপচাপ', 'ফাঁকিবাজ', 'তেলতেলা', 'দৌড়বাজ', 'ঘুমকাতুরে'];
function defaultNickname(): string {
  const n = Math.floor(Math.random() * 90) + 10;
  return `${NICK_WORDS[Math.floor(Math.random() * NICK_WORDS.length)]} চোর ${n.toString().replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]!)}`;
}

/** Fresh documented seed per run (time ^ random); `?debug=1&seed=N` pins it for tests. */
function seedForNewRun(): number {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('debug') && q.has('seed')) return Number(q.get('seed')) >>> 0;
  } catch {
    /* non-browser */
  }
  return newSeed();
}

function newSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

export const useAppStore = create<AppState>()((set, get) => ({
  phase: 'menu',
  paused: false,
  overlay: 'none',
  settings: initial.document.settings,
  preparationDone: initial.document.preparationDone,
  storageNotice: initial.notice,
  sceneReady: false,
  contextLost: false,
  sessionId: 0,
  zone: 'village',
  nickname: initial.document.nickname ?? defaultNickname(),
  runs: initial.document.runs,
  lastResult: null,
  lastSaveOk: true,
  profile: initial.document.profile,
  lastSettlement: null,

  startRun: () => {
    const { phase, sessionId } = get();
    const next = assertTransition(phase, 'preparation');
    const seed = seedForNewRun();
    // Night start: tonight's loadout from the saved profile (consumes the food buff, day + 1).
    const started = startNight(get().profile);
    beginNightBody(started.loadout, seed);
    set({ profile: started.profile });
    persist({ profile: started.profile });
    useRunStore.getState().newRun(seed);
    daylight.factor = 0;
    set({ phase: next, paused: false, overlay: 'none', sessionId: sessionId + 1, zone: 'village', lastResult: null });
  },
  setNickname: (name) => {
    const nickname = name.trim().slice(0, 24) || defaultNickname();
    set({ nickname });
    persist({ nickname });
  },
  startDawn: () => {
    const run = useRunStore.getState().run;
    if (!run || !canEnterMarket(run)) return;
    get().goTo('dawn');
  },
  enterBazaar: () => {
    if (get().phase !== 'dawn') return;
    if (!useRunStore.getState().enterMarket(0)) return;
    daylight.factor = 1;
    set({ zone: 'bazaar' });
    get().goTo('bazaar');
  },
  showResults: () => {
    const run = useRunStore.getState().run;
    if (!run) return;
    const { phase } = get();
    if (phase === 'results') return;
    const b = computeRunScore(run);
    const record: CompletedRun = {
      id: run.id,
      seed: run.seed,
      endedAtIso: new Date().toISOString(),
      nickname: get().nickname,
      outcome: b.outcome,
      score: b.score,
      money: b.money,
      collected: b.stats.collected,
      sold: b.stats.sold,
      lost: b.stats.lost,
      detections: b.stats.detections,
      caught: b.stats.caught,
      line: summaryLine(run, b),
    };
    const doc = addCompletedRun(savedDoc, record);
    // Bank the run exactly once (idempotent by run id) together with the run history.
    const before = get().profile;
    const body = nightBody.current;
    const settled = settleRun(before, {
      runId: run.id,
      money: run.market?.money ?? 0,
      energyEnd: currentEnergy(body),
      suppliesLeft: body.supplies,
      detections: run.detections + (run.market?.detections ?? 0),
      chases: run.chases,
      caught: b.stats.caught,
      robbed: run.houseIdsEntered.length > 0,
    });
    const profile = settled.profile;
    const ok = persist({ runs: doc.runs, profile });
    set({
      phase: assertTransition(phase, 'results'),
      paused: false,
      overlay: 'none',
      lastResult: record,
      runs: doc.runs,
      lastSaveOk: ok,
      profile,
      lastSettlement: settled.ok ? { runId: run.id, earned: profile.bank - before.bank, bankBefore: before.bank, bankAfter: profile.bank, energyBefore: body.loadout.energy, energyAfter: profile.energy } : get().lastSettlement,
    });
  },
  goTo: (to) => {
    const { phase } = get();
    if (phase === to) return;
    set({ phase: assertTransition(phase, to), overlay: 'none', paused: false });
  },
  completePreparation: () => {
    get().goTo('night');
    if (!get().preparationDone) {
      set({ preparationDone: true });
      persist({ preparationDone: true });
    }
  },
  returnToMenu: () => {
    const { phase } = get();
    if (phase === 'menu') return;
    set({ phase: assertTransition(phase, 'menu'), paused: false, overlay: 'none' });
  },
  setPaused: (paused) => {
    if (UNPAUSABLE.includes(get().phase)) return;
    set({ paused, overlay: paused ? get().overlay : 'none' });
  },
  togglePause: () => {
    const { phase, paused, overlay } = get();
    if (UNPAUSABLE.includes(phase)) {
      if (overlay !== 'none') set({ overlay: 'none' });
      return;
    }
    // Escape first closes a sub-overlay, then resumes.
    if (paused && overlay !== 'none') {
      set({ overlay: 'none' });
      return;
    }
    set({ paused: !paused, overlay: 'none' });
  },
  setOverlay: (overlay) => set({ overlay }),
  goSafehouse: () => {
    const { phase } = get();
    if (phase === 'safehouse') return;
    set({ phase: assertTransition(phase, 'safehouse'), paused: false, overlay: 'none', zone: 'village' });
  },
  eatFood: (food, txId) => applyOp(eat(get().profile, food, txId)),
  takeNap: (txId) => applyOp(nap(get().profile, txId)),
  buyItem: (id, txId) => applyOp(buyEquipment(get().profile, id, txId)),
  equipItem: (id) => applyOp(equip(get().profile, id)),
  buySupplies: (id, txId) => applyOp(buySupply(get().profile, id, txId)),
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    persist({ settings });
  },
  resetGraphics: () => {
    const settings = { ...get().settings, quality: DEFAULT_SETTINGS.quality, reducedMotion: DEFAULT_SETTINGS.reducedMotion };
    set({ settings });
    persist({ settings });
  },
  dismissStorageNotice: () => set({ storageNotice: 'none' }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
  setContextLost: (contextLost) => set({ contextLost }),
}));

/** Apply a progression operation atomically: state and save change together, or not at all. */
function applyOp(r: OpResult): OpResult {
  if (r.ok) {
    useAppStore.setState({ profile: r.profile });
    useAppStore.setState({ lastSaveOk: persist({ profile: r.profile }) });
  }
  return r;
}

/** Phases in which the player avatar and NPCs exist in the world. */
export const WORLD_PHASES: readonly GamePhase[] = ['night', 'entry', 'interior', 'chase', 'caught', 'bazaar', 'bargain'];
/** Phases in which the player can walk around. */
export const CONTROL_PHASES: readonly GamePhase[] = ['night', 'interior', 'chase', 'bazaar'];
