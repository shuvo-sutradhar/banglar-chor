import { useRef, useState } from 'react';
import { useAppStore } from '../../state/useAppStore';
import { audio } from '../../game/audio/AudioManager';
import { voice } from '../../game/audio/voice';
import { voiceLine } from '../../game/audio/voiceLines';
import { EQUIPMENT, FOOD_EFFECTS, FOODS, SUPPLIES, type EquipSlot, type Equipment, type Food } from '../../game/data/economy';
import { formatTaka, toBnDigits } from '../../lib/format';
import { safehouseAction } from '../../game/scenes/safehouseState';
import type { Failure, OpResult } from '../../game/systems/progression';

type Tab = 'food' | 'gear' | 'supplies';

const FAIL_TEXT: Record<Failure, string> = {
  funds: 'টাকা নাই! আগে হাটে কিছু বেচতে হবে।',
  owned: 'এইটা তো আগেই আছে।',
  'not-owned': 'আগে কিনতে হবে।',
  'daily-limit': 'আজকে একবার হইছে — কাল আবার।',
  full: 'পেট ভরা, শক্তিও পুরা!',
  unknown: 'এইটা পাওয়া গেল না।',
  duplicate: '',
  'none-left': 'আর নাই।',
};

const SLOT_NAME: Record<EquipSlot, string> = { tool: 'সিঁধের সরঞ্জাম (কার্টুন)', bag: 'ঝোলা', footwear: 'পা' };

let txCounter = 0;
let toastSeq = 0;
const nextToastId = () => ++toastSeq;
const clockMs = () => performance.now();
/** One id per user action: a duplicated event (double tap, re-dispatch) is applied only once. */
function newTx(): string {
  txCounter += 1;
  return `tx-${Date.now().toString(36)}-${txCounter}`;
}

function act(kind: typeof safehouseAction.kind, ms: number) {
  safehouseAction.kind = kind;
  safehouseAction.until = performance.now() + ms;
}

function modsText(e: Equipment): string {
  const m = e.mods;
  const parts: string[] = [];
  const pct = (v: number) => `${v > 1 ? '+' : '−'}${toBnDigits(Math.round(Math.abs(v - 1) * 100))}%`;
  if (m.entryProgress && m.entryProgress !== 1) parts.push(`কাজ ${pct(m.entryProgress)}`);
  if (m.entryNoise && m.entryNoise !== 1) parts.push(`ভুলের শব্দ ${pct(m.entryNoise)}`);
  if (m.entryStamina && m.entryStamina !== 1) parts.push(`দম খরচ ${pct(m.entryStamina)}`);
  if (m.carryKg) parts.push(`+${toBnDigits(m.carryKg)} কেজি`);
  if (m.footstepNoise && m.footstepNoise !== 1) parts.push(`পায়ের শব্দ ${pct(m.footstepNoise)}`);
  if (m.sprintCost && m.sprintCost !== 1) parts.push(`দৌড়ে দম ${pct(m.sprintCost)}`);
  if (m.runSpeed && m.runSpeed !== 1) parts.push(`দৌড়ের গতি ${pct(m.runSpeed)}`);
  return parts.join(' · ');
}

/**
 * Safehouse by day (Phase 4B): review money and energy, eat, nap, buy and equip upgrades and
 * night supplies, then prepare for the next night. Every purchase carries a transaction id and is
 * applied atomically together with the save (systems/progression.ts). Mobile-first: one bottom
 * sheet, large touch targets, no hover-only information.
 */
export function SafehouseOverlay() {
  const profile = useAppStore((s) => s.profile);
  const settlement = useAppStore((s) => s.lastSettlement);
  const eatFood = useAppStore((s) => s.eatFood);
  const takeNap = useAppStore((s) => s.takeNap);
  const buyItem = useAppStore((s) => s.buyItem);
  const equipItem = useAppStore((s) => s.equipItem);
  const buySupplies = useAppStore((s) => s.buySupplies);
  const startRun = useAppStore((s) => s.startRun);
  const returnToMenu = useAppStore((s) => s.returnToMenu);
  const [tab, setTab] = useState<Tab>('food');
  const [toast, setToast] = useState<{ text: string; bad: boolean; id: number } | null>(null);
  const busy = useRef(0);

  const feedback = (r: OpResult, okText: string, line?: string) => {
    if (r.ok) {
      setToast({ text: okText, bad: false, id: nextToastId() });
      if (line) voice.speak(line);
    } else if (r.reason !== 'duplicate') {
      audio.play('no-money');
      if (r.reason === 'funds') {
        act('broke', 1400);
        voice.speak('thief.shop.broke');
      }
      setToast({ text: FAIL_TEXT[r.reason], bad: true, id: nextToastId() });
    }
  };

  /** Guard against double taps while an action animation plays (in addition to tx ids). */
  const guarded = (ms: number, fn: () => void) => {
    const now = clockMs();
    if (now < busy.current) return;
    busy.current = now + ms;
    fn();
  };

  const onEat = (f: Food) =>
    guarded(500, () => {
      const r = eatFood(f.id, newTx());
      if (r.ok) {
        act('eat', 3200);
        audio.play(f.id === 'cha-biscuit' ? 'slurp' : 'eat-crunch');
        window.setTimeout(() => audio.play('gulp'), 900);
      }
      feedback(r, `${f.nameBn} খাওয়া হলো: শক্তি +${toBnDigits(f.energy)}${f.effect ? ` · ${FOOD_EFFECTS[f.effect].nameBn}` : ''}`, voiceLine(f.reactionLine)?.id);
    });

  const onNap = () =>
    guarded(500, () => {
      const r = takeNap(newTx());
      if (r.ok) {
        act('nap', 3500);
        audio.play('rest-sigh');
      }
      feedback(r, 'একটু ঘুমালাম: শক্তি +২০', 'thief.rest.nap');
    });

  const onBuy = (e: Equipment) =>
    guarded(500, () => {
      const r = buyItem(e.id, newTx());
      if (r.ok) {
        audio.play('buy');
        act(e.slot === 'tool' ? 'show-tool' : 'proud', 2600);
      }
      feedback(r, `${e.nameBn} কেনা হলো — পরে নেওয়া হয়েছে।`, 'thief.shop.bought');
    });

  const onEquip = (e: Equipment) => {
    const r = equipItem(e.id);
    if (r.ok) {
      audio.play('equip');
      if (e.slot === 'tool') act('show-tool', 2200);
    }
    feedback(r, `${e.nameBn} পরে নিলাম।`);
  };

  const onSupply = () =>
    guarded(400, () => {
      const r = buySupplies('gur-chira', newTx());
      if (r.ok) audio.play('buy');
      feedback(r, `${SUPPLIES['gur-chira'].nameBn} ঝোলায় নিলাম (${toBnDigits(r.profile.supplies['gur-chira'])}টা)।`);
    });

  const freeMealUsed = profile.freeMealDay === profile.day;
  const napUsed = profile.napDay === profile.day;
  const energyPct = Math.round(profile.energy);

  return (
    <div className="safe-pad pointer-events-none fixed inset-0 z-20 flex flex-col justify-end sm:items-end sm:justify-center sm:pr-6" data-testid="safehouse">
      <div className="panel pointer-events-auto flex max-h-[68dvh] w-full flex-col sm:max-h-[92dvh] sm:w-[26rem]">
        {/* Status header: money, energy, buff */}
        <div className="border-b border-moon/20 px-4 pb-2 pt-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold text-gold">নিজের উঠান — দিন {toBnDigits(Math.max(1, profile.day))}</h1>
              <p className="text-xs text-moon">খাও, জিরাও, সরঞ্জাম কেনো — তারপর আবার রাত।</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-moon">জমানো টাকা</div>
              <div className="text-2xl font-semibold tabular-nums text-gold" data-testid="bank">
                {formatTaka(profile.bank)}
              </div>
            </div>
          </div>
          {settlement && settlement.earned > 0 && (
            <p className="mt-1 text-xs text-lantern" data-testid="last-earned">
              গত রাতের কামাই: +{formatTaka(settlement.earned)}
            </p>
          )}
          <div className="mt-2" data-testid="energy">
            <div className="mb-1 flex justify-between text-sm">
              <span>⚡ শক্তি</span>
              <span className="tabular-nums" data-testid="energy-value">
                {toBnDigits(energyPct)}/১০০
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-black/40" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={energyPct} aria-label="শক্তি">
              <div className={`h-full rounded-full transition-[width] ${energyPct < 30 ? 'bg-danger' : 'bg-lantern'}`} style={{ width: `${energyPct}%` }} />
            </div>
            <p className="mt-1 text-[11px] leading-snug text-moon">
              কম শক্তিতে দম তাড়াতাড়ি ফুরায় ও ধীরে ফেরে — কিন্তু খেলা শেষ হয় না।
              {profile.buff && <span className="text-lantern"> · আজ রাতের জোর: {FOOD_EFFECTS[profile.buff].nameBn}</span>}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-1 px-3 pt-2" role="tablist">
          {(
            [
              ['food', '🍚 খাবার'],
              ['gear', '🧰 সরঞ্জাম'],
              ['supplies', '🍘 সদাই'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`btn !min-h-11 !px-2 !text-sm ${tab === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(k)} data-testid={`tab-${k}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {tab === 'food' && (
            <ul className="space-y-2">
              {FOODS.map((f) => {
                const disabled = (f.oncePerDay && freeMealUsed) || profile.bank < f.cost;
                return (
                  <li key={f.id}>
                    <button type="button" className={`flex min-h-14 w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-left active:bg-white/10 ${disabled ? 'opacity-60' : ''}`} onClick={() => onEat(f)} data-testid={`food-${f.id}`} aria-disabled={disabled}>
                      <span className="text-2xl" aria-hidden>
                        {f.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{f.nameBn}</span>
                        <span className="block text-xs text-moon">
                          শক্তি +{toBnDigits(f.energy)}
                          {f.effect && ` · ${FOOD_EFFECTS[f.effect].descBn}`}
                          {f.oncePerDay && (freeMealUsed ? ' · আজ খাওয়া হয়ে গেছে' : ' · দিনে একবার')}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-gold">{f.cost === 0 ? 'বিনা পয়সা' : formatTaka(f.cost)}</span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button type="button" className={`flex min-h-14 w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-left active:bg-white/10 ${napUsed ? 'opacity-60' : ''}`} onClick={onNap} data-testid="nap" aria-disabled={napUsed}>
                  <span className="text-2xl" aria-hidden>
                    😴
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">চৌকিতে একটু ঘুম</span>
                    <span className="block text-xs text-moon">শক্তি +২০ · {napUsed ? 'আজ ঘুমানো হয়ে গেছে' : 'দিনে একবার, বিনা পয়সা'}</span>
                  </span>
                </button>
              </li>
            </ul>
          )}

          {tab === 'gear' && (
            <div className="space-y-3">
              {(['tool', 'bag', 'footwear'] as EquipSlot[]).map((slot) => (
                <section key={slot}>
                  <h2 className="mb-1 text-sm font-semibold text-lantern">{SLOT_NAME[slot]}</h2>
                  <ul className="space-y-1.5">
                    {EQUIPMENT.filter((e) => e.slot === slot).map((e) => {
                      const owned = profile.owned.includes(e.id);
                      const equipped = profile.equipped[slot] === e.id;
                      return (
                        <li key={e.id} className={`rounded-xl px-3 py-2 ${equipped ? 'bg-lantern/15 ring-1 ring-lantern/60' : 'bg-white/5'}`} data-testid={`gear-${e.id}`}>
                          <div className="flex items-center gap-3">
                            <span className="text-2xl" aria-hidden>
                              {e.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold">{e.nameBn}</span>
                              <span className="block text-xs text-moon">{e.descBn}</span>
                            </span>
                            {equipped ? (
                              <span className="shrink-0 text-xs text-lantern">✓ পরা আছে</span>
                            ) : owned ? (
                              <button type="button" className="btn btn-ghost !min-h-11 shrink-0 !px-3 !text-sm" onClick={() => onEquip(e)} data-testid={`equip-${e.id}`}>
                                পরো
                              </button>
                            ) : (
                              <button type="button" className={`btn !min-h-11 shrink-0 !px-3 !text-sm ${profile.bank >= e.cost ? 'btn-primary' : 'btn-ghost opacity-70'}`} onClick={() => onBuy(e)} data-testid={`buy-${e.id}`}>
                                {formatTaka(e.cost)}
                              </button>
                            )}
                          </div>
                          {(modsText(e) || e.tradeoffBn !== '—') && (
                            <p className="mt-1 text-[11px] leading-snug text-moon">
                              {modsText(e)}
                              {e.tradeoffBn !== '—' && <span className="text-danger/90"> · বিনিময়ে: {e.tradeoffBn}</span>}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {tab === 'supplies' && (
            <div className="rounded-xl bg-white/5 p-3" data-testid="supply-gur-chira">
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden>
                  {SUPPLIES['gur-chira'].icon}
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{SUPPLIES['gur-chira'].nameBn}</span>
                  <span className="block text-xs text-moon">{SUPPLIES['gur-chira'].descBn}</span>
                  <span className="block text-xs text-lantern">
                    ঝোলায় আছে: {toBnDigits(profile.supplies['gur-chira'])}/{toBnDigits(SUPPLIES['gur-chira'].max)}
                  </span>
                </span>
                <button type="button" className="btn btn-primary !min-h-11 shrink-0 !px-3 !text-sm" onClick={onSupply} data-testid="buy-gur-chira">
                  {formatTaka(SUPPLIES['gur-chira'].cost)}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="min-h-6 px-4 text-center text-sm" role="status" aria-live="polite">
          {toast && (
            <span key={toast.id} className={`caption-in ${toast.bad ? 'text-danger' : 'text-lantern'}`} data-testid="safehouse-toast">
              {toast.text}
            </span>
          )}
        </p>
        <div className="flex gap-2 border-t border-moon/20 p-3">
          <button type="button" className="btn btn-ghost !min-h-12 !px-3" onClick={returnToMenu} data-testid="safehouse-menu">
            মেনু
          </button>
          <button
            type="button"
            className="btn btn-primary !min-h-12 flex-1"
            onClick={() => {
              audio.unlock();
              startRun();
            }}
            data-testid="next-night"
          >
            রাতের প্রস্তুতি ›
          </button>
        </div>
      </div>
    </div>
  );
}

