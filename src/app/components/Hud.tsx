import { useEffect, useState } from 'react';
import { t, type StringKey } from '../../locales';
import { useAppStore } from '../../state/useAppStore';
import { useHudStore } from '../../state/useHudStore';
import type { MovementMode } from '../../game/physics/motorMath';

const MODE_LABEL: Record<MovementMode, StringKey> = {
  idle: 'modeIdle',
  walk: 'modeWalk',
  run: 'modeRun',
  'crouch-idle': 'modeCrouchIdle',
  'crouch-walk': 'modeCrouchWalk',
  airborne: 'modeAirborne',
};

/** Icons accompany labels so state is never conveyed by colour alone. */
const MODE_ICON: Record<MovementMode, string> = {
  idle: '🧍',
  walk: '🚶',
  run: '🏃',
  'crouch-idle': '🤫',
  'crouch-walk': '🤫',
  airborne: '⤵',
};

function CaptionToast() {
  const caption = useHudStore((s) => s.caption);
  const clearCaption = useHudStore((s) => s.clearCaption);
  const subtitles = useAppStore((s) => s.settings.subtitles);
  useEffect(() => {
    if (!caption) return;
    const ms = Math.min(6000, 2200 + caption.text.length * 45);
    const id = window.setTimeout(() => clearCaption(caption.id), ms);
    return () => window.clearTimeout(id);
  }, [caption, clearCaption]);
  if (!caption || !subtitles) return null;
  return (
    <div key={caption.id} role="status" aria-live="polite" className="caption-in panel mx-auto max-w-xl px-4 py-2 text-center text-lg leading-snug" data-testid="caption">
      {caption.speaker && <span className="mr-2 font-semibold text-lantern">{caption.speaker}:</span>}
      {caption.text}
    </div>
  );
}

function InteractPrompt({ touch }: { touch: boolean }) {
  const focus = useHudStore((s) => s.focus);
  if (!focus || touch) return null;
  return (
    <div className="panel mx-auto flex items-center gap-3 px-4 py-2" data-testid="interact-prompt">
      <kbd className="grid h-9 w-9 place-items-center rounded-lg bg-lantern font-mono text-lg font-bold text-[#2a1a0c]">E</kbd>
      <span>
        {t('actionInspect')}: <b className="text-gold">{focus.labelBn}</b>
      </span>
    </div>
  );
}

function ControlHints({ touch }: { touch: boolean }) {
  const show = useAppStore((s) => s.settings.showControlHints);
  const update = useAppStore((s) => s.updateSettings);
  if (!show) return null;
  return (
    <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-3 rounded-full bg-black/45 px-4 py-1.5 text-sm text-ink/90">
      <span>{touch ? t('hintsTouch') : t('hintsDesktop')}</span>
      <button type="button" className="shrink-0 rounded-full px-2 py-1 text-moon underline underline-offset-2" onClick={() => update({ showControlHints: false })}>
        {t('hideHints')}
      </button>
    </div>
  );
}

export function PortraitHint() {
  const touch = useHudStore((s) => s.touchUi);
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  if (!touch || !portrait || dismissed) return null;
  return (
    <div className="pointer-events-auto panel mx-auto mt-2 flex max-w-sm items-center gap-3 px-3 py-2 text-sm">
      <span aria-hidden>📱↻</span>
      <span className="flex-1">{t('rotateDevice')}</span>
      <button type="button" className="rounded-lg px-2 py-1 text-gold underline" onClick={() => setDismissed(true)}>
        {t('dismiss')}
      </button>
    </div>
  );
}

export function Hud() {
  const mode = useHudStore((s) => s.movementMode);
  const zone = useHudStore((s) => s.zoneLabel);
  const preset = useHudStore((s) => s.cameraPreset);
  const touch = useHudStore((s) => s.touchUi);
  const togglePause = useAppStore((s) => s.togglePause);

  return (
    <div className="safe-pad pointer-events-none fixed inset-0 z-10 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="panel flex items-center gap-2 px-3 py-1.5" data-testid="mode-chip">
            <span aria-hidden>{MODE_ICON[mode]}</span>
            <span className="font-semibold">{t(MODE_LABEL[mode])}</span>
          </div>
          {zone && (
            <div className="panel px-3 py-1.5 text-sm" data-testid="zone-label">
              📍 {zone}
              {preset === 'interior' && <span className="ml-2 text-moon">(কাছের ক্যামেরা)</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-black/35 px-3 py-1 text-xs text-moon sm:inline">{t('prototypeBadge')}</span>
          <button
            type="button"
            className="touch-btn h-12 w-12 text-lg"
            aria-label={t('pause')}
            onClick={togglePause}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid="pause-button"
          >
            ❚❚
          </button>
        </div>
      </div>
      <PortraitHint />
      <div className="mt-3">
        <CaptionToast />
      </div>
      <div className="flex-1" />
      <div className={`flex flex-col gap-2 ${touch ? 'mb-28' : ''}`}>
        <InteractPrompt touch={touch} />
        <ControlHints touch={touch} />
      </div>
    </div>
  );
}
