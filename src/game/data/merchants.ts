import type { LootCategory } from './loot';

export type MerchantId = 'hashem' | 'jalil' | 'bokul';

/**
 * Data-driven merchant behaviour (README §10). The same bargaining engine runs for all three;
 * every difference in feel comes from these numbers (D-032).
 */
export type MerchantProfile = {
  id: MerchantId;
  nameBn: string;
  shopBn: string;
  styleBn: string;
  likesBn: string;
  /** Price multiplier per category; 0 = will not buy (with a stated reason). */
  prefs: Record<LootCategory, number>;
  refuseReasonBn: Partial<Record<LootCategory, string>>;
  /** Opening offer as a fraction of what he would really pay. */
  openFraction: number;
  /** Chance (seeded) of an insultingly low first offer, and how low. */
  lowballChance: number;
  lowballFraction: number;
  /** Reservation price = perceived value × preference × capFraction (± noise). */
  capFraction: number;
  priceNoise: number;
  maxCounters: number;
  /** Starting patience (0..100) and its cost per counter / per +100 % over his limit. */
  patience: number;
  counterPatienceCost: number;
  excessPatienceCost: number;
  /** Suspicion gained per +100 % asked above his limit ("কোথায় পাইছ এত দামি জিনিস?"). */
  suspicionPerExcess: number;
  /** Recognition multiplier (0..1). */
  observant: number;
  /** ≥ 0.7 sees through fake/broken goods. */
  defectDetection: number;
  budget: number;
  /** Persuasion meter: needle speed (cycles/s) and half-widths of the perfect/good zones. */
  persuasion: { speed: number; perfect: number; good: number };
};

export const MERCHANTS: Readonly<Record<MerchantId, MerchantProfile>> = {
  hashem: {
    id: 'hashem',
    nameBn: 'হাশেম কাকা',
    shopBn: 'হাঁড়িপাতিলের দোকান',
    styleBn: 'অভিজ্ঞ, ধৈর্যশীল — আজগুবি দাম শুনলে সন্দেহ করেন',
    likesBn: 'পিতল-কাঁসা, ঘরের জিনিস',
    prefs: { metal: 1.15, household: 1.0, electronics: 0.6, jewelry: 0.85, livestock: 0, junk: 0.3 },
    refuseReasonBn: { livestock: 'মুরগি-টুরগি আমি কিনি না বাবা, এটা হাঁড়িপাতিলের দোকান।' },
    openFraction: 0.62,
    lowballChance: 0,
    lowballFraction: 0.62,
    capFraction: 0.9,
    priceNoise: 0.06,
    maxCounters: 4,
    patience: 100,
    counterPatienceCost: 16,
    excessPatienceCost: 40,
    suspicionPerExcess: 55,
    observant: 1.0,
    defectDetection: 0.9,
    budget: 3000,
    persuasion: { speed: 0.55, perfect: 0.07, good: 0.16 },
  },
  jalil: {
    id: 'jalil',
    nameBn: 'জলিল ভাই',
    shopBn: 'পুরোনো ইলেকট্রনিক্স',
    styleBn: 'চালাক, কড়া দরদাম — হঠাৎ খুব কম দাম বলে বসেন',
    likesBn: 'রেডিও, ঘড়ি, যন্ত্রপাতি',
    prefs: { metal: 0.7, household: 0.8, electronics: 1.25, jewelry: 0.9, livestock: 0, junk: 0.5 },
    refuseReasonBn: { livestock: 'মুরগি দিয়া আমি কী করমু? রেডিওর ভিতরে ঢুকামু?' },
    openFraction: 0.45,
    lowballChance: 0.35,
    lowballFraction: 0.28,
    capFraction: 0.95,
    priceNoise: 0.08,
    maxCounters: 5,
    patience: 100,
    counterPatienceCost: 12,
    excessPatienceCost: 30,
    suspicionPerExcess: 25,
    observant: 0.55,
    defectDetection: 0.3,
    budget: 2500,
    persuasion: { speed: 0.8, perfect: 0.055, good: 0.13 },
  },
  bokul: {
    id: 'bokul',
    nameBn: 'বকুল আপা',
    shopBn: 'হাটের দোকান — সব রকম মাল',
    styleBn: 'ঝটপট সিদ্ধান্ত, ন্যায্য কিন্তু সাবধানী — ধৈর্য কম',
    likesBn: 'মুরগি, ঘরের টুকিটাকি',
    prefs: { metal: 0.9, household: 1.05, electronics: 0.8, jewelry: 0.75, livestock: 1.25, junk: 0.2 },
    refuseReasonBn: {},
    openFraction: 0.75,
    lowballChance: 0,
    lowballFraction: 0.75,
    capFraction: 0.85,
    priceNoise: 0.04,
    maxCounters: 2,
    patience: 60,
    counterPatienceCost: 22,
    excessPatienceCost: 35,
    suspicionPerExcess: 30,
    observant: 0.8,
    defectDetection: 0.8,
    budget: 1500,
    persuasion: { speed: 0.65, perfect: 0.08, good: 0.18 },
  },
};

export const MERCHANT_IDS: readonly MerchantId[] = ['hashem', 'jalil', 'bokul'];
