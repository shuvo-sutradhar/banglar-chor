import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PausableClock } from '../../lib/PausableClock';
import { speakText } from '../../game/audio/voice';
import { nightBody } from '../../game/systems/nightBody';
import { formatTaka, toBnDigits, formatKg } from '../../lib/format';
import { useAppStore } from '../../state/useAppStore';
import { useHudStore } from '../../state/useHudStore';
import { useRunStore } from '../../state/useRunStore';
import type { GameRuntime } from '../../game/GameRuntime';
import { LOOT } from '../../game/data/loot';
import { MERCHANTS, type MerchantId } from '../../game/data/merchants';
import { BargainSession, COUNTER_STEPS, judgePersuasion, msUntilSweet, persuasionNeedle, recoverBetweenVisits, type Quality } from '../../game/systems/bargaining';
import { CONFRONT_LINES, COUNTER_REPLIES, DEFECT_LINES, EXAMINE_LINES, EXCUSE_LINES, PERSUADE_LINES, RECOGNITION_LINES } from '../../game/data/marketDialogue';
import { THIEF_NAME } from '../../game/data/dialogue';
import { closeTrade, raiseMarketAlarm } from '../../game/systems/marketActions';
import { audio } from '../../game/audio/AudioManager';
import { debugHooks } from '../../game/debugHooks';
import { LootIcon } from '../components/LootIcon';

type Line = { who: 'merchant' | 'thief'; text: string; id: number };
type Pending = { kind: 'counter'; step: number; ask: number } | { kind: 'excuse' } | null;

function interestLabel(id: MerchantId, lootId: keyof typeof LOOT): { text: string; tone: 'good' | 'mid' | 'bad' } {
  const pref = MERCHANTS[id].prefs[LOOT[lootId].category];
  if (pref <= 0) return { text: 'কেনেন না', tone: 'bad' };
  if (pref >= 1.1) return { text: 'খুব পছন্দ', tone: 'good' };
  if (pref >= 0.85) return { text: 'চলবে', tone: 'mid' };
  return { text: 'কম আগ্রহ', tone: 'bad' };
}

/** Persuasion timing meter — tap when the needle is in the centre (judged by event timestamp). */
function PersuasionMeter({ speed, zones, onResult }: { speed: number; zones: { perfect: number; good: number }; onResult: (q: Quality) => void }) {
  const clock = useMemo(() => new PausableClock(), []);
  const needleRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const fire = useCallback(
    (ts?: number) => {
      if (done.current || useAppStore.getState().paused) return;
      done.current = true;
      onResult(judgePersuasion(clock.at(ts), speed, zones));
    },
    [clock, speed, zones, onResult],
  );
  useEffect(() => {
    let raf = 0;
    clock.tick();
    const loop = () => {
      clock.setPaused(useAppStore.getState().paused);
      const t = clock.tick();
      if (needleRef.current) needleRef.current.style.left = `${persuasionNeedle(t, speed) * 100}%`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    debugHooks.persuade = () => ({ msUntilSweet: msUntilSweet(clock.now(), speed), speed });
    const key = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') && !e.repeat) {
        e.preventDefault();
        fire(e.timeStamp);
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', key);
      delete debugHooks.persuade;
    };
  }, [clock, speed, fire]);
  return (
    <div className="my-2" data-testid="persuasion-meter">
      <p className="mb-1 text-center text-sm text-gold">কথার জাদু! কাঁটা মাঝখানে এলে চাপো (Space / ট্যাপ)</p>
      <button
        type="button"
        className="relative block h-12 w-full touch-none overflow-hidden rounded-xl bg-black/40"
        onPointerDown={(e) => {
          e.preventDefault();
          fire(e.timeStamp);
        }}
        data-testid="persuasion-tap"
        aria-label="এখন চাপো"
      >
        <span className="absolute inset-y-0 bg-gold/30" style={{ left: `${(0.5 - zones.good) * 100}%`, width: `${zones.good * 200}%` }} />
        <span className="absolute inset-y-0 bg-gold/80" style={{ left: `${(0.5 - zones.perfect) * 100}%`, width: `${zones.perfect * 200}%` }} />
        <span ref={needleRef} className="absolute inset-y-1 w-1.5 -translate-x-1/2 rounded bg-ink shadow" />
      </button>
    </div>
  );
}

function Bar({ label, value, max = 100, danger }: { label: string; value: number; max?: number; danger?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="tabular-nums text-moon">{toBnDigits(Math.round(value))}</span>
      </div>
      <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-black/40">
        <div className={`h-full rounded-full ${danger ? 'bg-danger' : 'bg-leaf'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Trading UI (README §10): choose an item from the real inventory, the merchant examines it and
 * offers; counter with a persuasion beat, accept, or walk away. Recognition warnings give you the
 * choice to make an excuse (timing) or withdraw. Sales are committed atomically to the run store.
 */
export function TradePanel({ runtime }: { runtime: GameRuntime }) {
  const merchantId = useRunStore((s) => s.activeMerchant);
  const inventory = useRunStore((s) => s.run?.inventory ?? []);
  const money = useRunStore((s) => s.run?.market?.money ?? 0);
  const seed = useRunStore((s) => s.run?.seed ?? 0);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  // Stable mutable holder (re-render via bump) — not a ref, since render reads it.
  const [session] = useState<{ current: BargainSession | null }>(() => ({ current: null }));
  const [lines, setLines] = useState<Line[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  // After a touch on the meter, the browser still fires a compatibility click where the finger
  // was; once the meter unmounts that click would land on a counter button. Swallow it briefly.
  const [shield, setShield] = useState(false);
  const [examining, setExamining] = useState(false);
  const lineId = useRef(0);
  const visitRecovered = useRef(false);

  const m = merchantId ? MERCHANTS[merchantId] : null;
  const say = useCallback((who: Line['who'], text: string) => {
    setLines((l) => [...l.slice(-3), { who, text, id: ++lineId.current }]);
    // Voiced when the line is in the manifest; the trade log above always keeps the text.
    if (!speakText(text)) useHudStore.getState().showCaption(text, who === 'thief' ? THIEF_NAME : m?.nameBn);
  }, [m]);

  // Patience recovers a little each time you come back to a merchant.
  useEffect(() => {
    if (!merchantId || visitRecovered.current) return;
    visitRecovered.current = true;
    const st = useRunStore.getState().run?.market?.merchants[merchantId];
    if (st) useRunStore.getState().commitMerchant(merchantId, recoverBetweenVisits(st, MERCHANTS[merchantId]));
  }, [merchantId]);

  const finishSession = useCallback(
    (s: BargainSession) => {
      if (!merchantId) return;
      const store = useRunStore.getState();
      if (s.phase === 'sold') {
        const ok = store.sell(s.item.instanceId, merchantId, s.price, s.state, runtime.simTime);
        if (ok) {
          audio.play('coins');
          say('merchant', `এই নাও ${formatTaka(s.price)}। ভালো কারবার হইল!`);
        }
      } else if (s.phase === 'confronted') {
        store.commitMerchant(merchantId, s.state);
        store.recordMarket('recognition', runtime.simTime, merchantId, s.item.instanceId);
        session.current = null;
        raiseMarketAlarm(runtime, MERCHANTS[merchantId].nameBn, CONFRONT_LINES[s.item.lootId === 'lantern' ? 0 : 1]!);
        return;
      } else {
        store.commitMerchant(merchantId, s.state);
        if (s.phase === 'refused') {
          store.recordMarket('sale-refused', runtime.simTime, merchantId, s.item.instanceId);
          audio.play('grumble');
        }
      }
      session.current = null;
      bump();
    },
    [merchantId, runtime, say, session],
  );

  const choose = (instanceId: string) => {
    if (!merchantId || !m) return;
    const item = inventory.find((i) => i.instanceId === instanceId);
    const state = useRunStore.getState().run?.market?.merchants[merchantId];
    if (!item || !state) return;
    const s = new BargainSession(m, state, item, seed, { ownerAlert: useRunStore.getState().rahimRecognition > 30, priceMult: nightBody.current.plan.priceMult });
    session.current = s;
    setPending(null);
    if (s.phase === 'refused') {
      say('merchant', s.refuseReason ?? 'কিনমু না।');
      finishSession(s);
      return;
    }
    // Merchant examines the item before offering.
    setExamining(true);
    const ex = EXAMINE_LINES[item.lootId];
    say('merchant', ex?.merchant ?? 'দেখি জিনিসটা…');
    if (ex?.thief) window.setTimeout(() => say('thief', ex.thief!), 500);
    if (item.lootId === 'old-radio') window.setTimeout(() => audio.play('radio'), 400);
    window.setTimeout(() => {
      setExamining(false);
      const cur = session.current;
      if (!cur) return;
      if (cur.defectSpotted) say('merchant', LOOT[item.lootId].defect === 'fake' ? DEFECT_LINES.fake : DEFECT_LINES.broken);
      else if (LOOT[item.lootId].defect === 'fake') say('merchant', DEFECT_LINES.fooled);
      if (cur.phase === 'recognition') {
        audio.play('suspicious');
        say('merchant', RECOGNITION_LINES[item.lootId] ?? RECOGNITION_LINES.default);
      } else say('merchant', cur.lines.at(-1)?.text ?? `${formatTaka(cur.offer)} দিতে পারি।`);
      bump();
    }, 1200);
    bump();
  };

  const onPersuasion = (q: Quality) => {
    const s = session.current;
    const p = pending;
    setPending(null);
    setShield(true);
    window.setTimeout(() => setShield(false), 450);
    if (!s || !p) return;
    if (q === 'perfect') audio.play('tap-perfect');
    else if (q === 'good') audio.play('tap-good');
    else audio.play('tap-miss');
    if (p.kind === 'excuse') {
      say('thief', q === 'miss' ? EXCUSE_LINES.thiefFail : EXCUSE_LINES.thief);
      useRunStore.getState().recordMarket('excuse', runtime.simTime, merchantId ?? undefined, s.item.instanceId);
      s.excuse(q);
      window.setTimeout(() => {
        if (s.phase === 'confronted') {
          say('merchant', EXCUSE_LINES.merchantAngry);
          finishSession(s);
        } else if (s.phase === 'offer') {
          say('merchant', EXCUSE_LINES.merchantDoubt);
          window.setTimeout(() => say('thief', EXCUSE_LINES.thiefOk), 450);
          window.setTimeout(() => say('merchant', `${EXCUSE_LINES.merchantBelieves} ${formatTaka(s.offer)}।`), 900);
        } else say('merchant', 'হুঁ… আমি বিশ্বাস করি না। ঠিক করে বলো!');
        bump();
      }, 350);
      return;
    }
    const before = s.offer;
    const suspBefore = s.state.suspicion;
    say('thief', PERSUADE_LINES[s.countersUsed % PERSUADE_LINES.length]!);
    s.counter(p.ask, q);
    window.setTimeout(() => {
      if (s.phase === 'confronted') {
        say('merchant', CONFRONT_LINES[1]!);
        finishSession(s);
        return;
      }
      if (s.phase === 'refused') {
        say('merchant', s.refuseReason ?? 'যাও!');
        finishSession(s);
        return;
      }
      let reply = s.offer >= p.ask ? COUNTER_REPLIES.agreed : s.offer < before ? COUNTER_REPLIES.dropped : s.offer > before ? COUNTER_REPLIES.improved : COUNTER_REPLIES.halfway;
      if (s.state.suspicion - suspBefore >= 15) reply = `${COUNTER_REPLIES.suspicious} ${reply}`;
      if (s.countersLeft === 0) reply = `${reply} ${COUNTER_REPLIES.lastOffer}`;
      say('merchant', `${reply} — ${formatTaka(s.offer)}`);
      bump();
    }, 350);
  };

  const accept = () => {
    const s = session.current;
    if (!s || !s.accept()) return;
    finishSession(s);
  };
  const walk = () => {
    const s = session.current;
    if (!s) return;
    const wasWarning = s.phase === 'recognition';
    s.walkAway();
    say('thief', wasWarning ? 'থাক কাকা, এইটা বেচমু না।' : 'এই দামে দিমু না, থাক।');
    finishSession(s);
  };
  const leave = () => {
    const s = session.current;
    if (s && !s.finished) {
      s.walkAway();
      finishSession(s);
    }
    closeTrade(runtime);
  };

  // Debug (tests only): current session numbers.
  useEffect(() => {
    debugHooks.trade = () => {
      const s = session.current;
      return s ? { phase: s.phase, offer: s.offer, reservation: s.reservation, countersLeft: s.countersLeft, patience: s.state.patience, suspicion: s.state.suspicion, examining, item: s.item.lootId } : { phase: 'choose', offer: 0, reservation: 0, countersLeft: 0, patience: 0, suspicion: 0, examining, item: null };
    };
    return () => {
      delete debugHooks.trade;
    };
  });

  if (!m || !merchantId) return null;
  const st = useRunStore.getState().run?.market?.merchants[merchantId];
  const s = session.current;
  const def = s ? LOOT[s.item.lootId] : null;

  return (
    <div className="safe-pad pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center" data-testid="trade-panel">
      <div className="panel pointer-events-auto relative mb-2 flex max-h-[72dvh] w-full max-w-lg flex-col overflow-hidden" role="dialog" aria-label={`${m.nameBn} এর সাথে দরদাম`}>
        {shield && <div className="absolute inset-0 z-20" aria-hidden="true" data-testid="tap-shield" onClick={(e) => e.stopPropagation()} />}
        <div className="flex items-start justify-between gap-2 border-b border-moon/20 px-4 py-2">
          <div>
            <h2 className="text-lg font-semibold text-gold">
              {m.nameBn} <span className="text-sm font-normal text-moon">· {m.shopBn}</span>
            </h2>
            <p className="text-xs text-ink/80">
              {m.styleBn} · পছন্দ: {m.likesBn}
            </p>
          </div>
          <div className="text-right">
            <div className="font-semibold tabular-nums text-gold" data-testid="money">
              💰 {formatTaka(money)}
            </div>
            <button type="button" className="mt-1 rounded-lg px-2 py-1 text-sm text-moon underline" onClick={leave} data-testid="trade-leave">
              দোকান থেকে সরে যাও
            </button>
          </div>
        </div>
        {st && (
          <div className="flex gap-3 px-4 pt-2">
            <Bar label="⏳ ধৈর্য" value={s ? s.state.patience : st.patience} />
            <Bar label="👁 সন্দেহ" value={s ? s.state.suspicion : st.suspicion} danger />
          </div>
        )}
        <div className="min-h-[3.5rem] space-y-1 px-4 py-2 text-sm" aria-live="polite">
          {lines.map((l) => (
            <p key={l.id} className={`caption-in ${l.who === 'thief' ? 'text-right text-ink/90' : 'text-gold'}`}>
              <b>{l.who === 'thief' ? THIEF_NAME : m.nameBn}:</b> {l.text}
            </p>
          ))}
        </div>

        <div className="overflow-y-auto px-4 pb-3">
          {!s && (
            <>
              <p className="mb-2 text-sm text-moon">কোন জিনিসটা দেখাবে?</p>
              {inventory.length === 0 ? (
                <p className="py-3 text-center text-moon">ঝোলা খালি — বেচার কিছু নাই। গেট দিয়ে বের হয়ে হিসাব শেষ করো।</p>
              ) : (
                <ul className="space-y-2">
                  {inventory.map((it) => {
                    const lbl = interestLabel(merchantId, it.lootId);
                    return (
                      <li key={it.instanceId}>
                        <button type="button" className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-2 text-left hover:bg-white/10" onClick={() => choose(it.instanceId)} data-testid="trade-item" data-loot={it.lootId}>
                          <LootIcon lootId={it.lootId} />
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{LOOT[it.lootId].nameBn}</span>
                            <span className="text-xs text-ink/80">
                              {LOOT[it.lootId].approxValueBn} · ⚖ {formatKg(LOOT[it.lootId].weight)}
                            </span>
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${lbl.tone === 'good' ? 'bg-leaf/60' : lbl.tone === 'bad' ? 'bg-danger/50' : 'bg-white/10'}`}>{lbl.text}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {s && def && (
            <div data-testid="trade-offer">
              <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/5 p-2">
                <LootIcon lootId={s.item.lootId} />
                <div className="flex-1">
                  <div className="font-semibold">{def.nameBn}</div>
                  <div className="text-xs text-ink/80">তোমার ধারণা: {def.approxValueBn}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-moon">{examining ? 'দেখছেন…' : 'দোকানির দাম'}</div>
                  <div className="text-xl font-semibold tabular-nums text-gold" data-testid="current-offer">
                    {examining ? '…' : formatTaka(s.offer)}
                  </div>
                </div>
              </div>

              {!examining && s.phase === 'recognition' && !pending && (
                <div className="mb-2 rounded-xl border border-danger/60 bg-danger/15 p-2 text-sm" role="alert" data-testid="recognition-warning">
                  ⚠ দোকানি জিনিসটা চিনে ফেলছেন! অজুহাত দাও (ভালো সময়ে চাপলে বিশ্বাস করবে), নাহলে জিনিসটা সরিয়ে নাও।
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn btn-primary flex-1 !min-h-11 !text-base" onClick={() => setPending({ kind: 'excuse' })} data-testid="excuse">
                      অজুহাত দাও
                    </button>
                    <button type="button" className="btn btn-ghost flex-1 !min-h-11 !text-base" onClick={walk} data-testid="withdraw">
                      সরিয়ে নাও
                    </button>
                  </div>
                </div>
              )}

              {pending && <PersuasionMeter speed={m.persuasion.speed} zones={m.persuasion} onResult={onPersuasion} />}

              {!examining && !pending && (s.phase === 'offer' || s.phase === 'recognition') && (
                <>
                  <p className="mb-1 text-xs text-moon">
                    দর কষাকষি বাকি: {toBnDigits(s.countersLeft)} বার {s.phase === 'recognition' && '· সন্দেহের মধ্যে দাম চাইলে বিপদ বাড়বে!'}
                  </p>
                  <div className="mb-2 grid grid-cols-3 gap-2">
                    {COUNTER_STEPS.map((step) => {
                      const ask = s.askFor(step);
                      return (
                        <button
                          key={step}
                          type="button"
                          className="btn btn-ghost !min-h-12 !px-1 !text-sm"
                          disabled={s.countersLeft === 0}
                          onClick={() => setPending({ kind: 'counter', step, ask })}
                          data-testid={`counter-${Math.round(step * 100)}`}
                        >
                          +{toBnDigits(Math.round(step * 100))}%
                          <span className="block text-xs text-gold">{formatTaka(ask)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-primary flex-1" disabled={s.phase !== 'offer'} onClick={accept} data-testid="accept">
                      বেচে দাও {formatTaka(s.offer)}
                    </button>
                    {s.phase === 'offer' && (
                      <button type="button" className="btn btn-ghost" onClick={walk} data-testid="walk-away">
                        ছেড়ে দাও
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
