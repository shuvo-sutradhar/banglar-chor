import { useEffect, useMemo, useState } from 'react';
import { t } from '../locales';
import { detectWebGL } from '../lib/webgl';
import { useAppStore } from '../state/useAppStore';
import { useHudStore } from '../state/useHudStore';
import { createGameRuntime } from '../game/GameRuntime';
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

  useEffect(() => {
    runtime.input.onPauseRequest = () => useAppStore.getState().togglePause();
    const detach = runtime.input.attachKeyboard(window);
    return () => {
      runtime.input.onPauseRequest = null;
      detach();
    };
  }, [runtime]);

  // Auto-pause when the tab is hidden; timers and physics stop with it.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && useAppStore.getState().phase === 'night') useAppStore.getState().setPaused(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

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
    runtime.input.setEnabled(phase === 'night' && !paused && overlay === 'none');
  }, [runtime, phase, paused, overlay]);

  useEffect(() => {
    runtime.input.reset();
    useHudStore.getState().resetSession();
    runtime.camera.interiorZones.clear();
  }, [runtime, sessionId]);

  const inWorld = phase === 'night';
  return (
    <div className="game-root">
      <GameCanvas runtime={runtime} />
      {phase === 'menu' && <MainMenu />}
      {inWorld && <Hud />}
      {inWorld && touchUi && !paused && <MobileControls input={runtime.input} />}
      {inWorld && paused && <PauseMenu />}
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
