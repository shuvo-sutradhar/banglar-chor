import { create } from 'zustand';
import { assertTransition, type GamePhase } from '../game/systems/runPhases';
import { getBrowserStorage, PersistenceService, type LoadNotice, type SaveDocument } from './persistence';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { useRunStore } from './useRunStore';

export type Overlay = 'none' | 'settings' | 'help';

/** Phases with no live simulation where pausing makes no sense. */
const UNPAUSABLE: readonly GamePhase[] = ['menu', 'night-resolution', 'results'];

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

function persist(patch: Partial<SaveDocument>): void {
  savedDoc = { ...savedDoc, ...patch };
  persistence.save(savedDoc);
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

  startRun: () => {
    const { phase, sessionId } = get();
    const next = assertTransition(phase, 'preparation');
    useRunStore.getState().newRun(newSeed());
    set({ phase: next, paused: false, overlay: 'none', sessionId: sessionId + 1 });
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

/** Phases in which the player avatar and NPCs exist in the world. */
export const WORLD_PHASES: readonly GamePhase[] = ['night', 'entry', 'interior', 'chase', 'caught'];
/** Phases in which the player can walk around. */
export const CONTROL_PHASES: readonly GamePhase[] = ['night', 'interior', 'chase'];
