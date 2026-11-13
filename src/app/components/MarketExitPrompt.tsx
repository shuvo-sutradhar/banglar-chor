import { useRunStore } from '../../state/useRunStore';
import type { GameRuntime } from '../../game/GameRuntime';
import { leaveMarket } from '../../game/systems/marketActions';
import { toBnDigits } from '../../lib/format';

/** Shown while standing in a gate: finish the market and settle, or stay. */
export function MarketExitPrompt({ runtime }: { runtime: GameRuntime }) {
  const gate = useRunStore((s) => s.exitPrompt);
  const left = useRunStore((s) => s.run?.inventory.length ?? 0);
  if (!gate) return null;
  return (
    <div className="safe-pad pointer-events-none fixed inset-x-0 top-24 z-30 flex justify-center" data-testid="exit-prompt">
      <div className="panel pointer-events-auto w-full max-w-sm p-4 text-center" onPointerDown={(e) => e.stopPropagation()}>
        <p className="mb-1 text-lg font-semibold text-gold">হাট থেকে বের হবে?</p>
        <p className="mb-3 text-sm text-ink/85">{left > 0 ? `ঝোলায় এখনো ${toBnDigits(left)}টা জিনিস আছে — না বেচলে কম স্কোর পাবে।` : 'সব বেচা শেষ — এবার হিসাব!'}</p>
        <button type="button" className="btn btn-primary w-full" onClick={() => leaveMarket(runtime, false)} data-testid="exit-confirm">
          হ্যাঁ, হিসাব শেষ করো
        </button>
        <p className="mt-2 text-xs text-moon">থাকতে চাইলে গেট থেকে সরে যাও।</p>
      </div>
    </div>
  );
}
