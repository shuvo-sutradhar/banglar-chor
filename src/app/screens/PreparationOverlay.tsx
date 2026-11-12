import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PausableClock } from '../../lib/PausableClock';
import { useAppStore } from '../../state/useAppStore';
import { useHudStore } from '../../state/useHudStore';
import type { GameRuntime } from '../../game/GameRuntime';
import { PreparationRitual, PREP_TUNING, type PrepResult, type PrepStage } from '../../game/systems/preparation';
import { setAction, type ActionPose } from '../../game/characters/rigTypes';
import { PREP_LINES, THIEF_NAME } from '../../game/data/dialogue';
import { audio } from '../../game/audio/AudioManager';
import { debugHooks } from '../../game/debugHooks';

const STAGE_INFO: Record<Exclude<PrepStage, 'done'>, { title: string; how: string; action: string }> = {
  oil: { title: '১. সরিষার তেল মাখো', how: 'দাগটা মাঝের সোনালি ঘরে এলেই চাপো (৩ বার)', action: 'মাখো!' },
  tuck: { title: '২. লুঙ্গিতে কাছা মারো', how: 'চেপে ধরে রাখো, মিটার সবুজ ঘরে এলে ছেড়ে দাও', action: 'চেপে ধরো' },
  gamcha: { title: '৩. মাথায় গামছা বাঁধো', how: 'কাঁটাটা ওপরে (▲) এলেই চাপো', action: 'বাঁধো!' },
};

type Feedback = { text: string; good: boolean; id: number } | null;

/**
 * Comic preparation ritual (Task 1): three short timing stages with visible character reactions.
 * Input: Space / Enter / E, mouse, or touch. Purely cosmetic fantasy — no real technique.
 */
export function PreparationOverlay({ runtime }: { runtime: GameRuntime }) {
  const completePreparation = useAppStore((s) => s.completePreparation);
  const preparationDone = useAppStore((s) => s.preparationDone);
  const ritual = useMemo(() => new PreparationRitual(), []);
  const clock = useMemo(() => new PausableClock(), []);
  const [stage, setStage] = useState<PrepStage>('oil');
  const [feedback, setFeedback] = useState<Feedback>(null);
  /** The finale button only fires if the press began on it (a stray release from the last tap must not skip the finale). */
  const goArmed = useRef(false);
  const markerRef = useRef<HTMLDivElement>(null);
  const gaugeRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<SVGGElement>(null);
  const actionTimer = useRef<number | null>(null);
  const holding = useRef(false);
  const fbId = useRef(0);

  const pose = useCallback(
    (a: ActionPose | null, ms?: number) => {
      setAction(runtime.player, a);
      if (actionTimer.current) window.clearTimeout(actionTimer.current);
      actionTimer.current = ms ? window.setTimeout(() => setAction(runtime.player, null), ms) : null;
    },
    [runtime],
  );

  const syncCosmetic = useCallback(() => {
    runtime.player.cosmetic.oil = ritual.oil;
    runtime.player.cosmetic.tuck = ritual.tuck;
    runtime.player.cosmetic.headband = ritual.headband;
  }, [runtime, ritual]);

  const handle = useCallback(
    (r: PrepResult, stageBefore: PrepStage) => {
      if (r === 'ignored') return;
      const say = (text: string, good: boolean) => {
        setFeedback({ text, good, id: ++fbId.current });
        useHudStore.getState().showCaption(text, THIEF_NAME);
      };
      syncCosmetic();
      if (stageBefore === 'oil') {
        if (r === 'miss') {
          audio.play('prep-miss');
          pose('oil-miss', 900);
          say(PREP_LINES.oilMiss[ritual.oilMisses % PREP_LINES.oilMiss.length]!, false);
        } else {
          audio.play('prep-hit');
          pose('oil-rub', 900);
          say(r === 'auto-complete' ? PREP_LINES.oilAuto : PREP_LINES.oilHit[(ritual.oilHits - 1) % PREP_LINES.oilHit.length]!, true);
        }
      } else if (stageBefore === 'tuck') {
        if (r === 'too-loose' || r === 'too-tight') {
          audio.play('prep-miss');
          pose('tuck-fail', 900);
          say(r === 'too-tight' ? PREP_LINES.tuckTight : PREP_LINES.tuckLoose, false);
        } else {
          audio.play('prep-hit');
          pose('tuck', 700);
          say(r === 'auto-complete' ? PREP_LINES.tuckAuto : PREP_LINES.tuckOk, true);
        }
      } else if (stageBefore === 'gamcha') {
        if (r === 'miss') {
          audio.play('prep-miss');
          pose('gamcha-fail', 900);
          say(PREP_LINES.gamchaMiss, false);
        } else {
          audio.play('prep-done');
          pose('proud');
          say(r === 'auto-complete' ? PREP_LINES.gamchaAuto : PREP_LINES.gamchaOk, true);
          window.setTimeout(() => useHudStore.getState().showCaption(PREP_LINES.done, THIEF_NAME), 1400);
        }
      }
      setStage(ritual.stage);
    },
    [pose, ritual, syncCosmetic],
  );

  const press = useCallback((eventTime?: number) => {
    const t = clock.at(eventTime);
    const before = ritual.stage;
    if (before === 'tuck') {
      if (!holding.current) {
        holding.current = true;
        ritual.holdStartAt(t);
        pose('tuck');
      }
      return;
    }
    handle(ritual.tap(t), before);
  }, [clock, ritual, handle, pose]);

  const release = useCallback((eventTime?: number) => {
    if (!holding.current) return;
    holding.current = false;
    handle(ritual.release(clock.at(eventTime)), 'tuck');
  }, [clock, ritual, handle]);

  // Frame loop: visuals via refs (no React re-render per frame) + pause-aware clock.
  useEffect(() => {
    ritual.begin(clock.tick());
    useHudStore.getState().showCaption(PREP_LINES.intro, THIEF_NAME);
    let raf = 0;
    const loop = () => {
      clock.setPaused(useAppStore.getState().paused);
      const t = clock.tick();
      const auto = ritual.update(t);
      if (auto) {
        holding.current = false;
        handle(auto, 'tuck');
      }
      if (markerRef.current) markerRef.current.style.left = `${ritual.oilMarker(t) * 100}%`;
      if (gaugeRef.current) gaugeRef.current.style.height = `${Math.min(1, ritual.tuckGauge(t)) * 100}%`;
      if (arrowRef.current) arrowRef.current.setAttribute('transform', `rotate(${(ritual.gamchaAngle(t) * 180) / Math.PI} 60 60)`);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    debugHooks.prep = () => ({
      stage: ritual.stage,
      msUntilSweetSpot: ritual.stage === 'gamcha' ? ritual.msUntilGamchaUp(clock.now()) : ritual.msUntilOilSweetSpot(clock.now()),
      idealHoldMs: ritual.idealTuckHoldMs(),
    });
    return () => {
      cancelAnimationFrame(raf);
      delete debugHooks.prep;
      if (actionTimer.current) window.clearTimeout(actionTimer.current);
    };
  }, [clock, ritual, handle]);

  // Keyboard: Space / Enter / E. Hold for the tuck stage.
  useEffect(() => {
    const keys = new Set(['Space', 'Enter', 'KeyE', 'NumpadEnter']);
    const down = (e: KeyboardEvent) => {
      if (!keys.has(e.code) || e.repeat || useAppStore.getState().paused) return;
      e.preventDefault();
      if (ritual.stage === 'done') return;
      press(e.timeStamp);
    };
    const up = (e: KeyboardEvent) => {
      if (keys.has(e.code)) release(e.timeStamp);
    };
    const blur = () => release();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [press, release, ritual]);

  const finish = () => {
    syncCosmetic();
    setAction(runtime.player, null);
    completePreparation();
  };

  const skip = () => {
    ritual.oil = 1;
    ritual.tuck = 1;
    ritual.headband = true;
    finish();
  };

  const info = stage === 'done' ? null : STAGE_INFO[stage];
  const { zoneHalfWidth } = PREP_TUNING.oil;
  const { zoneMin, zoneMax } = PREP_TUNING.tuck;

  return (
    <div className="safe-pad pointer-events-none fixed inset-0 z-20 flex flex-col justify-end" data-testid="prep-overlay">
      <div className="pointer-events-auto mx-auto mb-2 w-full max-w-md">
        <div className="panel p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-gold">{info ? info.title : 'প্রস্তুতি শেষ!'}</h2>
            <div className="flex gap-1" aria-label="ধাপ">
              {(['oil', 'tuck', 'gamcha'] as const).map((s, i) => (
                <span key={s} className={`h-2.5 w-8 rounded-full ${['oil', 'tuck', 'gamcha'].indexOf(stage) > i || stage === 'done' ? 'bg-lantern' : stage === s ? 'bg-ink/70' : 'bg-ink/20'}`} />
              ))}
            </div>
          </div>

          {stage === 'oil' && (
            <div className="relative my-3 h-10 overflow-hidden rounded-xl bg-black/40" aria-hidden>
              <div className="absolute inset-y-0 bg-gold/70" style={{ left: `${(0.5 - zoneHalfWidth) * 100}%`, width: `${zoneHalfWidth * 200}%` }} />
              <div ref={markerRef} className="absolute inset-y-1 w-2 -translate-x-1/2 rounded bg-ink shadow" />
              <div className="absolute right-2 top-2 text-xs text-ink/80">{ritual.oilHits}/৩</div>
            </div>
          )}
          {stage === 'tuck' && (
            <div className="my-3 flex items-end justify-center gap-4" aria-hidden>
              <div className="relative h-28 w-10 overflow-hidden rounded-xl bg-black/40">
                <div className="absolute inset-x-0 bg-leaf/80" style={{ bottom: `${zoneMin * 100}%`, height: `${(zoneMax - zoneMin) * 100}%` }} />
                <div ref={gaugeRef} className="absolute inset-x-1 bottom-0 rounded bg-lantern/90" style={{ height: '0%' }} />
              </div>
              <p className="max-w-[12rem] text-sm text-moon">সবুজ ঘর = ঠিকঠাক কাছা। ওপরে গেলে বেশি টাইট!</p>
            </div>
          )}
          {stage === 'gamcha' && (
            <svg viewBox="0 0 120 120" className="mx-auto my-2 h-28 w-28" aria-hidden>
              <circle cx="60" cy="60" r="50" fill="rgba(0,0,0,0.35)" stroke="rgba(246,241,232,0.3)" />
              <path d="M60 6 L68 22 L52 22 Z" fill="#e3ba70" />
              <g ref={arrowRef}>
                <line x1="60" y1="60" x2="60" y2="18" stroke="#f6f1e8" strokeWidth="5" strokeLinecap="round" />
                <circle cx="60" cy="60" r="6" fill="#f6f1e8" />
              </g>
            </svg>
          )}

          {info && <p className="mb-3 text-center text-sm text-ink/85">{info.how}</p>}
          {feedback && (
            <p key={feedback.id} className={`caption-in mb-3 text-center font-semibold ${feedback.good ? 'text-gold' : 'text-danger'}`} role="status">
              {feedback.good ? '✓ ' : '✗ '}
              {feedback.text}
            </p>
          )}

          {stage !== 'done' ? (
            <button
              type="button"
              className="btn btn-primary w-full touch-none text-xl"
              data-testid="prep-action"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                press(e.timeStamp);
              }}
              onPointerUp={(e) => release(e.timeStamp)}
              onPointerCancel={() => release()}
              onPointerLeave={() => release()}
              onContextMenu={(e) => e.preventDefault()}
            >
              {info?.action} <span className="text-sm opacity-70">(Space)</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary w-full text-xl"
              onPointerDown={() => {
                goArmed.current = true;
              }}
              onClick={(e) => {
                // e.detail === 0 → keyboard activation (Enter/Space on the focused button).
                if (goArmed.current || e.detail === 0) finish();
                goArmed.current = false;
              }}
              data-testid="prep-go"
            >
              চলো যাই!
            </button>
          )}
          {preparationDone && stage !== 'done' && (
            <button type="button" className="btn btn-ghost mt-2 w-full !min-h-11 text-base" onClick={skip} data-testid="prep-skip">
              প্রস্তুতি বাদ দাও
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
