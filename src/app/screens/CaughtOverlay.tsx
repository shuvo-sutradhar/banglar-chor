import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../state/useAppStore';
import { useRunStore } from '../../state/useRunStore';
import { audio } from '../../game/audio/AudioManager';
import { voice } from '../../game/audio/voice';
import { buildCatchSequence, CATCH_DURATION, CATCH_SKIP_AFTER, type CatchCue } from '../../game/audio/catchSequence';

type LineCue = Extract<CatchCue, { kind: 'line' }>;

/**
 * The comic catch: one cue list drives the overlapping subtitles, crowd voices and cartoon SFX in
 * sync with the 3D vignette (CaughtScene). Pause-aware; skippable after a moment, and skipping
 * silences every scheduled sound of the sequence at once.
 */
export function CaughtOverlay() {
  const goTo = useAppStore((s) => s.goTo);
  const zone = useAppStore((s) => s.zone);
  const showResults = useAppStore((s) => s.showResults);
  const rough = useAppStore((s) => s.settings.roughDialogue);
  const run = useRunStore((s) => s.run);
  const caughtBy = useRunStore((s) => s.caughtBy);
  const [shown, setShown] = useState(0);
  const [skippable, setSkippable] = useState(false);
  const done = useRef(false);

  const finish = useMemo(
    () => () => {
      if (done.current) return;
      done.current = true;
      audio.stopGroup('catch');
      voice.stopAll();
      if (useAppStore.getState().phase !== 'caught') return;
      if (zone === 'bazaar') showResults();
      else goTo('night-resolution');
    },
    [zone, showResults, goTo],
  );

  // Built once per catch (the run changes as the catch resolves; the sequence must not restart).
  const [cues] = useState(() =>
    buildCatchSequence({
      zone,
      caughtBy,
      dawn: run?.outcome === 'dawn-caught',
      rough,
      confiscated: run?.confiscated.map((i) => i.lootId) ?? [],
      seed: run?.seed ?? 0,
    }),
  );
  const lines = useMemo(() => cues.filter((c): c is LineCue => c.kind === 'line'), [cues]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let fired = 0;
    const loop = () => {
      const now = performance.now();
      if (!useAppStore.getState().paused) acc += Math.min(0.5, (now - last) / 1000);
      last = now;
      while (fired < cues.length && cues[fired]!.at <= acc) {
        const c = cues[fired++]!;
        if (c.kind === 'sfx') audio.play(c.sound, { gain: c.gain, group: 'catch' });
        else voice.crowd(c.lineId);
      }
      // Only re-render when a new subtitle appears (not every frame).
      const count = lines.filter((l) => l.at <= acc).length;
      setShown((c) => (c === count ? c : count));
      if (acc >= CATCH_SKIP_AFTER) setSkippable(true);
      if (acc >= CATCH_DURATION) {
        finish();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      audio.stopGroup('catch');
    };
  }, [cues, lines, finish]);

  const visible = lines.slice(0, shown).slice(-3);
  return (
    <div className="safe-pad pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-between" data-testid="caught-overlay">
      <div className="mt-6 text-center">
        <div className="text-5xl font-semibold text-danger drop-shadow-[0_3px_8px_rgba(0,0,0,0.7)]">ধরা খাইছি!</div>
      </div>
      <div className="mb-6 flex w-full max-w-lg flex-col items-center gap-2">
        {visible.map((l) => (
          <div key={l.at} className="caption-in panel w-full px-4 py-2 text-center text-lg">
            <span className="mr-2 font-semibold text-lantern">{l.speaker}:</span>
            {l.text}
          </div>
        ))}
        {skippable && (
          <button type="button" className="btn btn-primary pointer-events-auto mt-2 min-h-12" onClick={finish} data-testid="caught-skip">
            এগিয়ে যাও ›
          </button>
        )}
      </div>
    </div>
  );
}
