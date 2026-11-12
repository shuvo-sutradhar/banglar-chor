import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PausableClock } from '../../lib/PausableClock';
import { useAppStore } from '../../state/useAppStore';
import { useRunStore } from '../../state/useRunStore';
import type { GameRuntime } from '../../game/GameRuntime';
import { EntryChallenge, type EntryEvent } from '../../game/systems/entryChallenge';
import { HOUSE_PROFILES } from '../../game/data/houses';
import { ENTRY_LINES, THIEF_NAME } from '../../game/data/dialogue';
import { HEADING_INTO_HOUSE, SIDH_TARGET } from '../../game/data/rahimHouse';
import { setAction } from '../../game/characters/rigTypes';
import { audio } from '../../game/audio/AudioManager';
import { debugHooks } from '../../game/debugHooks';
import { crawlIntoRahimHouse, ENTRY_RETRY_COOLDOWN, entryCooldown, say } from '../../game/systems/nightActions';

/** Shown once per run before the first attempt (README §8 "add a hint before the first attempt"). */
const hintShownForSession = { session: -1 };

const TARGET_R = 54;
const PULSE_SPAN = 80;

/**
 * Abstract fictional sidh-kata rhythm challenge (Task 2). Skill-based: taps are judged at their
 * exact time against beats. Mistakes raise the noise meter AND emit real world noise events at
 * the wall, which Rahim (inside) and মজনু (on patrol) can hear.
 */
export function EntryOverlay({ runtime }: { runtime: GameRuntime }) {
  const sessionId = useAppStore((s) => s.sessionId);
  const goTo = useAppStore((s) => s.goTo);
  const config = HOUSE_PROFILES.rahim.entry;
  const challenge = useMemo(() => new EntryChallenge(config), [config]);
  const clock = useMemo(() => new PausableClock(), []);
  const [hint, setHint] = useState(() => hintShownForSession.session !== sessionId);
  const [judgement, setJudgement] = useState<{ text: string; kind: EntryEvent['kind']; id: number } | null>(null);
  const [done, setDone] = useState<'success' | 'failed' | null>(null);
  const pulseRef = useRef<SVGCircleElement>(null);
  const targetRef = useRef<SVGCircleElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const noiseRef = useRef<HTMLDivElement>(null);
  const noiseWrapRef = useRef<HTMLDivElement>(null);
  const jid = useRef(0);
  const finished = useRef(false);

  const [wx, wy, wz] = SIDH_TARGET;
  const emitNoise = useCallback(
    (radius: number, severity: number, source: 'entry' | 'entry-fail') => runtime.noise.emit({ x: wx, y: wy, z: wz, radius, severity, source, byPlayer: true }, runtime.simTime),
    [runtime, wx, wy, wz],
  );

  const finish = useCallback(
    (status: 'success' | 'failed') => {
      if (finished.current) return;
      finished.current = true;
      setDone(status);
      if (status === 'success') {
        audio.play('entry-success');
        say(ENTRY_LINES.success, THIEF_NAME);
        useRunStore.getState().openHole('rahim', runtime.simTime);
        runtime.entry.progress = 0;
        setAction(runtime.player, null);
        window.setTimeout(() => crawlIntoRahimHouse(runtime), 450);
      } else {
        audio.play('entry-fail', { at: { x: wx, z: wz } });
        say(ENTRY_LINES.fail, THIEF_NAME);
        emitNoise(14, 1, 'entry-fail');
        useRunStore.getState().recordEntryFail(runtime.simTime);
        entryCooldown.until = runtime.simTime + ENTRY_RETRY_COOLDOWN;
        window.setTimeout(() => {
          if (useAppStore.getState().phase === 'entry') goTo('night');
        }, 900);
      }
    },
    [runtime, emitNoise, goTo, wx, wz],
  );

  const onEvent = useCallback(
    (ev: EntryEvent | null) => {
      if (!ev) {
        // A tap can end the attempt without producing a judgement (e.g. closing lapses push noise to 100).
        if (challenge.status !== 'running') finish(challenge.status);
        return;
      }
      runtime.entry.pulse++;
      const map = { perfect: ENTRY_LINES.perfect, good: ENTRY_LINES.good, miss: ENTRY_LINES.miss, lapse: ENTRY_LINES.lapse } as const;
      setJudgement({ text: map[ev.kind], kind: ev.kind, id: ++jid.current });
      if (ev.kind === 'perfect') {
        audio.play('tap-perfect');
        emitNoise(1.5, 0.08, 'entry');
      } else if (ev.kind === 'good') {
        audio.play('tap-good');
        emitNoise(2.2, 0.12, 'entry');
      } else if (ev.kind === 'miss') {
        audio.play('tap-miss');
        emitNoise(5, 0.35, 'entry');
      } else {
        emitNoise(3, 0.2, 'entry');
      }
      runtime.entry.progress = challenge.progress;
      if (challenge.status !== 'running') finish(challenge.status);
    },
    [runtime, challenge, emitNoise, finish],
  );

  const tap = useCallback(
    (eventTime?: number) => {
      if (hint || finished.current || useAppStore.getState().paused) return;
      onEvent(challenge.tap(clock.at(eventTime)));
    },
    [hint, challenge, clock, onEvent],
  );

  // Character faces the wall and "digs" (abstract cartoon motion); restore on exit.
  useEffect(() => {
    runtime.player.faceHeading = HEADING_INTO_HOUSE;
    runtime.entry.active = true;
    setAction(runtime.player, 'dig');
    return () => {
      runtime.player.faceHeading = null;
      runtime.entry.active = false;
      if (!finished.current || challenge.status !== 'success') runtime.entry.progress = 0;
      if (runtime.player.action === 'dig') setAction(runtime.player, null);
    };
  }, [runtime, challenge]);

  // Frame loop (visuals via refs; the challenge clock pauses with the game).
  useEffect(() => {
    let raf = 0;
    clock.tick();
    const loop = () => {
      const paused = useAppStore.getState().paused || hint;
      clock.setPaused(paused);
      const t = clock.tick();
      if (!paused && !finished.current) {
        const lapses = challenge.advance(t - challenge.time);
        for (const l of lapses) onEvent(l);
        // Safety net: never leave a finished challenge on screen (no soft lock).
        if (challenge.status !== 'running') finish(challenge.status);
      }
      const phase = challenge.pulsePhase(t);
      const err = Math.abs(challenge.timeToNextBeat(t));
      const inGood = err <= config.goodWindow;
      if (pulseRef.current) {
        pulseRef.current.setAttribute('r', String(TARGET_R + phase * PULSE_SPAN));
        pulseRef.current.setAttribute('stroke', inGood ? '#7fd17f' : '#f6f1e8');
        pulseRef.current.setAttribute('opacity', String(0.35 + 0.65 * (1 - phase)));
      }
      if (targetRef.current) targetRef.current.setAttribute('stroke-width', inGood ? '12' : '8');
      if (progressRef.current) progressRef.current.style.width = `${challenge.progress}%`;
      if (noiseRef.current) noiseRef.current.style.width = `${challenge.noise}%`;
      if (noiseWrapRef.current && !useAppStore.getState().settings.reducedMotion) {
        const wob = (challenge.noise / 100) * 3 * Math.sin(performance.now() / 45);
        noiseWrapRef.current.style.transform = `rotate(${wob}deg)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    debugHooks.entry = () => ({ msUntilNextBeat: challenge.timeToNextBeat(clock.now()) * 1000, time: challenge.time, progress: challenge.progress, noise: challenge.noise, status: challenge.status, hintVisible: hint });
    return () => {
      cancelAnimationFrame(raf);
      delete debugHooks.entry;
    };
  }, [clock, challenge, config.goodWindow, hint, onEvent, finish]);

  // Keyboard: Space / E / Enter tap.
  useEffect(() => {
    const keys = new Set(['Space', 'KeyE', 'Enter', 'NumpadEnter']);
    const down = (e: KeyboardEvent) => {
      if (!keys.has(e.code) || e.repeat) return;
      e.preventDefault();
      if (hint) {
        hintShownForSession.session = sessionId;
        setHint(false);
        return;
      }
      tap(e.timeStamp);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [tap, hint, sessionId]);

  const abort = () => {
    if (!finished.current) goTo('night');
  };

  return (
    <div className="safe-pad pointer-events-none fixed inset-0 z-20 flex items-end justify-center sm:items-center" data-testid="entry-overlay">
      <div
        className="panel pointer-events-auto relative mb-2 w-full max-w-sm touch-none p-4 sm:mb-0"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          e.preventDefault();
          tap(e.timeStamp);
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gold">সিঁধ কাটা — ছন্দ মেলাও</h2>
          <button type="button" className="rounded-lg px-3 py-2 text-sm text-moon underline" onClick={abort} data-testid="entry-abort">
            থামো
          </button>
        </div>
        <svg viewBox="0 0 240 240" className="mx-auto h-48 w-48 sm:h-56 sm:w-56" aria-hidden>
          <circle cx="120" cy="120" r={TARGET_R + PULSE_SPAN} fill="rgba(0,0,0,0.25)" />
          <circle ref={targetRef} cx="120" cy="120" r={TARGET_R} fill="none" stroke="#f2ad55" strokeWidth="8" />
          <circle ref={pulseRef} cx="120" cy="120" r={TARGET_R + PULSE_SPAN} fill="none" stroke="#f6f1e8" strokeWidth="5" />
          <text x="120" y="128" textAnchor="middle" fontSize="22" fill="#f6f1e8">
            {done === 'success' ? '✓' : done === 'failed' ? '✗' : 'চাপো'}
          </text>
        </svg>
        <div className="mt-2 space-y-2 text-sm">
          <div>
            <div className="mb-1 flex justify-between">
              <span>অগ্রগতি</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-black/40">
              <div ref={progressRef} className="h-full rounded-full bg-gold" style={{ width: '0%' }} />
            </div>
          </div>
          <div ref={noiseWrapRef}>
            <div className="mb-1 flex justify-between">
              <span>🔊 শব্দ</span>
              <span className="text-moon">১০০ হলে ধরা পড়ার ভয়!</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-black/40">
              <div ref={noiseRef} className="h-full rounded-full bg-danger" style={{ width: '0%' }} />
            </div>
          </div>
        </div>
        <p className="mt-2 h-6 text-center font-semibold" role="status">
          {judgement && (
            <span key={judgement.id} className={`caption-in ${judgement.kind === 'perfect' || judgement.kind === 'good' ? 'text-gold' : 'text-danger'}`}>
              {judgement.text}
            </span>
          )}
        </p>
        <p className="text-center text-xs text-moon">Space / E / ট্যাপ — Esc: বিরতি</p>
        {hint && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-hud/95 p-5 text-center" data-testid="entry-hint">
            <p className="text-lg font-semibold text-gold">কীভাবে খেলবে</p>
            <p className="leading-relaxed">{ENTRY_LINES.hint}</p>
            <p className="text-sm text-moon">এটা একদম কাল্পনিক কার্টুন খেলা — বাস্তবের কোনো কৌশল নয়।</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                hintShownForSession.session = sessionId;
                setHint(false);
              }}
              data-testid="entry-start"
            >
              শুরু করো
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
