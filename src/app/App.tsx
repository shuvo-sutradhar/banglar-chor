import { useEffect, useMemo, useState } from 'react';
import { t } from '../locales';
import { detectWebGL } from '../lib/webgl';
import { useAppStore } from '../state/useAppStore';
import { useHudStore } from '../state/useHudStore';
import { createGameRuntime, resetRuntimeForRun } from '../game/GameRuntime';
import { useRunStore } from '../state/useRunStore';
import { CONTROL_PHASES, WORLD_PHASES } from '../state/useAppStore';
import { audio } from '../game/audio/AudioManager';
import { crawlOutOfRahimHouse } from '../game/systems/nightActions';
import { CRAWL_INSIDE } from '../game/data/rahimHouse';
import { PreparationOverlay } from './screens/PreparationOverlay';
import { EntryOverlay } from './screens/EntryOverlay';
import { CaughtOverlay } from './screens/CaughtOverlay';
import { NightResolution } from './screens/NightResolution';
import { DawnOverlay } from './screens/DawnOverlay';
import { TradePanel } from './screens/TradePanel';
import { ResultsScreen } from './screens/ResultsScreen';
import { MarketExitPrompt } from './components/MarketExitPrompt';
import { InventoryPanel } from './components/InventoryPanel';
import { GameCanvas } from '../game/GameCanvas';
import { ErrorBoundary, FatalScreen } from './components/ErrorBoundary';
import { HelpDialog, SettingsDialog } from './components/Dialogs';
import { Hud } from './components/Hud';
import { MobileControls } from './components/MobileControls';
import { PauseMenu } from './components/PauseMenu';
import { MainMenu } from './screens/MainMenu';

function StorageNotice() {
  const notice = useAppStore((s) => s.storageNotice);
  const dismiss = useAppStore((s) => s.dismissStorageNotice);
  if (notice === 'none') return null;
  const text = notice === 'storage-unavailable' ? t('storageUnavailable') : notice === 'version-reset' ? t('storageVersion') : t('storageCorrupt');
  return (
    <div className="safe-pad pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center">
      <div role="status" className="panel pointer-events-auto flex max-w-md items-center gap-3 px-4 py-2 text-sm">
        <span>⚠ {text}</span>
        <button type="button" className="text-gold underline" onClick={dismiss}>
          {t('dismiss')}
        </button>
      </div>
    </div>
  );
}

function LoadingVeil() {
  const ready = useAppStore((s) => s.sceneReady);
  if (ready) return null;
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-night" role="status" aria-live="polite">
      <div className="text-center">
        <div className="mb-3 text-4xl font-semibold text-gold">{t('gameTitle')}</div>
        <div className="animate-pulse text-moon">{t('loading')}</div>
      </div>
    </div>
  );
}

function ContextLostOverlay() {
  const lost = useAppStore((s) => s.contextLost);
  if (!lost) return null;
  return <FatalScreen title={t('contextLostTitle')} body={t('contextLostBody')} />;
}

/** Owns the per-page game runtime and wires global input listeners exactly once. */
function GameRoot() {
  const runtime = useMemo(() => createGameRuntime(), []);
  const phase = useAppStore((s) => s.phase);
  const paused = useAppStore((s) => s.paused);
  const overlay = useAppStore((s) => s.overlay);
  const sessionId = useAppStore((s) => s.sessionId);
  const touchUi = useHudStore((s) => s.touchUi);

  const inventoryOpen = useRunStore((s) => s.inventoryOpen);
  const volume = useAppStore((s) => s.settings.volume);
  const muted = useAppStore((s) => s.settings.muted);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    runtime.input.onPauseRequest = () => {
      // Esc closes the inventory first, then toggles pause.
      if (useRunStore.getState().inventoryOpen) useRunStore.getState().setInventoryOpen(false);
      else useAppStore.getState().togglePause();
    };
    runtime.input.onInventoryRequest = () => useRunStore.getState().setInventoryOpen(!useRunStore.getState().inventoryOpen);
    const detach = runtime.input.attachKeyboard(window);
    return () => {
      runtime.input.onPauseRequest = null;
      runtime.input.onInventoryRequest = null;
      detach();
    };
  }, [runtime]);

  // Auto-pause when the tab is hidden; timers, physics, minigames and audio stop with it.
  useEffect(() => {
    const onVisibility = () => {
      const hidden = document.visibilityState === 'hidden';
      if (hidden) useAppStore.getState().setPaused(true);
      audio.setSuspended(hidden || useAppStore.getState().paused);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    audio.setVolume(volume, muted);
  }, [volume, muted]);

  useEffect(() => {
    audio.setSuspended(paused);
  }, [paused]);

  useEffect(() => {
    const zone = useAppStore.getState().zone;
    if (phase === 'dawn' || ((phase === 'bazaar' || phase === 'bargain' || phase === 'chase' || phase === 'caught') && zone === 'bazaar')) audio.startAmbience(phase === 'dawn' ? 'morning' : 'market');
    else if (WORLD_PHASES.includes(phase) || phase === 'preparation') audio.startAmbience('night');
    else audio.stopAmbience();
  }, [phase]);

  // Show touch controls on coarse pointers, or as soon as any touch happens.
  useEffect(() => {
    const setTouch = useHudStore.getState().setTouchUi;
    if (window.matchMedia?.('(pointer: coarse)').matches) setTouch(true);
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'touch') setTouch(true);
      else if (e.pointerType === 'mouse') setTouch(false);
    };
    window.addEventListener('pointerdown', onPointer, { capture: true });
    return () => window.removeEventListener('pointerdown', onPointer, { capture: true });
  }, []);

  useEffect(() => {
    runtime.input.setEnabled(CONTROL_PHASES.includes(phase) && !paused && overlay === 'none');
  }, [runtime, phase, paused, overlay]);

  // New run: reset per-run simulation state and HUD.
  useEffect(() => {
    runtime.input.reset();
    resetRuntimeForRun(runtime);
    useHudStore.getState().resetSession();
  }, [runtime, sessionId]);

  // Switching zones (village → bazaar) clears village-only HUD/camera state.
  const zone = useAppStore((s) => s.zone);
  useEffect(() => {
    useHudStore.getState().setZoneLabel(null);
    runtime.camera.interiorZones.clear();
  }, [runtime, zone]);

  // Inventory closes automatically outside controllable phases.
  useEffect(() => {
    if (!CONTROL_PHASES.includes(phase) && useRunStore.getState().inventoryOpen) useRunStore.getState().setInventoryOpen(false);
  }, [phase]);

  const leaveHouse = () => {
    if (fading) return;
    const p = runtime.player.position;
    const near = Math.hypot(p.x - CRAWL_INSIDE[0], p.z - CRAWL_INSIDE[2]) < 0.8;
    if (near) {
      crawlOutOfRahimHouse(runtime, false);
      return;
    }
    // Short fade hides moving to the opening from elsewhere in the room.
    setFading(true);
    window.setTimeout(() => {
      crawlOutOfRahimHouse(runtime, true);
      window.setTimeout(() => setFading(false), 250);
    }, 300);
  };

  const hudPhases = ['night', 'entry', 'interior', 'chase', 'caught', 'bazaar', 'bargain'];
  const showHud = hudPhases.includes(phase);
  const controls = CONTROL_PHASES.includes(phase);
  return (
    <div className="game-root">
      <GameCanvas runtime={runtime} />
      {phase === 'menu' && <MainMenu />}
      {phase === 'preparation' && <PreparationOverlay runtime={runtime} />}
      {showHud && <Hud onLeaveHouse={leaveHouse} />}
      {phase === 'entry' && <EntryOverlay runtime={runtime} />}
      {phase === 'caught' && <CaughtOverlay />}
      {phase === 'night-resolution' && <NightResolution />}
      {phase === 'dawn' && <DawnOverlay />}
      {phase === 'bargain' && <TradePanel runtime={runtime} />}
      {phase === 'bazaar' && <MarketExitPrompt runtime={runtime} />}
      {phase === 'results' && <ResultsScreen />}
      {controls && inventoryOpen && !paused && <InventoryPanel runtime={runtime} />}
      {controls && touchUi && !paused && <MobileControls input={runtime.input} />}
      {paused && phase !== 'menu' && <PauseMenu />}
      {fading && <div className="pointer-events-none fixed inset-0 z-40 bg-black transition-opacity" aria-hidden />}
      {overlay === 'settings' && <SettingsDialog />}
      {overlay === 'help' && <HelpDialog />}
      <StorageNotice />
      <LoadingVeil />
      <ContextLostOverlay />
    </div>
  );
}

export function App() {
  const [webgl] = useState(() => detectWebGL());
  if (!webgl) return <FatalScreen title={t('webglMissingTitle')} body={t('webglMissingBody')} />;
  return (
    <ErrorBoundary>
      <GameRoot />
    </ErrorBoundary>
  );
}
