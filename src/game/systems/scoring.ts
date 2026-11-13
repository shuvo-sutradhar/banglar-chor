import { HOUSE_PROFILES } from '../data/houses';
import { LOOT, type LootId } from '../data/loot';
import type { RunState } from './runLogic';

/**
 * Final run scoring (README §12) — ONE pure, deterministic function of the run state/event log.
 *
 * Resolution of the README formula's double-counting risk (D-034): every item contributes at most
 * once — either through its sale (floor(price × 0.5)) or, if it ends the run still in hand, as
 * unsold loot (floor(base × 0.25)). Confiscated items contribute nothing. Money and score are
 * separate: money = sales − fines; score never goes negative and is always an integer.
 */
export const SCORE = {
  saleFactor: 0.5,
  unsoldLootFactor: 0.25,
  cleanEscapeBonus: 500,
  stealthMax: 300,
  stealthPerDetection: 100,
  riskCap: 400,
  funnyCap: 300,
  nightCaughtPenalty: 600,
  marketCaughtPenalty: 400,
  recognitionPenalty: 250,
  recognitionPenaltyCap: 2,
} as const;

export type FinalOutcome = 'night-caught' | 'night-empty' | 'night-escaped' | 'completed' | 'market-escaped' | 'market-caught';

export type ScoreBreakdown = {
  outcome: FinalOutcome;
  saleScore: number;
  unsoldLootScore: number;
  cleanEscapeBonus: number;
  stealthBonus: number;
  riskBonus: number;
  funnyBonus: number;
  funnyReasons: string[];
  nightCaughtPenalty: number;
  marketCaughtPenalty: number;
  recognitionPenalty: number;
  score: number;
  money: number;
  grossSales: number;
  fine: number;
  stats: {
    collected: number;
    sold: number;
    lost: number;
    leftBehind: number;
    detections: number;
    escapes: number;
    caught: boolean;
    recognitions: number;
  };
};

export function finalOutcomeOf(run: RunState): FinalOutcome {
  if (run.outcome === 'caught' || run.outcome === 'dawn-caught') return 'night-caught';
  if (run.outcome === 'escaped-empty' || (run.outcome === 'escaped-with-loot' && !run.market && run.inventory.length === 0)) return 'night-empty';
  if (!run.market) return 'night-escaped';
  if (run.market.outcome === 'caught') return 'market-caught';
  if (run.market.outcome === 'escaped') return 'market-escaped';
  return 'completed';
}

const safe = (n: number) => (Number.isFinite(n) ? n : 0);

export function computeRunScore(run: RunState): ScoreBreakdown {
  const outcome = finalOutcomeOf(run);
  const m = run.market;
  const sold = m?.sold ?? [];
  const grossSales = sold.reduce((s, x) => s + safe(x.price), 0);
  const fine = m?.fine ?? 0;
  const money = Math.max(0, Math.floor(safe(m?.money ?? 0)));
  const nightCaught = outcome === 'night-caught';
  const escapedNightWithLoot = run.outcome === 'escaped-with-loot';

  const saleScore = Math.floor(grossSales * SCORE.saleFactor);
  // Items still in hand at the end (never sold, never confiscated).
  const unsoldLootScore = nightCaught ? 0 : run.inventory.reduce((s, i) => s + Math.floor(LOOT[i.lootId].baseValue * SCORE.unsoldLootFactor), 0);
  const cleanEscapeBonus = escapedNightWithLoot && !nightCaught ? SCORE.cleanEscapeBonus : 0;
  const detections = run.detections + (m?.detections ?? 0);
  const stealthBonus = escapedNightWithLoot ? Math.max(0, SCORE.stealthMax - SCORE.stealthPerDetection * detections) : 0;
  const riskBonus = escapedNightWithLoot ? Math.min(SCORE.riskCap, Math.max(0, ...run.houseIdsEntered.map((h) => HOUSE_PROFILES[h].riskBonus))) : 0;

  // Comedy achievements (capped), each from real events.
  const funnyReasons: string[] = [];
  let funny = 0;
  const soldIds = new Set<LootId>(sold.map((s) => s.lootId));
  const kept = new Set<LootId>([...run.inventory.map((i) => i.lootId), ...sold.map((s) => s.lootId)]);
  const award = (cond: boolean, pts: number, reason: string) => {
    if (cond) {
      funny += pts;
      funnyReasons.push(reason);
    }
  };
  award(!nightCaught && kept.has('dentures'), 100, 'শ্বশুরের নকল দাঁত নিয়া পালাইছ');
  award(soldIds.has('chicken'), 100, 'মুরগি বেচা চোর');
  award(sold.some((s) => s.lootId === 'fake-jewelry' && s.price >= 200), 150, 'নকল হার আসল দামে গছাইছ');
  award(soldIds.has('broken-torch'), 80, 'নষ্ট টর্চও বেচে দিছ');
  award(soldIds.has('actual-jewelry'), 100, 'আসল গয়না বেচে বড়লোক');
  const funnyBonus = Math.min(SCORE.funnyCap, funny);

  const nightCaughtPenalty = nightCaught ? SCORE.nightCaughtPenalty : 0;
  const marketCaughtPenalty = outcome === 'market-caught' ? SCORE.marketCaughtPenalty : 0;
  const recognitions = m?.recognitions ?? 0;
  const recognitionPenalty = SCORE.recognitionPenalty * Math.min(SCORE.recognitionPenaltyCap, recognitions);

  const raw = saleScore + unsoldLootScore + cleanEscapeBonus + stealthBonus + riskBonus + funnyBonus - nightCaughtPenalty - marketCaughtPenalty - recognitionPenalty;
  const score = Math.max(0, Math.floor(safe(raw)));

  const collected = new Set(run.events.filter((e) => e.type === 'pickup').map((e) => e.instanceId)).size;
  const leftBehind = run.worldItems.filter((w) => w.dropped).length;
  const escapes = run.events.filter((e) => e.type === 'escape' || e.type === 'market-escape').length + Math.max(0, run.chases + (m?.detections ?? 0) - run.caughtCount);

  return {
    outcome,
    saleScore,
    unsoldLootScore,
    cleanEscapeBonus,
    stealthBonus,
    riskBonus,
    funnyBonus,
    funnyReasons,
    nightCaughtPenalty,
    marketCaughtPenalty,
    recognitionPenalty,
    score,
    money,
    grossSales,
    fine,
    stats: {
      collected,
      sold: sold.length,
      lost: run.confiscated.length,
      leftBehind,
      detections,
      escapes,
      caught: run.caughtCount > 0,
      recognitions,
    },
  };
}

/** Personalised Bangla one-liner chosen from what actually happened (README §12/§13). */
export function summaryLine(run: RunState, b: ScoreBreakdown): string {
  const confiscatedIds = new Set(run.confiscated.map((c) => c.lootId));
  const recognizedRahimItem = run.events.some((e) => e.type === 'recognition' && (e.itemId === 'lantern' || e.itemId === 'brass-pot'));
  const jalilFooled = run.market?.sold.some((s) => s.lootId === 'fake-jewelry' && s.merchantId === 'jalil' && s.price >= 200);
  switch (b.outcome) {
    case 'market-caught':
      if (recognizedRahimItem) return 'রহিম চাচার মাল বিক্রি করতে গিয়া হাটের মাঝখানেই ধরা!';
      return 'বাজারে মাল বেচতে গিয়া ধরা খাইলি — কপাল খারাপ!';
    case 'night-caught':
      if (run.caughtBy === 'rahim') return 'রহিম চাচা ঘুম ভাইঙা নিজেই চোর ধরলেন!';
      if (confiscatedIds.has('dentures')) return 'শ্বশুরের দাঁত চুরি করতে গিয়া নিজের দাঁত কেলাইয়া ধরা!';
      if (run.outcome === 'dawn-caught') return 'ফজরের আজান শুনেও ঘরে বইসা ছিলি? এখন বোঝ!';
      return 'চুরি করতে গিয়া নিজের স্যান্ডেল হারাইছস!';
    case 'night-empty':
      return 'খালি হাতে ফিরলি — অন্তত হাত-পা তো আস্ত আছে!';
    case 'night-escaped':
      return 'মাল নিয়া পালাইলি, কিন্তু বেচলি না — রাখবি কই?';
    case 'market-escaped':
      return 'পাহারাদারের চোখে ধুলা দিয়া পালাইলি — ওস্তাদ চোর!';
    case 'completed':
      if (jalilFooled) return 'জলিল ভাইরে নকল হার গছাইয়া দিলি — জলিল ভাই এখনো খুশি!';
      if (b.money >= 1500) return 'আজকে তো পুরাই মালামাল ব্যবসায়ী!';
      if (b.money > 0) return 'ছোটখাটো ব্যবসা, তাও তো লাভ!';
      return 'বাজার ঘুইরা কিছুই বেচলি না? চা খাইয়াই চইলা আসলি!';
  }
}
