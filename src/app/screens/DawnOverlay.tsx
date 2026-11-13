import { useEffect, useRef, useState } from 'react';
import { PausableClock } from '../../lib/PausableClock';
import { useAppStore } from '../../state/useAppStore';
import { useHudStore } from '../../state/useHudStore';
import { daylight } from '../../game/effects/daylight';
import { DAWN_LINES } from '../../game/data/marketDialogue';
import { THIEF_NAME } from '../../game/data/dialogue';
import { audio } from '../../game/audio/AudioManager';
import { debugHooks } from '../../game/debugHooks';

const DURATION = 7.5;

/**
 * Night → dawn transition: animates the real 3D lighting (daylight.factor 0 → 1) over ~7 s while
 * the thief stretches at the village edge, with short comic lines. Skippable; honours pause.
 * Then a brief "going to the haat" veil while the bazaar zone mounts (no page reload).
 */
export function DawnOverlay() {
  const enterBazaar = useAppStore((s) => s.enterBazaar);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    const clock = new PausableClock();
    let raf = 0;
    let lineIdx = 0;
    audio.play('prep-done');
    const go = () => {
      if (done.current) return;
      done.current = true;
      setLeaving(true);
      // Let the veil paint before mounting the bazaar (it is procedural, so this is short).
      window.setTimeout(() => {
        daylight.factor = 1;
        enterBazaar();
      }, 450);
    };
    const loop = () => {
      clock.setPaused(useAppStore.getState().paused);
      const t = clock.tick();
      const k = Math.min(1, t / DURATION);
      daylight.factor = k * k * (3 - 2 * k);
      const due = Math.floor((t / DURATION) * DAWN_LINES.length);
      if (due >= lineIdx && lineIdx < DAWN_LINES.length) {
        useHudStore.getState().showCaption(DAWN_LINES[lineIdx]!, THIEF_NAME);
        lineIdx++;
      }
      if (k >= 1) {
        go();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    debugHooks.dawn = () => ({ progress: daylight.factor });
    (window as unknown as { __sidhelSkipDawn?: () => void }).__sidhelSkipDawn = go;
    return () => {
      cancelAnimationFrame(raf);
      delete debugHooks.dawn;
    };
  }, [enterBazaar]);

  const skip = () => {
    const fn = (window as unknown as { __sidhelSkipDawn?: () => void }).__sidhelSkipDawn;
    fn?.();
  };

  const caption = useHudStore((s) => s.caption);
  return (
    <div className="safe-pad pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-between" data-testid="dawn-overlay">
      <div className="mt-6 text-center">
        <div className="text-4xl font-semibold text-gold drop-shadow-[0_3px_8px_rgba(0,0,0,0.6)]">ভোর হলো!</div>
        <div className="mt-1 text-ink/90 drop-shadow">মোরগ ডাকছে — চলো হাটে</div>
      </div>
      <div className="mb-6 flex w-full max-w-md flex-col items-center gap-3">
        {caption && (
          <div key={caption.id} className="caption-in panel px-4 py-2 text-center text-lg">
            <span className="mr-2 font-semibold text-lantern">{caption.speaker}:</span>
            {caption.text}
          </div>
        )}
        <button type="button" className="btn btn-primary pointer-events-auto" onClick={skip} data-testid="dawn-skip">
          সরাসরি হাটে যাও ›
        </button>
      </div>
      {leaving && (
        <div className="pointer-events-auto fixed inset-0 grid place-items-center bg-night/80" role="status">
          <div className="animate-pulse text-xl text-gold">হাটে যাচ্ছি…</div>
        </div>
      )}
    </div>
  );
}
