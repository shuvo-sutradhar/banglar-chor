import { describe, expect, it } from 'vitest';
import { MERCHANTS, MERCHANT_IDS } from '../game/data/merchants';
import { LOOT, type LootId } from '../game/data/loot';
import { BargainSession, createMerchantState, judgePersuasion, msUntilSweet, persuasionNeedle, RECOGNITION_THRESHOLD } from '../game/systems/bargaining';
import { canEnterMarket, enterMarket, finishMarket, MARKET_RULES, recordMarketEvent, sellItem, updateMerchant } from '../game/systems/market';
import { targetSpeedFor } from '../game/physics/motorMath';
import { computeRunScore, finalOutcomeOf, SCORE, summaryLine } from '../game/systems/scoring';
import { createRun, resolveNight, type RunState } from '../game/systems/runLogic';
import { CARRY_CAPACITY_KG, pickupItem } from '../game/systems/inventory';
import { canTransition } from '../game/systems/runPhases';
import { currentObjective } from '../game/systems/objectives';
import { segmentClear } from '../game/ai/navGraph';
import { BAZAAR_NAV } from '../game/ai/bazaarNav';
import { BAZAAR_OBSTACLES, BAZAAR_SPAWN, RAHIM_ROUTE, SHOPPER_ROUTES, STALLS, WATCHMAN_ROUTE, inBazaarExit, stallFront } from '../game/world/bazaarLayout';
import { addCompletedRun, createDefaultDocument, MAX_SAVED_RUNS, PersistenceService, personalBest, SAVE_KEY, type CompletedRun, type StorageLike } from '../state/persistence';

const toWorld = (_h: string, l: [number, number, number]): [number, number, number] => [l[0], l[1], l[2]];
const item = (lootId: LootId, n = 1) => ({ instanceId: `t:${lootId}:${n}`, lootId, sourceHouseId: 'rahim' });

/** A run that escaped the night carrying the given items and entered the market. */
function marketRun(lootIds: LootId[], seed = 7): RunState {
  let run = createRun(seed, 'x', toWorld);
  run = { ...run, worldItems: lootIds.map((l, i) => ({ ...item(l, i), sourceHouseId: 'rahim' as const, position: [0, 0, 0] as [number, number, number], dropped: false })), houseIdsEntered: ['rahim'] };
  for (const w of [...run.worldItems]) {
    const r = pickupItem(run, w.instanceId);
    if (!r.ok) throw new Error(r.reason);
    run = { ...run, ...r.state, events: [...run.events, { id: run.events.length + 1, atSec: 1, type: 'pickup', instanceId: w.instanceId, itemId: w.lootId }] };
  }
  run = resolveNight(run, 'escaped-with-loot', 10);
  return enterMarket(run, 11);
}

describe('bargaining: merchants are data-driven and different', () => {
  it('each merchant values the same item differently according to preferences', () => {
    const it1 = item('old-radio');
    const offers = MERCHANT_IDS.map((id) => new BargainSession(MERCHANTS[id], createMerchantState(MERCHANTS[id]), it1, 42).reservation);
    // Jalil (electronics) pays the most for a radio; Hashem (metal) the least.
    const [hashem, jalil, bokul] = offers;
    expect(jalil!).toBeGreaterThan(hashem!);
    expect(jalil!).toBeGreaterThan(bokul!);
  });
  it('Hashem pays best for metal; nobody but Bokul buys the hen', () => {
    const pot = item('brass-pot');
    const h = new BargainSession(MERCHANTS.hashem, createMerchantState(MERCHANTS.hashem), pot, 1).reservation;
    const j = new BargainSession(MERCHANTS.jalil, createMerchantState(MERCHANTS.jalil), pot, 1).reservation;
    expect(h).toBeGreaterThan(j);
    for (const id of ['hashem', 'jalil'] as const) {
      const s = new BargainSession(MERCHANTS[id], createMerchantState(MERCHANTS[id]), item('chicken'), 1);
      expect(s.phase).toBe('refused');
      expect(s.refuseReason).toBeTruthy();
    }
    expect(new BargainSession(MERCHANTS.bokul, createMerchantState(MERCHANTS.bokul), item('chicken'), 1).phase).not.toBe('refused');
  });
  it('experts spot the fake necklace; Jalil is fooled', () => {
    const fake = item('fake-jewelry');
    const h = new BargainSession(MERCHANTS.hashem, createMerchantState(MERCHANTS.hashem), fake, 3);
    const j = new BargainSession(MERCHANTS.jalil, createMerchantState(MERCHANTS.jalil), fake, 3);
    expect(h.defectSpotted).toBe(true);
    expect(j.defectSpotted).toBe(false);
    expect(j.reservation).toBeGreaterThan(h.reservation * 3);
  });
  it('is deterministic for the same seed, bounded by the price-noise band', () => {
    const a = new BargainSession(MERCHANTS.jalil, createMerchantState(MERCHANTS.jalil), item('alarm-clock'), 99);
    const b = new BargainSession(MERCHANTS.jalil, createMerchantState(MERCHANTS.jalil), item('alarm-clock'), 99);
    expect(a.offer).toBe(b.offer);
    expect(a.reservation).toBe(b.reservation);
    const base = LOOT['alarm-clock'].baseValue * MERCHANTS.jalil.prefs.electronics * MERCHANTS.jalil.capFraction;
    expect(Math.abs(a.reservation / base - 1)).toBeLessThanOrEqual(MERCHANTS.jalil.priceNoise + 1e-9);
  });
  it('Bokul runs out of counters sooner than Jalil', () => {
    expect(MERCHANTS.bokul.maxCounters).toBeLessThan(MERCHANTS.jalil.maxCounters);
    expect(MERCHANTS.bokul.patience).toBeLessThan(MERCHANTS.hashem.patience);
  });
});

describe('bargaining: skill and decisions decide the price', () => {
  const fresh = () => new BargainSession(MERCHANTS.jalil, createMerchantState(MERCHANTS.jalil), item('alarm-clock'), 5);
  it('a reasonable counter with good timing is accepted and raises the price', () => {
    const s = fresh();
    const before = s.offer;
    const ask = Math.min(s.askFor(0.1), Math.floor(s.reservation / 5) * 5);
    s.counter(ask, 'good');
    expect(s.offer).toBeGreaterThan(before);
    expect(s.offer).toBeLessThanOrEqual(Math.ceil(s.reservation / 5) * 5 + 5);
  });
  it('perfect timing beats a miss for the same excessive ask; offers never exceed the cap', () => {
    const a = fresh();
    const b = fresh();
    a.counter(a.askFor(0.5), 'perfect');
    b.counter(b.askFor(0.5), 'miss');
    expect(a.offer).toBeGreaterThan(b.offer);
    expect(a.offer).toBeLessThanOrEqual(Math.round((a.reservation * 1.05) / 5) * 5);
  });
  it('excessive counters drain patience, raise suspicion and end in refusal — no false sale', () => {
    const s = new BargainSession(MERCHANTS.bokul, createMerchantState(MERCHANTS.bokul), item('lantern'), 8);
    if (s.phase === 'recognition') s.excuse('perfect');
    const susp0 = s.state.suspicion;
    for (let i = 0; i < 5 && !s.finished; i++) s.counter(s.askFor(0.5) * 3, 'miss');
    expect(s.state.suspicion).toBeGreaterThan(susp0);
    expect(['refused', 'confronted']).toContain(s.phase);
    expect(s.accept()).toBe(false);
    expect(s.price).toBe(0);
  });
  it('accepting sells once at an integer price and uses the merchant budget', () => {
    const s = fresh();
    expect(s.accept()).toBe(true);
    expect(Number.isInteger(s.price)).toBe(true);
    expect(s.state.budgetLeft).toBe(MERCHANTS.jalil.budget - s.price);
    expect(s.accept()).toBe(false);
  });
  it('walking away keeps the item and costs a little patience', () => {
    const s = fresh();
    s.walkAway();
    expect(s.phase).toBe('withdrawn');
    expect(s.state.patience).toBeLessThan(MERCHANTS.jalil.patience);
  });
});

describe('recognition (deterministic, warned first)', () => {
  it("Hashem recognises Rahim's lantern — but only warns", () => {
    const s = new BargainSession(MERCHANTS.hashem, createMerchantState(MERCHANTS.hashem), item('lantern'), 1);
    expect(LOOT.lantern.recognizability * MERCHANTS.hashem.observant).toBeGreaterThanOrEqual(RECOGNITION_THRESHOLD);
    expect(s.phase).toBe('recognition');
    expect(s.accept()).toBe(false); // must resolve the warning first
  });
  it('a good excuse continues the deal at a discount; failed excuses lead to confrontation', () => {
    const ok = new BargainSession(MERCHANTS.hashem, createMerchantState(MERCHANTS.hashem), item('lantern'), 1);
    const r0 = ok.reservation;
    ok.excuse('good');
    expect(ok.phase).toBe('offer');
    expect(ok.reservation).toBeLessThan(r0);
    const bad = new BargainSession(MERCHANTS.hashem, createMerchantState(MERCHANTS.hashem), item('lantern'), 1);
    for (let i = 0; i < 4 && bad.phase === 'recognition'; i++) bad.excuse('miss');
    expect(bad.phase).toBe('confronted');
    expect(bad.state.closed).toBe(true);
  });
  it('withdrawing during a warning is always available and avoids a confrontation', () => {
    const s = new BargainSession(MERCHANTS.hashem, createMerchantState(MERCHANTS.hashem), item('lantern'), 1);
    s.walkAway();
    expect(s.phase).toBe('withdrawn');
    expect(s.state.refused).toContain(item('lantern').instanceId);
    const again = new BargainSession(MERCHANTS.hashem, s.state, item('lantern'), 1);
    expect(again.phase).toBe('refused');
  });
  it('low-recognition items with a less observant merchant do not trigger warnings', () => {
    expect(new BargainSession(MERCHANTS.jalil, createMerchantState(MERCHANTS.jalil), item('alarm-clock'), 1).phase).toBe('offer');
  });
});

describe('persuasion meter', () => {
  it('needle crosses the sweet spot predictably', () => {
    const speed = 0.7;
    const t = msUntilSweet(0.1, speed) / 1000 + 0.1;
    expect(persuasionNeedle(t, speed)).toBeCloseTo(0.5, 5);
    expect(judgePersuasion(t, speed, MERCHANTS.jalil.persuasion)).toBe('perfect');
    expect(judgePersuasion(0, speed, MERCHANTS.jalil.persuasion)).toBe('miss');
  });
});

describe('market transitions are atomic', () => {
  it('only an escape with loot opens the market', () => {
    const caught = resolveNight(createRun(1, 'x', toWorld), 'caught', 1);
    expect(canEnterMarket(caught)).toBe(false);
    expect(enterMarket(caught, 2).market).toBeNull();
    const run = marketRun(['brass-pot']);
    expect(run.market).not.toBeNull();
    expect(run.inventory).toHaveLength(1); // inventory carried over unchanged
    expect(enterMarket(run, 3)).toBe(run); // idempotent
  });
  it('an item sells exactly once and money is credited exactly once', () => {
    let run = marketRun(['brass-pot', 'lantern']);
    const id = run.inventory[0]!.instanceId;
    const st = run.market!.merchants.hashem;
    const a = sellItem(run, id, 'hashem', 250, st, 20);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    run = a.run;
    expect(run.market!.money).toBe(250);
    expect(run.inventory.some((i) => i.instanceId === id)).toBe(false);
    const b = sellItem(run, id, 'jalil', 300, st, 21);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('already-sold');
    expect(run.events.filter((e) => e.type === 'sale')).toHaveLength(1);
    expect(sellItem(run, run.inventory[0]!.instanceId, 'hashem', Number.NaN, st, 22).ok).toBe(false);
  });
  it('rejected / withdrawn deals preserve inventory', () => {
    const run = marketRun(['lantern']);
    const after = updateMerchant(run, 'hashem', { ...run.market!.merchants.hashem, suspicion: 40 });
    expect(after.inventory).toEqual(run.inventory);
    expect(after.market!.merchants.hashem.suspicion).toBe(40);
  });
  it('being caught at the market confiscates unsold items and fines half the money, once', () => {
    let run = marketRun(['brass-pot', 'lantern']);
    const r = sellItem(run, run.inventory[0]!.instanceId, 'hashem', 301 - 1, run.market!.merchants.hashem, 20);
    if (!r.ok) throw new Error('sale');
    run = finishMarket(r.run, 'caught', 30);
    expect(run.inventory).toHaveLength(0);
    expect(run.confiscated.map((c) => c.lootId)).toEqual(['lantern']);
    expect(run.market!.fine).toBe(150);
    expect(run.market!.money).toBe(150);
    expect(finishMarket(run, 'completed', 31)).toBe(run);
    expect(sellItem(run, 'x', 'jalil', 5, run.market!.merchants.jalil, 32).ok).toBe(false);
  });
  it('escaping keeps unsold items and money', () => {
    const run = finishMarket(marketRun(['old-radio']), 'escaped', 9);
    expect(run.inventory).toHaveLength(1);
    expect(run.market!.outcome).toBe('escaped');
  });
});

describe('scoring', () => {
  it('a sale counts through its price only — never also as loot (no double count)', () => {
    let run = marketRun(['brass-pot']);
    const r = sellItem(run, run.inventory[0]!.instanceId, 'hashem', 300, run.market!.merchants.hashem, 20);
    if (!r.ok) throw new Error('sale');
    run = finishMarket(r.run, 'completed', 30);
    const s = computeRunScore(run);
    expect(s.saleScore).toBe(150);
    expect(s.unsoldLootScore).toBe(0);
    expect(s.money).toBe(300);
    expect(s.outcome).toBe('completed');
    expect(s.score).toBe(150 + SCORE.cleanEscapeBonus + SCORE.stealthMax + 100);
  });
  it('the same run always scores the same; integers, never negative or NaN', () => {
    const run = finishMarket(marketRun(['lantern', 'dentures']), 'caught', 5);
    const a = computeRunScore(run);
    expect(a).toEqual(computeRunScore(run));
    expect(Number.isInteger(a.score)).toBe(true);
    expect(a.score).toBeGreaterThanOrEqual(0);
    const awful = { ...run, detections: 99, market: { ...run.market!, recognitions: 9, detections: 50 } };
    expect(computeRunScore(awful).score).toBe(0);
  });
  it('night catch: penalty, nothing kept, documented outcome line', () => {
    const run = resolveNight(createRun(1, 'x', toWorld), 'caught', 1, 'rahim');
    const s = computeRunScore(run);
    expect(s.outcome).toBe('night-caught');
    expect(s.nightCaughtPenalty).toBe(600);
    expect(s.money).toBe(0);
    expect(summaryLine(run, s)).toContain('রহিম চাচা');
  });
  it('recognitions cost points (capped) and comedy bonuses are capped', () => {
    let run = marketRun(['brass-pot']);
    run = recordMarketEvent(run, 'recognition', 1, 'hashem', run.inventory[0]!.instanceId);
    run = recordMarketEvent(run, 'recognition', 2, 'hashem');
    run = recordMarketEvent(run, 'recognition', 3, 'hashem');
    expect(computeRunScore(run).recognitionPenalty).toBe(SCORE.recognitionPenalty * SCORE.recognitionPenaltyCap);
    expect(computeRunScore(run).funnyBonus).toBeLessThanOrEqual(SCORE.funnyCap);
  });
  it('final outcomes cover every ending', () => {
    expect(finalOutcomeOf(resolveNight(createRun(1, 'x', toWorld), 'escaped-empty', 1))).toBe('night-empty');
    expect(finalOutcomeOf(resolveNight(createRun(1, 'x', toWorld), 'dawn-caught', 1))).toBe('night-caught');
    expect(finalOutcomeOf(finishMarket(marketRun(['lantern']), 'escaped', 1))).toBe('market-escaped');
  });
});

describe('run lifecycle', () => {
  it('phase table supports the full night → dawn → bazaar → results loop', () => {
    const path = ['menu', 'preparation', 'night', 'entry', 'interior', 'night', 'night-resolution', 'dawn', 'bazaar', 'bargain', 'bazaar', 'chase', 'bazaar', 'results', 'preparation'] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i]!, path[i + 1]!), `${path[i]}→${path[i + 1]}`).toBe(true);
    expect(canTransition('caught', 'results')).toBe(true);
    expect(canTransition('night-resolution', 'results')).toBe(true);
    expect(canTransition('caught', 'bazaar')).toBe(false); // no magic recovery after a catch
    expect(canTransition('night', 'bazaar')).toBe(false);
  });
  it('market objectives guide the player', () => {
    const base = { houseEntered: true, holeOpen: true, carrying: 2, inventoryFull: false, dawnWarning: false, rahimAwake: false, zone: 'bazaar' as const };
    expect(currentObjective({ ...base, phase: 'bazaar' })).toContain('বিক্রি');
    expect(currentObjective({ ...base, phase: 'bargain' })).toContain('দাম');
    expect(currentObjective({ ...base, phase: 'bazaar', carrying: 0 })).toContain('হিসাব');
    expect(currentObjective({ ...base, phase: 'preparation' })).toContain('প্রস্তুতি');
  });
});

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
}
const completed = (id: string, score: number): CompletedRun => ({ id, seed: 1, endedAtIso: '2026-11-13T00:00:00Z', nickname: 'চোর', outcome: 'completed', score, money: 10, collected: 1, sold: 1, lost: 0, detections: 0, caught: false, line: 'x' });

describe('local persistence v2', () => {
  it('migrates a v1 (Phase 2) save without losing settings', () => {
    const v1 = JSON.stringify({ version: 1, settings: { ...createDefaultDocument().settings, quality: 'low' }, preparationDone: true, nickname: 'বাবলু' });
    const loaded = new PersistenceService(memoryStorage({ [SAVE_KEY]: v1 })).load();
    expect(loaded.notice).toBe('none');
    expect(loaded.document.version).toBe(3); // v1 → v2 → v3 (Phase 4B)
    expect(loaded.document.settings.quality).toBe('low');
    expect(loaded.document.profile.bank).toBe(0);
    expect(loaded.document.preparationDone).toBe(true);
    expect(loaded.document.nickname).toBe('বাবলু');
    expect(loaded.document.runs).toEqual([]);
  });
  it('stores completed runs newest-first, bounded, idempotent; computes personal best', () => {
    let doc = createDefaultDocument();
    for (let i = 0; i < MAX_SAVED_RUNS + 5; i++) doc = addCompletedRun(doc, completed(`r${i}`, i * 10));
    expect(doc.runs).toHaveLength(MAX_SAVED_RUNS);
    expect(doc.runs[0]!.id).toBe(`r${MAX_SAVED_RUNS + 4}`);
    expect(addCompletedRun(doc, completed(`r${MAX_SAVED_RUNS + 4}`, 0))).toBe(doc);
    expect(personalBest(doc)?.score).toBe((MAX_SAVED_RUNS + 4) * 10);
    const storage = memoryStorage();
    const svc = new PersistenceService(storage);
    expect(svc.save(doc)).toBe(true);
    expect(svc.load().document.runs).toHaveLength(MAX_SAVED_RUNS);
  });
  it('keeps valid run records from a partially corrupted save', () => {
    const raw = JSON.stringify({ version: 2, settings: createDefaultDocument().settings, preparationDone: true, runs: [completed('ok', 5), { id: 'broken', score: -3 }] });
    const loaded = new PersistenceService(memoryStorage({ [SAVE_KEY]: raw })).load();
    expect(loaded.notice).toBe('corrupt-reset');
    expect(loaded.document.runs.map((r) => r.id)).toEqual(['ok']);
    expect(loaded.document.preparationDone).toBe(true);
  });
  it('quota errors do not crash and report failure', () => {
    const svc = new PersistenceService({ getItem: () => null, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); }, removeItem: () => {} });
    expect(svc.save(addCompletedRun(createDefaultDocument(), completed('a', 1)))).toBe(false);
  });
});

describe('bazaar layout', () => {
  const loopClear = (route: readonly { x: number; z: number }[]) => route.every((a, i) => segmentClear(a, route[(i + 1) % route.length]!, BAZAAR_OBSTACLES, 0.4));
  it('watchman, Rahim and shopper loops are walkable (no stalls/tree in the way)', () => {
    expect(loopClear(WATCHMAN_ROUTE)).toBe(true);
    expect(loopClear(RAHIM_ROUTE)).toBe(true);
    for (const r of SHOPPER_ROUTES) expect(loopClear(r)).toBe(true);
  });
  it('every merchant counter can be reached from the entrance', () => {
    const from = { x: BAZAAR_SPAWN[0], z: BAZAAR_SPAWN[2] };
    for (const s of STALLS.filter((x) => x.merchant)) {
      const front = stallFront(s, 1.0);
      const path = BAZAAR_NAV.findPath(from, front);
      let prev = from;
      for (const p of path) {
        expect(BAZAAR_NAV.clear(prev, p), `${s.id}`).toBe(true);
        prev = p;
      }
    }
  });
  it('spawn is inside the haat, not in an exit; both gates are exits', () => {
    expect(inBazaarExit({ x: BAZAAR_SPAWN[0], z: BAZAAR_SPAWN[2] })).toBeNull();
    expect(inBazaarExit({ x: 0, z: 22.6 })).toBe('south');
    expect(inBazaarExit({ x: 0, z: -22.6 })).toBe('north');
  });
});

describe('market chase fairness (D-037)', () => {
  it('a thief carrying one item outruns the watchman; a full ঝোলা does not', () => {
    const lantern = LOOT.lantern.weight / CARRY_CAPACITY_KG;
    expect(targetSpeedFor('run', 1, lantern)).toBeGreaterThan(MARKET_RULES.watchmanRunSpeed);
    expect(targetSpeedFor('run', 1, 1)).toBeLessThan(MARKET_RULES.watchmanRunSpeed);
  });
});

describe('run ids', () => {
  it('two runs with the same seed get different ids (history must not drop a replay)', () => {
    const toWorld = (_h: string, p: readonly [number, number, number]): [number, number, number] => [p[0], p[1], p[2]];
    const a = createRun(777, '2026-11-13T01:00:00.000Z', toWorld);
    const b = createRun(777, '2026-11-13T01:05:00.000Z', toWorld);
    expect(a.id).not.toBe(b.id);
  });
});
