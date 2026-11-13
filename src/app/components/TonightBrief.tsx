import { nightBody } from '../../game/systems/nightBody';
import { MARKET_INFO, MODIFIER_INFO } from '../../game/systems/villageLife';
import { EQUIPMENT_BY_ID, FOOD_EFFECTS } from '../../game/data/economy';
import { useAppStore } from '../../state/useAppStore';
import { toBnDigits } from '../../lib/format';

/**
 * What tonight holds (Phase 4B): the night modifier, how wary the village is, tomorrow's market,
 * the loadout and tonight's food effect. Read-only, shown at the top during preparation so every
 * variation is announced before it matters (fair, never a surprise catch).
 */
export function TonightBrief() {
  const equipped = useAppStore((s) => s.profile.equipped);
  const b = nightBody.current;
  const plan = b.plan;
  const mod = MODIFIER_INFO[plan.modifier];
  const heat = b.loadout.heat;
  const wary = heat >= 50 ? 'গ্রাম খুব সজাগ' : heat >= 20 ? 'গ্রাম একটু সজাগ' : 'গ্রাম নিশ্চিন্তে ঘুমায়';
  return (
    <div className="pointer-events-auto mx-auto mb-auto mt-2 w-full max-w-md" data-testid="tonight-brief">
      <div className="panel px-3 py-2 text-xs leading-snug">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="text-sm font-semibold text-gold">
            রাত {toBnDigits(plan.day)} · {mod.nameBn}
          </span>
          <span className={heat >= 20 ? 'text-danger' : 'text-moon'}>{wary}</span>
        </div>
        <p className="text-moon">{mod.descBn}</p>
        {plan.day > 1 && (
          <p className="text-moon">
            কাল হাটে: {MARKET_INFO[plan.market].nameBn} — {MARKET_INFO[plan.market].descBn}
            {plan.dog && ' · রহিমের গলির মুখে একটা কুকুর ঘুমায়।'}
          </p>
        )}
        <p className="mt-0.5">
          {EQUIPMENT_BY_ID[equipped.tool].icon} {EQUIPMENT_BY_ID[equipped.tool].nameBn} · {EQUIPMENT_BY_ID[equipped.bag].icon} {EQUIPMENT_BY_ID[equipped.bag].nameBn} · {EQUIPMENT_BY_ID[equipped.footwear].icon} {EQUIPMENT_BY_ID[equipped.footwear].nameBn}
          {b.loadout.buff && <span className="text-lantern"> · {FOOD_EFFECTS[b.loadout.buff].nameBn}</span>}
          <span className="text-moon"> · ⚡{toBnDigits(Math.round(b.loadout.energy))}</span>
        </p>
      </div>
    </div>
  );
}
