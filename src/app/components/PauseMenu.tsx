import { useEffect, useRef } from 'react';
import { t } from '../../locales';
import { useAppStore } from '../../state/useAppStore';

export function PauseMenu() {
  const setPaused = useAppStore((s) => s.setPaused);
  const setOverlay = useAppStore((s) => s.setOverlay);
  const returnToMenu = useAppStore((s) => s.returnToMenu);
  const resumeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => resumeRef.current?.focus(), []);

  return (
    <div className="safe-pad pointer-events-auto fixed inset-0 z-30 grid place-items-center bg-black/50" onPointerDown={(e) => e.stopPropagation()} data-testid="pause-menu">
      <div className="panel flex w-full max-w-xs flex-col gap-3 p-6 text-center" role="dialog" aria-modal="true" aria-label={t('paused')}>
        <h2 className="mb-2 text-3xl font-semibold text-gold">{t('paused')}</h2>
        <button ref={resumeRef} type="button" className="btn btn-primary" onClick={() => setPaused(false)} data-testid="resume-button">
          {t('resume')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOverlay('settings')}>
          {t('settings')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOverlay('help')}>
          {t('howToPlay')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={returnToMenu}>
          {t('mainMenu')}
        </button>
      </div>
    </div>
  );
}
