import { create } from 'zustand';
import { assertTransition, type GamePhase } from '../game/systems/runPhases';
import { getBrowserStorage, PersistenceService, type LoadNotice } from './persistence';
import { DEFAULT_SETTINGS, type Settings } from './settings';

export type Overlay = 'none' | 'settings' | 'help';

type AppState = {
  phase: GamePhase;
  paused: boolean;
  overlay: Overlay;
  settings: Settings;
  storageNotice: LoadNotice;
  sceneReady: boolean;
  contextLost: boolean;
  /** Incremented each time a new session starts so 3D state remounts cleanly. */
  sessionId: number;

  startNight: () => void;
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

function persistSettings(settings: Settings): void {
  persistence.save({ ...initial.document, settings });
}

export const useAppStore = create<AppState>()((set, get) => ({
  phase: 'menu',
  paused: false,
  overlay: 'none',
  settings: initial.document.settings,
  storageNotice: initial.notice,
  sceneReady: false,
  contextLost: false,
  sessionId: 0,

  startNight: () => {
    const { phase, sessionId } = get();
    set({ phase: assertTransition(phase, 'night'), paused: false, overlay: 'none', sessionId: sessionId + 1 });
  },
  returnToMenu: () => {
    const { phase } = get();
    if (phase === 'menu') return;
    set({ phase: assertTransition(phase, 'menu'), paused: false, overlay: 'none' });
  },
  setPaused: (paused) => {
    if (get().phase === 'menu') return;
    set({ paused, overlay: paused ? get().overlay : 'none' });
  },
  togglePause: () => {
    const { phase, paused, overlay } = get();
    if (phase === 'menu') {
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
    persistSettings(settings);
  },
  resetGraphics: () => {
    const settings = { ...get().settings, quality: DEFAULT_SETTINGS.quality, reducedMotion: DEFAULT_SETTINGS.reducedMotion };
    set({ settings });
    persistSettings(settings);
  },
  dismissStorageNotice: () => set({ storageNotice: 'none' }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
  setContextLost: (contextLost) => set({ contextLost }),
}));
