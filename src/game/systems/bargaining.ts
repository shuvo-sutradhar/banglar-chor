import { createRng, hashString } from '../../lib/rng';
import { LOOT, type LootId } from '../data/loot';
import type { MerchantProfile } from '../data/merchants';

/**
 * Interactive bargaining (README §10). Pure and deterministic given (seed, merchant, item).
 * - The merchant has a hidden reservation price (what he would really pay).
 * - The player counters at +10/+25/+50 % and plays a short persuasion timing beat.
 * - Asking within his limit + decent timing → he agrees; asking far above → patience drops,
 *   suspicion rises, and the offer may even go DOWN. Skill moves the offer, within a cap.
 * - Recognition is deterministic (no surprise dice): if recognizability × observant (+ suspicion)
 *   crosses a threshold he WARNS first; only failed excuses / continued pushing lead to a
 *   confrontation (D-033).
 */
export type Quality = 'perfect' | 'good' | 'miss';

export type MerchantState = {
  patience: number;
  suspicion: number;
  budgetLeft: number;
  /** Items this merchant will no longer consider (after a withdrawal from recognition). */
  refused: string[];
  /** After a confrontation he refuses to trade at all. */
  closed: boolean;
};

export function createMerchantState(p: MerchantProfile): MerchantState {
  return { patience: p.patience, suspicion: 0, budgetLeft: p.budget, refused: [], closed: false };
}

export type SessionPhase = 'offer' | 'recognition' | 'refused' | 'withdrawn' | 'confronted' | 'sold';

export type SessionLine = { speaker: 'merchant' | 'thief'; text: string };

export const RECOGNITION_THRESHOLD = 0.5;
export const COUNTER_STEPS = [0.1, 0.25, 0.5] as const;

const round5 = (v: number) => Math.max(5, Math.round(v / 5) * 5);

export type SessionItem = { instanceId: string; lootId: LootId; sourceHouseId: string };

export class BargainSession {
  readonly merchant: MerchantProfile;
  readonly item: SessionItem;
  readonly state: MerchantState;
  phase: SessionPhase = 'offer';
  perceivedValue = 0;
  reservation = 0;
  offer = 0;
  countersUsed = 0;
  warned = false;
  excused = false;
  defectSpotted = false;
  refuseReason: string | null = null;
  lines: SessionLine[] = [];
  /** Final price when sold. */
  price = 0;

  constructor(merchant: MerchantProfile, state: MerchantState, item: SessionItem, seed: number, opts: { ownerAlert?: boolean; /** Bazaar situation (Stage 5): Eid rush, rain… */ priceMult?: number } = {}) {
    this.merchant = merchant;
    this.item = item;
    // Work on a copy; the caller commits `state` back explicitly.
    this.state = { ...state, refused: [...state.refused] };
    const def = LOOT[item.lootId];
    const rng = createRng((seed ^ hashString(`${merchant.id}:${item.instanceId}`)) >>> 0);
    const pref = merchant.prefs[def.category];

    if (this.state.closed) {
      this.refuse('আর তোমার সাথে কোনো কারবার নাই! যাও এখান থেকে!');
      return;
    }
    if (this.state.refused.includes(item.instanceId)) {
      this.refuse('এই জিনিস আমি আর ছুঁইও না। অন্য কিছু থাকলে দেখাও।');
      return;
    }
    if (pref <= 0) {
      this.refuse(merchant.refuseReasonBn[def.category] ?? 'এই জিনিস আমি কিনি না।');
      return;
    }
    // Perceived value: an expert sees through fakes / broken goods.
    this.defectSpotted = Boolean(def.defect) && merchant.defectDetection >= 0.7;
    if (def.defect === 'fake') this.perceivedValue = this.defectSpotted ? def.baseValue : 450; // the shiny necklace fools the unwary
    else if (def.defect === 'broken') this.perceivedValue = this.defectSpotted ? def.baseValue * 0.5 : def.baseValue;
    else this.perceivedValue = def.baseValue;
    this.perceivedValue *= opts.priceMult ?? 1;

    const noise = 1 + (rng.next() * 2 - 1) * merchant.priceNoise;
    this.reservation = Math.min(this.state.budgetLeft, Math.max(5, this.perceivedValue * pref * merchant.capFraction * noise));
    const lowball = rng.next() < merchant.lowballChance;
    this.offer = round5(this.reservation * (lowball ? merchant.lowballFraction : merchant.openFraction));
    if (this.reservation < 5 || this.state.budgetLeft < 5) {
      this.refuse('আজ পকেট খালি, আর কিনতে পারমু না।');
      return;
    }

    // Recognition check (deterministic): who knows the owner, how distinctive the item is.
    const risk = def.recognizability * merchant.observant + this.state.suspicion / 200 + (opts.ownerAlert ? 0.1 : 0);
    if (risk >= RECOGNITION_THRESHOLD) {
      this.warned = true;
      this.phase = 'recognition';
      this.state.suspicion = Math.min(100, this.state.suspicion + 25);
    }
    if (lowball) this.say('merchant', `${this.offer} টাকা দিমু। এর বেশি কেউ দিব না, লিখা রাখো!`);
  }

  get maxCounters(): number {
    return this.merchant.maxCounters;
  }

  get countersLeft(): number {
    return Math.max(0, this.merchant.maxCounters - this.countersUsed);
  }

  /** The asking price for a counter step (relative to the current offer). */
  askFor(step: number): number {
    return round5(this.offer * (1 + step));
  }

  /** Counter-offer at `ask` after a persuasion beat of `quality`. */
  counter(ask: number, quality: Quality): void {
    if (this.phase !== 'offer' && this.phase !== 'recognition') return;
    if (this.countersLeft <= 0) return;
    this.countersUsed++;
    const m = this.merchant;
    const excess = Math.max(0, (ask - this.reservation) / this.reservation);
    this.state.patience -= m.counterPatienceCost + excess * m.excessPatienceCost * (quality === 'miss' ? 1.3 : quality === 'perfect' ? 0.7 : 1);
    this.state.suspicion = Math.min(100, this.state.suspicion + excess * m.suspicionPerExcess + (this.warned && !this.excused ? 20 : 0));
    if (this.state.suspicion >= 100) return this.confront();
    if (this.state.patience <= 0) {
      this.state.patience = 0;
      this.refuse('ধুর! এত দরদাম আমার সহ্য হয় না। যাও, বেচমু না কিনমু না!');
      return;
    }
    if (ask <= this.reservation) {
      this.offer = quality === 'miss' ? round5(this.offer + (ask - this.offer) * 0.5) : ask;
      return;
    }
    const cap = this.reservation * (quality === 'perfect' ? 1.05 : 1);
    const move = quality === 'perfect' ? 0.7 : quality === 'good' ? 0.45 : 0.15;
    let next = this.offer + (cap - this.offer) * move;
    if (excess > 0.6 && quality === 'miss') next = this.offer * 0.9; // insulted: the offer drops
    this.offer = Math.min(round5(next), round5(cap));
  }

  /** Excuse during a recognition warning (timing beat decides whether it sounds convincing). */
  excuse(quality: Quality): void {
    if (this.phase !== 'recognition') return;
    if (quality === 'miss') {
      this.state.suspicion = Math.min(100, this.state.suspicion + 35);
      if (this.state.suspicion >= 100) this.confront();
      return;
    }
    this.excused = true;
    this.phase = 'offer';
    this.state.suspicion = Math.max(0, this.state.suspicion - (quality === 'perfect' ? 25 : 15));
    // "Doubtful goods" — he still buys, but cheaper.
    this.reservation *= 0.8;
    this.offer = Math.min(this.offer, round5(this.reservation));
  }

  accept(): boolean {
    if (this.phase !== 'offer') return false;
    this.price = Math.min(round5(this.offer), Math.floor(this.state.budgetLeft));
    if (this.price <= 0) return false;
    this.phase = 'sold';
    this.state.budgetLeft -= this.price;
    // A completed deal calms him a little.
    this.state.suspicion = Math.max(0, this.state.suspicion - 5);
    return true;
  }

  /** Walk away. During a recognition warning this means withdrawing the item. */
  walkAway(): void {
    if (this.phase === 'recognition') {
      this.state.suspicion = Math.min(100, this.state.suspicion + 15);
      this.state.refused.push(this.item.instanceId);
      this.phase = 'withdrawn';
      return;
    }
    if (this.phase === 'offer') {
      this.state.patience = Math.max(0, this.state.patience - 8);
      this.phase = 'withdrawn';
    }
  }

  get finished(): boolean {
    return this.phase === 'sold' || this.phase === 'refused' || this.phase === 'withdrawn' || this.phase === 'confronted';
  }

  private refuse(reason: string) {
    this.phase = 'refused';
    this.refuseReason = reason;
  }

  private confront() {
    this.phase = 'confronted';
    this.state.closed = true;
    this.state.suspicion = 100;
  }

  private say(speaker: SessionLine['speaker'], text: string) {
    this.lines.push({ speaker, text });
  }
}

/** Patience recovers a little between visits so a player can come back later. */
export function recoverBetweenVisits(state: MerchantState, p: MerchantProfile): MerchantState {
  return { ...state, patience: Math.min(p.patience, state.patience + 20) };
}

/**
 * Persuasion timing meter: needle position 0..1 (triangle wave), sweet spot at 0.5.
 * Judged by the input's real timestamp (D-024).
 */
export function persuasionNeedle(t: number, speed: number): number {
  const ph = (t * speed) % 1;
  return ph < 0.5 ? ph * 2 : 2 - ph * 2;
}

export function judgePersuasion(t: number, speed: number, zones: { perfect: number; good: number }): Quality {
  const off = Math.abs(persuasionNeedle(t, speed) - 0.5);
  return off <= zones.perfect ? 'perfect' : off <= zones.good ? 'good' : 'miss';
}

/** Seconds until the needle next crosses the sweet spot (for hints/tests). */
export function msUntilSweet(t: number, speed: number): number {
  // Needle hits 0.5 at phase 0.25 and 0.75 of each cycle.
  const ph = (t * speed) % 1;
  const targets = [0.25, 0.75, 1.25];
  const next = targets.find((x) => x > ph + 1e-6) ?? 1.25;
  return ((next - ph) / speed) * 1000;
}
