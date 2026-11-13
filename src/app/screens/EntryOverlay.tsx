import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PausableClock } from '../../lib/PausableClock';
import { useAppStore } from '../../state/useAppStore';
import { useRunStore } from '../../state/useRunStore';
import type { GameRuntime } from '../../game/GameRuntime';
import { EntryChallenge, entryConfigFor, type EntryEvent } from '../../game/systems/entryChallenge';
import { HOUSE_PROFILES } from '../../game/data/houses';
import { ENTRY_LINES, THIEF_NAME } from '../../game/data/dialogue';
import { HEADING_INTO_HOUSE, SIDH_TARGET } from '../../game/data/rahimHouse';
import { setAction } from '../../game/characters/rigTypes';
import { digClipPhase } from '../../game/characters/glb/clipSelect';
import { audio } from '../../game/audio/AudioManager';
import { voiceLine } from '../../game/audio/voiceLines';
import { debugHooks } from '../../game/debugHooks';
import { nightBody } from '../../game/systems/nightBody';
import { EQUIPMENT_BY_ID } from '../../game/data/economy';
import { crawlIntoRahimHouse, ENTRY_RETRY_COOLDOWN, entryCooldown, say } from '../../game/systems/nightActions';

/** Shown once per run before the first attempt (README §8 "add a hint before the first attempt"). */
const hintShownForSession = { session: -1 };

const TARGET_R = 54;
const PULSE_SPAN = 80;

/**
 * Fictional cartoon "sidh" challenge (Phase 4B). The thief kneels at the wall with his equipped
 * cartoon tool; every beat he swings (the Dig clip is phase-locked so the strike lands on the
 * beat). Timing fills Progress; mistakes raise Noise AND emit real world noise events at the wall
 * that Rahim (inside) and the patrol can hear. Each swing costs stamina: a tired thief digs less
 * per swing, so resting ("জিরাও") is a real choice: the beats wait and the noise settles, but the
 * night clock keeps running. The player can always retreat ("থামো").
 * It depicts no real tool technique or structural weakness.
 */
export function EntryOverlay({ runtime }: { runtime: GameRuntime }) {
  const sessionId = useAppStore((s) => s.sessionId);
  const goTo = useAppStore((s) => s.goTo);
  const body = nightBody.current;
  const toolId = useAppStore.getState().profile.equipped.tool;
  const tool = EQUIPMENT_BY_ID[toolId];
  const config = useMemo(() => entryConfigFor(HOUSE_PROFILES.rahim.entry, body.loadout.mods, body.loadout.buff === 'sharp-eyes'), [body]);
  const challenge = useMemo(() => new EntryChallenge(config), [config]);
  const clock = useMemo(() => new PausableClock(), []);
  const [hint, setHint] = useState(() => hintShownForSession.session !== sessionId);
  const [judgement, setJudgement] = useState<{ text: string; kind: EntryEvent['kind']; id: number } | null>(null);
  const [done, setDone] = useState<'success' | 'failed' | null>(null);
  const [resting, setResting] = useState(false);
  const pulseRef = useRef<SVGCircleElement>(null);
  const targetRef = useRef<SVGCircleElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const noiseRef = useRef<HTMLDivElement>(null);
  const staminaRef = useRef<HTMLDivElement>(null);
  const noiseWrapRef = useRef<HTMLDivElement>(null);
  const jid = useRef(0);
  const finished = useRef(false);
  const tiredWarned = useRef(false);

  const [wx, wy, wz] = SIDH_TARGET;
  const wall = useMemo(() => ({ x: wx, z: wz }), [wx, wz]);
  const emitNoise = useCallback(
    (radius: number, severity: number, source: 'entry' | 'entry-fail') => runtime.noise.emit({ x: wx, y: wy, z: wz, radius, severity, source, byPlayer: true }, runtime.simTime),
    [runtime, wx, wy, wz],
  );

  const finish = useCallback(
    (status: 'success' | 'failed') => {
      if (finished.current) return;
      finished.current = true;
      setDone(status);
      runtime.player.clipPhase = null;
      if (status === 'success') {
        audio.play('entry-success');
        say(ENTRY_LINES.success, THIEF_NAME);
        useRunStore.getState().openHole('rahim', runtime.simTime);
        runtime.entry.progress = 0;
        setAction(runtime.player, null);
        runtime.player.tool = null;
        window.setTimeout(() => crawlIntoRahimHouse(runtime), 450);
      } else {
        audio.play('entry-fail', { at: wall });
        say(ENTRY_LINES.fail, THIEF_NAME);
        emitNoise(14, 1, 'entry-fail');
        useRunStore.getState().recordEntryFail(runtime.simTime);
        entryCooldown.until = runtime.simTime + ENTRY_RETRY_COOLDOWN;
        window.setTimeout(() => {
          if (useAppStore.getState().phase === 'entry') goTo('night');
        }, 900);
      }
    },
    [runtime, emitNoise, goTo, wall],
  );

  const loud = (tool.mods.entryNoise ?? 1) > 1.1;
  const onEvent = useCallback(
    (ev: EntryEvent | null) => {
      if (!ev) {
        // A tap can end the attempt without producing a judgement (e.g. closing lapses push noise to 100).
        if (challenge.status !== 'running') finish(challenge.status);
        return;
      }
      runtime.entry.pulse++;
      runtime.entry.lastKind = ev.kind;
      const map = { perfect: ENTRY_LINES.perfect, good: ENTRY_LINES.good, miss: ENTRY_LINES.miss, lapse: ENTRY_LINES.lapse } as const;
      setJudgement({ text: map[ev.kind], kind: ev.kind, id: ++jid.current });
      const n = config.noiseHit / Math.max(HOUSE_PROFILES.rahim.entry.noiseHit, 1e-6);
      if (ev.kind === 'perfect') {
        audio.play('dig-thunk', { at: wall });
        audio.play('tap-perfect', { gain: 0.5 });
        emitNoise(1.5 * n, 0.08, 'entry');
      } else if (ev.kind === 'good') {
        audio.play('dig-scrape', { at: wall });
        emitNoise(2.2 * n, 0.12, 'entry');
      } else if (ev.kind === 'miss') {
        audio.play(loud ? 'tool-clang' : 'tap-miss', { at: wall });
        if (loud) say(voiceLine('thief.tool.clang')!.text, THIEF_NAME);
        emitNoise(5 * n, 0.35, 'entry');
      } else {
        emitNoise(3 * n, 0.2, 'entry');
      }
      runtime.entry.progress = challenge.progress;
      if (challenge.status !== 'running') finish(challenge.status);
    },
    [runtime, challenge, emitNoise, finish, config.noiseHit, loud, wall],
  );

  const tap = useCallback(
    (eventTime?: number) => {
      if (hint || finished.current || useAppStore.getState().paused || challenge.resting) return;
      // Every swing costs stamina; an exhausted thief swings weakly (less progress per beat).
      const st = nightBody.current.stamina;
      const power = st.spend(st.params.digCost);
      st.digs++;
      if (power < 1 && !tiredWarned.current) {
        tiredWarned.current = true;
        audio.play('pant');
        say(voiceLine('thief.tool.tired')!.text, THIEF_NAME);
      }
      onEvent(challenge.tap(clock.at(eventTime), power));
    },
    [hint, challenge, clock, onEvent],
  );

  const toggleRest = useCallback(() => {
    if (hint || finished.current) return;
    const next = !challenge.resting;
    challenge.setResting(next);
    setResting(next);
    tiredWarned.current = false;
    if (next) {
      setAction(runtime.player, 'rest');
      runtime.player.clipPhase = null;
      audio.play('rest-sigh');
      say(voiceLine('thief.tool.rest')!.text, THIEF_NAME);
    } else setAction(runtime.player, 'dig');
  }, [hint, challenge, runtime]);

  // The thief kneels at the wall with his tool and swings on the beat; restore on exit.
  useEffect(() => {
    runtime.player.faceHeading = HEADING_INTO_HOUSE;
    runtime.entry.active = true;
    runtime.player.tool = toolId;
    setAction(runtime.player, 'dig');
    return () => {
      runtime.player.faceHeading = null;
      runtime.entry.active = false;
      runtime.player.tool = null;
      runtime.player.clipPhase = null;
      if (!finished.current || challenge.status !== 'success') runtime.entry.progress = 0;
      if (runtime.player.action === 'dig' || runtime.player.action === 'rest') setAction(runtime.player, null);
    };
  }, [runtime, challenge, toolId]);

  // Frame loop (visuals via refs; the challenge clock pauses with the game).
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    clock.tick();
    const loop = () => {
      const paused = useAppStore.getState().paused || hint;
      clock.setPaused(paused);
      const t = clock.tick();
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!paused && !finished.current) {
        const lapses = challenge.advance(t - challenge.time);
        for (const l of lapses) onEvent(l);
        // Resting recovers faster than the normal between-swings regeneration.
        if (challenge.resting) {
          const st = nightBody.current.stamina;
          st.refill(st.params.regenPerSec * 1.2 * dt);
        }
        // Safety net: never leave a finished challenge on screen (no soft lock).
        if (challenge.status !== 'running') finish(challenge.status);
      }
      // Phase-lock the swing to the rhythm (the strike frame lands on the beat).
      if (!challenge.resting && !finished.current && !hint) runtime.player.clipPhase = digClipPhase(challenge.timeToNextBeat(t), config.beatInterval);
      const phase = challenge.pulsePhase(t);
      const err = Math.abs(challenge.timeToNextBeat(t));
      const inGood = err <= config.goodWindow && !challenge.resting;
      if (pulseRef.current) {
        pulseRef.current.setAttribute('r', String(TARGET_R + (challenge.resting ? 1 : phase) * PULSE_SPAN));
        pulseRef.current.setAttribute('stroke', inGood ? '#7fd17f' : '#f6f1e8');
        pulseRef.current.setAttribute('opacity', challenge.resting ? '0.2' : String(0.35 + 0.65 * (1 - phase)));
      }
      if (targetRef.current) targetRef.current.setAttribute('stroke-width', inGood ? '12' : '8');
      if (progressRef.current) progressRef.current.style.width = `${challenge.progress}%`;
      if (noiseRef.current) noiseRef.current.style.width = `${challenge.noise}%`;
      const st = nightBody.current.stamina;
      if (staminaRef.current) {
        staminaRef.current.style.width = `${Math.round(st.ratio * 100)}%`;
        staminaRef.current.style.backgroundColor = st.exhausted || st.ratio < 0.25 ? '#d8583e' : '#7fd17f';
      }
      if (noiseWrapRef.current && !useAppStore.getState().settings.reducedMotion) {
        const wob = (challenge.noise / 100) * 3 * Math.sin(performance.now() / 45);
        noiseWrapRef.current.style.transform = `rotate(${wob}deg)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    debugHooks.entry = () => ({
      msUntilNextBeat: challenge.timeToNextBeat(clock.now()) * 1000,
      time: challenge.time,
      progress: challenge.progress,
      noise: challenge.noise,
      status: challenge.status,
      hintVisible: hint,
      resting: challenge.resting,
      stamina: nightBody.current.stamina.value,
      tool: toolId,
      clipPhase: runtime.player.clipPhase ?? null,
    });
    return () => {
      cancelAnimationFrame(raf);
      delete debugHooks.entry;
    };
  }, [clock, challenge, config.goodWindow, config.beatInterval, hint, onEvent, finish, runtime, toolId]);

  // Keyboard: Space / E / Enter tap; R rests.
  useEffect(() => {
    const keys = new Set(['Space', 'KeyE', 'Enter', 'NumpadEnter']);
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'KeyR' && !hint) {
        e.preventDefault();
        toggleRest();
        return;
      }
      if (!keys.has(e.code)) return;
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
  }, [tap, hint, sessionId, toggleRest]);

  const abort = () => {
    if (!finished.current) goTo('night');
  };

  // Compact strip at the bottom: the 3D scene (the thief swinging his tool, flying dirt, the
  // growing hole in the wall) stays visible — the action IS the feedback. Tap anywhere on the strip.
  return (
    <div className="safe-pad pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-end" data-testid="entry-overlay">
      <p className="mb-1 h-7 text-center text-xl font-semibold [@media(max-height:500px)]:!text-base [@media(max-height:500px)]:!h-6 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]" role="status">
        {judgement && (
          <span key={judgement.id} className={`caption-in ${judgement.kind === 'perfect' || judgement.kind === 'good' ? 'text-gold' : 'text-danger'}`}>
            {judgement.text}
          </span>
        )}
      </p>
      <div
        className="pointer-events-auto relative mb-1 flex w-full max-w-2xl touch-none select-none items-center gap-3 rounded-2xl border border-moon/20 bg-hud/70 p-2 backdrop-blur-sm sm:gap-4 sm:p-3 [@media(max-height:500px)]:max-w-xl [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:!p-1.5"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          e.preventDefault();
          tap(e.timeStamp);
        }}
      >
        <svg viewBox="0 0 240 240" className="h-20 w-20 shrink-0 sm:h-24 sm:w-24 [@media(max-height:500px)]:!h-14 [@media(max-height:500px)]:!w-14" aria-hidden>
          <circle cx="120" cy="120" r={TARGET_R + PULSE_SPAN} fill="rgba(0,0,0,0.3)" />
          <circle ref={targetRef} cx="120" cy="120" r={TARGET_R} fill="none" stroke="#f2ad55" strokeWidth="8" />
          <circle ref={pulseRef} cx="120" cy="120" r={TARGET_R + PULSE_SPAN} fill="none" stroke="#f6f1e8" strokeWidth="5" />
          <text x="120" y="132" textAnchor="middle" fontSize="34" fill="#f6f1e8">
            {done === 'success' ? '✓' : done === 'failed' ? '✗' : resting ? 'জিরাই' : 'চাপো'}
          </text>
        </svg>
        <div className="min-w-0 flex-1 space-y-1 text-xs sm:text-sm [@media(max-height:500px)]:space-y-0.5 [@media(max-height:500px)]:!text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold text-gold [@media(max-height:500px)]:hidden">সিঁধ কাটা — ছন্দ মেলাও</span>
            <span className="truncate text-moon" data-testid="entry-tool">
              {tool.icon} {tool.nameBn}
            </span>
          </div>
          <Meter label="অগ্রগতি" barRef={progressRef} className="bg-gold" />
          <div ref={noiseWrapRef}>
            <Meter label="🔊 শব্দ" note="১০০ = ধরা পড়ার ভয়" barRef={noiseRef} className="bg-danger" />
          </div>
          <div data-testid="entry-stamina">
            <Meter label="💨 দম" note="ক্লান্ত হলে কোপ দুর্বল" barRef={staminaRef} initial="100%" style={{ backgroundColor: '#7fd17f' }} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 [@media(max-height:500px)]:flex-row">
          <button type="button" className={`btn !min-h-11 !px-3 !text-sm ${resting ? 'btn-primary' : 'btn-ghost'}`} onClick={toggleRest} aria-pressed={resting} data-testid="entry-rest">
            {resting ? 'আবার শুরু' : 'জিরাও'} <span className="hidden text-xs opacity-70 sm:inline">(R)</span>
          </button>
          <button type="button" className="btn btn-ghost !min-h-11 !px-3 !text-sm" onClick={abort} data-testid="entry-abort">
            থামো
          </button>
        </div>
      </div>
      <p className="mb-1 hidden text-center text-xs text-moon drop-shadow sm:block [@media(max-height:500px)]:!hidden">Space / E / ট্যাপ — R: জিরাও — Esc: বিরতি</p>
      {hint && (
        <div className="pointer-events-auto fixed inset-0 z-30 grid place-items-center bg-black/30 p-4" data-testid="entry-hint">
          <div className="panel flex max-w-sm flex-col items-center gap-3 p-5 text-center">
            <p className="text-lg font-semibold text-gold">কীভাবে খেলবে</p>
            <p className="leading-relaxed">{ENTRY_LINES.hint}</p>
            <p className="text-sm leading-relaxed text-moon">প্রতি কোপে দম খরচ হয় — ক্লান্ত হলে “জিরাও”। জিরানোর সময় ছন্দ থামে, শব্দ কমে, কিন্তু রাত গড়ায়।</p>
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
        </div>
      )}
    </div>
  );
}

function Meter({ label, note, barRef, className = '', initial = '0%', style }: { label: string; note?: string; barRef: React.RefObject<HTMLDivElement | null>; className?: string; initial?: string; style?: React.CSSProperties }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 sm:w-20">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/50">
        <div ref={barRef} className={`h-full rounded-full ${className}`} style={{ width: initial, ...style }} />
      </div>
      {note && <span className="hidden shrink-0 text-[11px] text-moon lg:inline">{note}</span>}
    </div>
  );
}
