import { MERCHANT_IDS, MERCHANTS, type MerchantId } from '../data/merchants';
import { LOOT } from '../data/loot';
import { createMerchantState, type MerchantState } from './bargaining';
import { appendEvent, type MarketOutcome, type MarketState, type RunState } from './runLogic';

/**
 * Pure market-side run transitions (README §10). Every function is atomic and idempotent where it
 * matters: an item can be sold once, money is credited once, confiscation happens once.
 */
export const MARKET_RULES = {
  /** Fraction of earned money confiscated when caught at the market ("জরিমানা"). */
  caughtFineFraction: 0.5,
  /**
   * Watchman sprint (m/s), D-037: below a lightly loaded thief's sprint so bolting for a gate at
   * once works, above a heavily loaded one's so greed still gets you caught.
   */
  watchmanRunSpeed: 4.6,
} as const;

/** Only an escape WITH loot leads to the bazaar (GAME_DESIGN §2). */
export function canEnterMarket(run: RunState): boolean {
  return run.outcome === 'escaped-with-loot' && run.inventory.length > 0;
}

export function enterMarket(run: RunState, atSec: number): RunState {
  if (run.market || !canEnterMarket(run)) return run;
  const merchants = Object.fromEntries(MERCHANT_IDS.map((id) => [id, createMerchantState(MERCHANTS[id])])) as Record<MerchantId, MerchantState>;
  const market: MarketState = { money: 0, sold: [], merchants, recognitions: 0, detections: 0, fine: 0, outcome: null };
  return appendEvent({ ...run, market }, { type: 'market-enter', atSec });
}

export type SaleResult = { ok: true; run: RunState } | { ok: false; reason: 'no-market' | 'not-in-inventory' | 'already-sold' | 'bad-price' | 'market-closed' };

/** Atomic sale: removes the item from inventory exactly once and credits money exactly once. */
export function sellItem(run: RunState, instanceId: string, merchantId: MerchantId, price: number, merchantState: MerchantState, atSec: number): SaleResult {
  const m = run.market;
  if (!m) return { ok: false, reason: 'no-market' };
  if (m.outcome) return { ok: false, reason: 'market-closed' };
  if (m.sold.some((s) => s.instanceId === instanceId)) return { ok: false, reason: 'already-sold' };
  const item = run.inventory.find((i) => i.instanceId === instanceId);
  if (!item) return { ok: false, reason: 'not-in-inventory' };
  if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(price)) return { ok: false, reason: 'bad-price' };
  const next: RunState = {
    ...run,
    inventory: run.inventory.filter((i) => i.instanceId !== instanceId),
    market: {
      ...m,
      money: m.money + price,
      sold: [...m.sold, { ...item, price, merchantId, atSec }],
      merchants: { ...m.merchants, [merchantId]: merchantState },
    },
  };
  return { ok: true, run: appendEvent(next, { type: 'sale', atSec, itemId: item.lootId, instanceId, value: price, context: merchantId }) };
}

/** Commit a merchant's state after a session that did not end in a sale. */
export function updateMerchant(run: RunState, merchantId: MerchantId, state: MerchantState): RunState {
  if (!run.market) return run;
  return { ...run, market: { ...run.market, merchants: { ...run.market.merchants, [merchantId]: state } } };
}

export function recordMarketEvent(run: RunState, type: 'recognition' | 'excuse' | 'market-alarm' | 'market-chase' | 'sale-refused', atSec: number, context?: string, instanceId?: string): RunState {
  if (!run.market) return run;
  let market = run.market;
  if (type === 'recognition') market = { ...market, recognitions: market.recognitions + 1 };
  if (type === 'market-chase') market = { ...market, detections: market.detections + 1 };
  const item = instanceId ? run.inventory.find((i) => i.instanceId === instanceId) : undefined;
  return appendEvent({ ...run, market }, { type, atSec, context, instanceId, itemId: item?.lootId });
}

/**
 * End the market session once (idempotent).
 * - completed / escaped: keep unsold items and all money.
 * - caught: every unsold item is confiscated and half the earned money is taken as a fine.
 */
export function finishMarket(run: RunState, outcome: MarketOutcome, atSec: number): RunState {
  const m = run.market;
  if (!m || m.outcome) return run;
  if (outcome !== 'caught') {
    return appendEvent({ ...run, market: { ...m, outcome } }, { type: outcome === 'escaped' ? 'market-escape' : 'market-exit', atSec });
  }
  const fine = Math.floor(m.money * MARKET_RULES.caughtFineFraction);
  let next: RunState = {
    ...run,
    caughtCount: run.caughtCount + 1,
    confiscated: [...run.confiscated, ...run.inventory],
    inventory: [],
    market: { ...m, outcome, fine, money: m.money - fine },
  };
  next = appendEvent(next, { type: 'market-catch', atSec });
  for (const item of run.inventory) next = appendEvent(next, { type: 'confiscate', atSec, itemId: item.lootId, instanceId: item.instanceId, value: LOOT[item.lootId].baseValue, context: 'market' });
  if (fine > 0) next = appendEvent(next, { type: 'fine', atSec, value: fine });
  return next;
}
