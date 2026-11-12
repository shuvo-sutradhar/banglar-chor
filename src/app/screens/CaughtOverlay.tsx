import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../state/useAppStore';
import { useRunStore } from '../../state/useRunStore';
import { CATCH_LINES, MOJNU_NAME, RAHIM_NAME, THIEF_NAME } from '../../game/data/dialogue';

type Line = { at: number; speaker: string; text: string };

const SKIP_AFTER = 1.2;
const DURATION = 6.4;

/** Timed overlapping subtitles for the 3D catch vignette; skippable after a moment. */
export function CaughtOverlay() {
  const goTo = useAppStore((s) => s.goTo);
  const rough = useAppStore((s) => s.settings.roughDialogue);
  const run = useRunStore((s) => s.run);
  const caughtBy = useRunStore((s) => s.caughtBy);
  const [shown, setShown] = useState(0);
  const [skippable, setSkippable] = useState(false);

  const lines = useMemo<Line[]>(() => {
    const items = run?.confiscated.map((i) => i.lootId) ?? [];
    const p = CATCH_LINES.punchlines;
    const special = (['actual-jewelry', 'dentures', 'chicken', 'old-radio', 'alarm-clock'] as const).find((id) => items.includes(id));
    const punch = items.length === 0 ? p.empty : special ? p[special] : p.other[(run?.seed ?? 0) % p.other.length]!;
    const dawn = run?.outcome === 'dawn-caught';
    return [
      dawn
        ? { at: 0.1, speaker: 'গ্রামবাসী', text: 'ভোর হয়ে গেছে — চোর এখনো গ্রামে!' }
        : caughtBy === 'rahim'
          ? { at: 0.1, speaker: RAHIM_NAME, text: 'চোর! চোর! আমার ঘরে চোর! কে আছ, আসো!' }
          : { at: 0.1, speaker: MOJNU_NAME, text: CATCH_LINES.mojnu },
      { at: 1.2, speaker: 'প্রতিবেশী', text: rough ? CATCH_LINES.roughA : CATCH_LINES.familyA },
      { at: 2.1, speaker: 'আরেক প্রতিবেশী', text: rough ? CATCH_LINES.roughB : CATCH_LINES.familyB },
      { at: 3.1, speaker: THIEF_NAME, text: CATCH_LINES.thief },
      { at: 4.3, speaker: caughtBy === 'rahim' ? RAHIM_NAME : MOJNU_NAME, text: punch },
    ];
  }, [run, rough, caughtBy]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = () => {
      const now = performance.now();
      if (!useAppStore.getState().paused) acc += Math.min(0.5, (now - last) / 1000);
      last = now;
      // Only re-render when a new subtitle appears (not every frame).
      const count = lines.filter((l) => l.at <= acc).length;
      setShown((c) => (c === count ? c : count));
      if (acc >= SKIP_AFTER) setSkippable(true);
      if (acc >= DURATION) {
        if (useAppStore.getState().phase === 'caught') goTo('night-resolution');
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [goTo, lines]);

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
          <button type="button" className="btn btn-primary pointer-events-auto mt-2" onClick={() => goTo('night-resolution')} data-testid="caught-skip">
            এগিয়ে যাও ›
          </button>
        )}
      </div>
    </div>
  );
}
