import { t } from '../../locales';
import { useAppStore } from '../../state/useAppStore';
import { audio } from '../../game/audio/AudioManager';

/** Title screen over the live 3D village (the canvas orbits behind it). */
export function MainMenu() {
  const startRun = useAppStore((s) => s.startRun);
  const setOverlay = useAppStore((s) => s.setOverlay);
  const sceneReady = useAppStore((s) => s.sceneReady);

  return (
    <div className="safe-pad pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-night/70 via-transparent to-night/80">
      <div className="pointer-events-auto flex w-full max-w-sm flex-col items-center text-center">
        <h1 className="text-6xl font-semibold leading-tight text-gold drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)] sm:text-7xl">{t('gameTitle')}</h1>
        <p className="mb-8 mt-1 text-lg text-ink/90 drop-shadow">{t('tagline')}</p>
        <div className="flex w-full flex-col gap-3">
          <button type="button" className="btn btn-primary text-xl" disabled={!sceneReady} onClick={() => {
              audio.unlock();
              startRun();
            }} data-testid="start-button">
            {sceneReady ? t('start') : t('loading')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setOverlay('help')}>
            {t('howToPlay')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setOverlay('settings')}>
            {t('settings')}
          </button>
        </div>
        <p className="mt-6 rounded-full bg-black/30 px-4 py-1 text-sm text-moon">{t('prototypeBadge')}</p>
      </div>
    </div>
  );
}
