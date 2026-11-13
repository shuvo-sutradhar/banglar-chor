/**
 * Food, equipment and supplies (docs/ECONOMY_AND_PROGRESSION.md). Illustrative game-economy
 * values only: not real prices, not nutrition advice. Everything is data; the rules that use it
 * live in systems/progression.ts and are unit-tested.
 */

// ------------------------------------------------------------------ food
export type FoodEffectId = 'sharp-eyes' | 'second-wind' | 'big-lungs';

export type FoodEffect = { id: FoodEffectId; nameBn: string; descBn: string };

export const FOOD_EFFECTS: Record<FoodEffectId, FoodEffect> = {
  'sharp-eyes': { id: 'sharp-eyes', nameBn: 'চোখ খোলা', descBn: 'পরের রাতে সিঁধ কাটার ছন্দ ধরা একটু সহজ (টাইমিং জানালা +১৫%)।' },
  'second-wind': { id: 'second-wind', nameBn: 'দম ফেরে তাড়াতাড়ি', descBn: 'পরের রাতে দম (স্ট্যামিনা) ২০% দ্রুত ফেরে।' },
  'big-lungs': { id: 'big-lungs', nameBn: 'বুকভরা দম', descBn: 'পরের রাতে সর্বোচ্চ দম +২০।' },
};

export type FoodId = 'panta-bhat' | 'cha-biscuit' | 'muri-kola' | 'bhat-dal-dim' | 'bhat-mach-dal';

export type Food = {
  id: FoodId;
  nameBn: string;
  descBn: string;
  /** Taka (game money). 0 = the free daily meal. */
  cost: number;
  /** Energy restored (0–100 scale). */
  energy: number;
  effect?: FoodEffectId;
  /** Voice line the thief says while eating. */
  reactionLine: string;
  /** Free food can be eaten once per day (so recovery never needs money, but can't be farmed). */
  oncePerDay?: boolean;
  icon: string;
};

export const FOODS: readonly Food[] = [
  { id: 'panta-bhat', nameBn: 'পান্তা ভাত, কাঁচা মরিচ', descBn: 'ঘরে যা আছে — বিনা পয়সায়, দিনে একবার।', cost: 0, energy: 18, reactionLine: 'thief.eat.free', oncePerDay: true, icon: '🍚' },
  { id: 'cha-biscuit', nameBn: 'চা আর টোস্ট বিস্কুট', descBn: 'মোড়ের দোকানের কড়া লিকার চা।', cost: 15, energy: 10, effect: 'sharp-eyes', reactionLine: 'thief.eat.tea', icon: '☕' },
  { id: 'muri-kola', nameBn: 'মুড়ি আর কলা', descBn: 'সস্তা, পেট ভরে।', cost: 30, energy: 25, reactionLine: 'thief.eat.yum', icon: '🍌' },
  { id: 'bhat-dal-dim', nameBn: 'ভাত, ডাল, ডিম ভাজা', descBn: 'ভালো খাবার — দম তাড়াতাড়ি ফেরে।', cost: 70, energy: 45, effect: 'second-wind', reactionLine: 'thief.eat.yum', icon: '🍳' },
  { id: 'bhat-mach-dal', nameBn: 'ভাত, মাছের ঝোল, ডাল', descBn: 'রাজকীয় খানা — বুকভরা দম।', cost: 120, energy: 65, effect: 'big-lungs', reactionLine: 'thief.eat.fish', icon: '🐟' },
];

export const FOOD_BY_ID: Record<FoodId, Food> = Object.fromEntries(FOODS.map((f) => [f.id, f])) as Record<FoodId, Food>;

// ------------------------------------------------------------------ equipment
export type EquipSlot = 'tool' | 'bag' | 'footwear';

/** Data-driven modifiers. Multipliers default to 1, additions to 0. */
export type EquipMods = {
  /** Entry challenge progress per good/perfect beat. */
  entryProgress?: number;
  /** Fictional noise of entry mistakes and digging. */
  entryNoise?: number;
  /** Stamina spent per dig. */
  entryStamina?: number;
  /** Extra carrying capacity (kg). */
  carryKg?: number;
  /** Footstep noise radius. */
  footstepNoise?: number;
  /** Sprint stamina drain. */
  sprintCost?: number;
  /** Top running speed. */
  runSpeed?: number;
};

export type EquipmentId = 'bamboo-khunti' | 'soft-khurpi' | 'tin-kodal' | 'iron-shabol' | 'gamcha-jhola' | 'pat-bosta' | 'barefoot' | 'cloth-feet' | 'rubber-chot';

export type Equipment = {
  id: EquipmentId;
  slot: EquipSlot;
  nameBn: string;
  descBn: string;
  /** What you give up — every upgrade has one (no strictly dominant item). */
  tradeoffBn: string;
  cost: number;
  mods: EquipMods;
  /** Owned from the start. */
  starter?: boolean;
  icon: string;
};

export const EQUIPMENT: readonly Equipment[] = [
  // Tools: fictional cartoon "digging" tools for the abstract rhythm challenge.
  { id: 'bamboo-khunti', slot: 'tool', nameBn: 'বাঁশের খুন্তি', descBn: 'পুরোনো সঙ্গী। ধীর, তবে চেনা।', tradeoffBn: '—', cost: 0, mods: {}, starter: true, icon: '🥢' },
  { id: 'soft-khurpi', slot: 'tool', nameBn: 'কাপড়-মোড়া খুরপি', descBn: 'ভুল হলেও শব্দ অনেক কম।', tradeoffBn: 'কাজ একটু ধীর', cost: 700, mods: { entryProgress: 0.85, entryNoise: 0.55, entryStamina: 0.9 }, icon: '🧤' },
  { id: 'tin-kodal', slot: 'tool', nameBn: 'টিনের কোদাল', descBn: 'দ্রুত কাটে।', tradeoffBn: 'ভুলে বেশি শব্দ, একটু বেশি দম লাগে', cost: 900, mods: { entryProgress: 1.35, entryNoise: 1.2, entryStamina: 1.1 }, icon: '⛏️' },
  { id: 'iron-shabol', slot: 'tool', nameBn: 'লোহার শাবল', descBn: 'কয়েক ঘায়েই কাজ শেষ!', tradeoffBn: 'ভারী: অনেক দম লাগে, ভুলে ঢং করে বাজে', cost: 1800, mods: { entryProgress: 1.8, entryNoise: 1.7, entryStamina: 1.8 }, icon: '🔨' },
  // Bags
  { id: 'gamcha-jhola', slot: 'bag', nameBn: 'গামছার ঝোলা', descBn: '৬ কেজি পর্যন্ত।', tradeoffBn: '—', cost: 0, mods: {}, starter: true, icon: '👝' },
  { id: 'pat-bosta', slot: 'bag', nameBn: 'পাটের বস্তা', descBn: '+৩ কেজি জায়গা।', tradeoffBn: 'ভারী বোঝা মানে ধীর পা আর জোরে পায়ের শব্দ', cost: 1100, mods: { carryKg: 3 }, icon: '🎒' },
  // Footwear
  { id: 'barefoot', slot: 'footwear', nameBn: 'খালি পা', descBn: 'যেমন আছে।', tradeoffBn: '—', cost: 0, mods: {}, starter: true, icon: '🦶' },
  { id: 'cloth-feet', slot: 'footwear', nameBn: 'কাপড়ে মোড়া পা', descBn: 'পায়ের শব্দ ৩০% কম।', tradeoffBn: 'দৌড় একটু ধীর', cost: 500, mods: { footstepNoise: 0.7, runSpeed: 0.94 }, icon: '🧦' },
  { id: 'rubber-chot', slot: 'footwear', nameBn: 'রাবারের চটি', descBn: 'দৌড়ে দম কম খরচ (−২৫%)।', tradeoffBn: 'চটাস চটাস — পায়ের শব্দ বেশি', cost: 650, mods: { sprintCost: 0.75, footstepNoise: 1.2 }, icon: '🩴' },
];

export const EQUIPMENT_BY_ID: Record<EquipmentId, Equipment> = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e])) as Record<EquipmentId, Equipment>;

export const STARTER_EQUIPPED: Record<EquipSlot, EquipmentId> = { tool: 'bamboo-khunti', bag: 'gamcha-jhola', footwear: 'barefoot' };

// ------------------------------------------------------------------ supplies (limited use)
export type SupplyId = 'gur-chira';

export type Supply = { id: SupplyId; nameBn: string; descBn: string; cost: number; energy: number; stamina: number; max: number; icon: string };

export const SUPPLIES: Record<SupplyId, Supply> = {
  'gur-chira': { id: 'gur-chira', nameBn: 'গুড়-চিড়ার পোটলা', descBn: 'রাতে একবার খেলে দম পুরো ফেরে আর শক্তি +১৫।', cost: 60, energy: 15, stamina: 100, max: 3, icon: '🍘' },
};

// ------------------------------------------------------------------ energy & stamina tuning
export const ENERGY_RULES = {
  start: 80,
  /** Free nap at the safehouse: once per day. */
  napEnergy: 20,
  /** Night drain: base for staying out, plus exertion. */
  nightBase: 6,
  sprintPerSec: 0.28,
  digPerTap: 0.45,
  /** Energy never goes below this (low energy hurts, never fails the run). */
  floor: 0,
} as const;

export const STAMINA_RULES = {
  /** Max stamina at 100 energy; at 0 energy it's `minMaxFrac` of this. */
  max: 100,
  minMaxFrac: 0.6,
  sprintDrainPerSec: 17,
  /** Extra drain per unit of load ratio while sprinting. */
  loadDrain: 0.5,
  regenPerSec: 20,
  /** At 0 energy regen is this fraction of normal. */
  minRegenFrac: 0.5,
  regenDelay: 0.8,
  /** Once empty, sprint is locked until stamina is back to this. */
  recoverAt: 30,
  /** Stamina per dig tap at the basic tool. */
  digCost: 6,
  /** Resting at the wall recovers stamina this much faster than normal regen. */
  restBoost: 2.2,
} as const;
