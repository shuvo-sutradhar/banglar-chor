import { useEffect, useState } from 'react';
import { useHudStore } from '../../state/useHudStore';
import { currentEnergy, eatSnack, nightBody } from '../../game/systems/nightBody';
import { SUPPLIES } from '../../game/data/economy';
import { audio } from '../../game/audio/AudioManager';
import { toBnDigits } from '../../lib/format';
import { countRender } from '../../game/perfCounters';

/**
 * Stamina (dam, short-term) and energy (shokti, carried between nights) in the HUD (Phase 4B).
 * Re-renders only when the quantised stamina value changes (5 % steps) or a snack is eaten.
 * The snack button appears only while the thief carries one.
 */
export function StaminaBar() {
  const stamina = useHudStore((s) => s.stamina);
  const exhausted = useHudStore((s) => s.exhausted);
  const [, bump] = useState(0);
  const [energy, setEnergy] = useState(() => Math.round(currentEnergy()));
  // Energy changes slowly (exertion): refresh it every couple of seconds, not per frame.
  useEffect(() => {
    const t = window.setInterval(() => setEnergy(Math.round(currentEnergy())), 2000);
    return () => window.clearInterval(t);
  }, []);
  const snacks = nightBody.current.supplies['gur-chira'] ?? 0;
  const pct = Math.round(stamina * 100);
  countRender('StaminaBar');
  return (
    <div className="pointer-events-auto flex items-center gap-2" data-testid="stamina-hud">
      <div className="panel w-32 px-2 py-1 text-[11px] leading-tight" role="group" aria-label="দম ও শক্তি">
        <div className="flex justify-between">
          <span>{exhausted ? '😮‍💨 হাঁপাচ্ছি' : '💨 দম'}</span>
          <span className="tabular-nums text-moon">⚡{toBnDigits(energy)}</span>
        </div>
        <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-black/40" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="দম">
          <div className={`h-full rounded-full ${exhausted || pct < 25 ? 'bg-danger' : 'bg-[#7fd17f]'}`} style={{ width: `${pct}%` }} data-testid="stamina-fill" />
        </div>
      </div>
      {snacks > 0 && (
        <button
          type="button"
          className="touch-btn h-11 min-w-11 px-2 text-base"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (eatSnack('gur-chira')) {
              audio.play('eat-crunch');
              bump((n) => n + 1);
              setEnergy(Math.round(currentEnergy()));
            }
          }}
          aria-label={`${SUPPLIES['gur-chira'].nameBn} খাও (${snacks})`}
          data-testid="eat-snack"
        >
          {SUPPLIES['gur-chira'].icon}
          <span className="ml-0.5 text-xs">{toBnDigits(snacks)}</span>
        </button>
      )}
    </div>
  );
}
