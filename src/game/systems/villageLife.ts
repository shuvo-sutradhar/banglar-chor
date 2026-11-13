/**
 * The living village (Stage 5, docs/GAME_DESIGN.md §9). A small set of fair, readable variations
 * planned deterministically per night from the run seed, the day number and the village's memory
 * of the thief (`heat`, from systems/progression.ts):
 *
 * - Night 1 is always the familiar baseline (learn the village; also keeps tests deterministic).
 * - From night 2: a night modifier (moonless / full moon / wedding drums), a patrol variant, a
 *   sleeping dog on the lane to Rahim's house, and 2–3 household noises that can pull the patrol
 *   AWAY (a chance, never a trap: they are not caused by the player and never alert anyone to him).
 * - Villagers remember: recent heat makes the patrol a little sharper-eyed and Rahim a lighter
 *   sleeper (capped), and they talk about last night.
 * - The morning bazaar varies: Eid rush, rain, extra watch.
 */
import { createRng } from '../../lib/rng';
import type { Profile } from './progression';

export type NightModifierId = 'normal' | 'new-moon' | 'full-moon' | 'wedding-drums';
export type PatrolVariant = 'standard' | 'reverse' | 'slow';
export type MarketSituationId = 'normal' | 'eid-rush' | 'rainy' | 'extra-watch';
export type HouseholdKind = 'pot-clatter' | 'cough' | 'door-creak' | 'cat-yowl';

export type HouseholdEvent = { atMinute: number; kind: HouseholdKind; x: number; z: number; labelBn: string };

export type NightPlan = {
  day: number;
  modifier: NightModifierId;
  /** Multiplies villager sight range/rate (moonlight). */
  sightMult: number;
  /** Multiplies the player's footstep noise radius (music masking steps). */
  footstepMult: number;
  /** Multiplies how fast suspicion builds (village on edge after recent incidents). Capped. */
  suspicionMult: number;
  /** Multiplies how easily Rahim stirs. Capped. */
  rahimWakeMult: number;
  patrol: PatrolVariant;
  /** Patrol walking speed multiplier. */
  patrolSpeedMult: number;
  dog: boolean;
  events: HouseholdEvent[];
  /** Spoken at night start when the village remembers the thief. */
  memoryLine: boolean;
  market: MarketSituationId;
  /** Applied to merchants' valuations. */
  priceMult: number;
  /** Applied to recognition build-up in the bazaar. */
  recognitionMult: number;
  /** Bazaar watchman sprint multiplier. */
  watchmanSpeedMult: number;
};

export const MODIFIER_INFO: Record<NightModifierId, { nameBn: string; descBn: string }> = {
  normal: { nameBn: 'সাধারণ রাত', descBn: 'চেনা গ্রাম, চেনা টহল।' },
  'new-moon': { nameBn: 'অমাবস্যার রাত', descBn: 'ঘুটঘুটে অন্ধকার — চোখে পড়া কঠিন (দেখার দূরত্ব −১৫%)।' },
  'full-moon': { nameBn: 'পূর্ণিমার রাত', descBn: 'চাঁদের আলোয় সব দেখা যায় (দেখার দূরত্ব +১৫%), তবে কাল হাটে দাম ভালো (+১০%)।' },
  'wedding-drums': { nameBn: 'পাশের গ্রামে বিয়ে', descBn: 'ঢোলের শব্দে পায়ের আওয়াজ চাপা পড়ে (−২৫%), কিন্তু মজনু চটপটে।' },
};

export const MARKET_INFO: Record<MarketSituationId, { nameBn: string; descBn: string }> = {
  normal: { nameBn: 'সাধারণ হাট', descBn: 'স্বাভাবিক দরদাম।' },
  'eid-rush': { nameBn: 'ঈদের আগের হাট', descBn: 'ভিড়, কেনার ধুম — দাম +১৫%।' },
  rainy: { nameBn: 'বৃষ্টির হাট', descBn: 'লোক কম, দোকানিরা কৃপণ — দাম −১০%।' },
  'extra-watch': { nameBn: 'হাটে বাড়তি পাহারা', descBn: 'পাহারাদার সতর্ক, চিনে ফেলার ভয় বেশি।' },
};

const HOUSEHOLD_SPOTS: readonly { x: number; z: number; labelBn: string }[] = [
  { x: 13, z: -4, labelBn: 'কুদ্দুস মেম্বারের বাড়ি' },
  { x: -11, z: -20, labelBn: 'মোড়ল বাড়ি' },
  { x: -12, z: 24, labelBn: 'গোয়ালঘর' },
];

/** Where the dog naps: beside the lane from the road to Rahim's yard (visible, avoidable). */
export const DOG_SPOT = { x: -5.2, z: 16.2, heading: Math.PI * 0.85 } as const;

export function planNight(seed: number, day: number, heat: number, lastIncident: Profile['lastIncident']): NightPlan {
  const h = Math.min(100, Math.max(0, heat));
  const memory = {
    suspicionMult: 1 + Math.min(0.3, h / 300),
    rahimWakeMult: 1 + Math.min(0.25, h / 400),
    memoryLine: lastIncident === 'seen' || lastIncident === 'chased' || lastIncident === 'caught',
  };
  const base: NightPlan = {
    day,
    modifier: 'normal',
    sightMult: 1,
    footstepMult: 1,
    ...memory,
    patrol: 'standard',
    patrolSpeedMult: 1,
    dog: false,
    events: [],
    market: 'normal',
    priceMult: 1,
    recognitionMult: 1 + Math.min(0.4, h / 250),
    watchmanSpeedMult: 1,
  };
  if (day <= 1) return base;

  const rng = createRng((seed ^ Math.imul(day, 0x9e3779b1)) >>> 0);
  const roll = rng.next();
  const modifier: NightModifierId = roll < 0.4 ? 'normal' : roll < 0.6 ? 'new-moon' : roll < 0.8 ? 'full-moon' : 'wedding-drums';
  const plan: NightPlan = { ...base, modifier, dog: true };
  if (modifier === 'new-moon') plan.sightMult = 0.85;
  if (modifier === 'full-moon') {
    plan.sightMult = 1.15;
    plan.priceMult *= 1.1;
  }
  if (modifier === 'wedding-drums') {
    plan.footstepMult = 0.75;
    plan.patrolSpeedMult = 1.15;
  }
  // After trouble the patrol changes habits (harder to predict), otherwise it varies by night.
  const pr = rng.next();
  plan.patrol = h >= 40 ? (pr < 0.5 ? 'reverse' : 'standard') : pr < 0.6 ? 'standard' : pr < 0.8 ? 'reverse' : 'slow';
  if (plan.patrol === 'slow') plan.patrolSpeedMult *= 0.8;

  const n = 2 + (rng.next() < 0.5 ? 1 : 0);
  const kinds: HouseholdKind[] = ['pot-clatter', 'cough', 'door-creak', 'cat-yowl'];
  for (let i = 0; i < n; i++) {
    const spot = rng.pick(HOUSEHOLD_SPOTS);
    // Spread across the night (1:30–3:50 AM), at least 25 game-minutes apart.
    const atMinute = Math.round(90 + (i * 140) / n + rng.range(0, 20));
    plan.events.push({ atMinute, kind: rng.pick(kinds), x: spot.x, z: spot.z, labelBn: spot.labelBn });
  }

  const mr = rng.next();
  plan.market = mr < 0.5 ? 'normal' : mr < 0.7 ? 'eid-rush' : mr < 0.85 ? 'rainy' : 'extra-watch';
  if (plan.market === 'eid-rush') plan.priceMult *= 1.15;
  if (plan.market === 'rainy') plan.priceMult *= 0.9;
  if (plan.market === 'extra-watch') {
    plan.recognitionMult *= 1.25;
    plan.watchmanSpeedMult = 1.08;
  }
  return plan;
}

/** Noise a household event makes: audible to the patrol, NOT attributed to the player. */
export const HOUSEHOLD_NOISE = { radius: 16, severity: 0.4 } as const;

/** Dog: wakes on nearby noise, growls first (warning), then barks (a real noise event). */
export type DogState = 'asleep' | 'growl' | 'bark' | 'settling';

export const DOG_RULES = {
  /** Footstep/noise must reach the dog at this strength to wake it. */
  wakeStrength: 0.15,
  growlSeconds: 1.4,
  barkSeconds: 3,
  settleSeconds: 6,
  barkNoise: { radius: 18, severity: 0.55 },
} as const;

/**
 * Pure dog step. `heard` is the strongest noise reaching the dog this step (0 = none),
 * `near` whether the player is within 2 m. Growl → bark only if the disturbance continues.
 */
export function stepDog(s: { state: DogState; t: number }, heard: number, near: boolean, dt: number): { state: DogState; t: number; barked: boolean } {
  const disturbed = heard >= DOG_RULES.wakeStrength || near;
  let { state, t } = s;
  t += dt;
  let barked = false;
  switch (state) {
    case 'asleep':
      if (disturbed) {
        state = 'growl';
        t = 0;
      }
      break;
    case 'growl':
      if (t >= DOG_RULES.growlSeconds) {
        if (disturbed) {
          state = 'bark';
          barked = true;
        } else state = 'settling';
        t = 0;
      }
      break;
    case 'bark':
      if (t >= DOG_RULES.barkSeconds) {
        state = 'settling';
        t = 0;
      }
      break;
    case 'settling':
      if (disturbed) {
        state = 'growl';
        t = 0;
      } else if (t >= DOG_RULES.settleSeconds) {
        state = 'asleep';
        t = 0;
      }
      break;
  }
  return { state, t, barked };
}
