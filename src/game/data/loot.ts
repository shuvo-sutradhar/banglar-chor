/**
 * Starter loot table (README §8). Values are GAME ECONOMY placeholders, not real-world prices.
 */
export type LootId =
  | 'brass-pot'
  | 'lantern'
  | 'old-radio'
  | 'chicken'
  | 'fake-jewelry'
  | 'actual-jewelry'
  | 'broken-torch'
  | 'dentures'
  | 'metal-plate'
  | 'alarm-clock';

export type LootEffect =
  | 'clang-on-drop'
  | 'glass-rattle'
  | 'may-play-music'
  | 'random-cluck'
  | 'may-ring'
  | 'looks-expensive'
  | 'highly-recognizable'
  | 'useless';

export type LootCategory = 'metal' | 'household' | 'electronics' | 'livestock' | 'jewelry' | 'junk';

export type LootDef = {
  id: LootId;
  nameBn: string;
  /** True base value (hidden from the player). */
  baseValue: number;
  /** What the player sees; deliberately uncertain for some items. */
  approxValueBn: string;
  weight: number;
  rarity: 'common' | 'uncommon' | 'rare';
  /** 0..1, shown to the player as low/medium/high noise risk. */
  soundRisk: number;
  effects: readonly LootEffect[];
  flavorBn: string;
  pickupLineBn: string;
  /** Market behaviour (used from Phase 3). */
  marketRestriction?: 'recognizable';
  /** Phase 3 market data. */
  category: LootCategory;
  /** 0..1 — how likely someone who knows the owner identifies it (deterministic rules, D-033). */
  recognizability: number;
  /** Visible sticking out of the bag (Rahim can spot it while shopping). */
  conspicuous: boolean;
  /** Fake/broken: an expert sees through it and pays almost nothing. */
  defect?: 'fake' | 'broken';
};

export const LOOT: Readonly<Record<LootId, LootDef>> = {
  'brass-pot': {
    category: 'metal', recognizability: 0.55, conspicuous: true,
    id: 'brass-pot', nameBn: 'পিতলের বদনা', baseValue: 300, approxValueBn: '~৳৩০০', weight: 2, rarity: 'common', soundRisk: 0.5,
    effects: ['clang-on-drop'], flavorBn: 'ঝকঝকে পিতল। পড়লে ঢং ঢং করে পুরো গ্রাম জাগাবে।', pickupLineBn: 'বদনাটা নিলাম। হাত থেকে না পড়লেই হয়!',
  },
  lantern: {
    category: 'household', recognizability: 0.6, conspicuous: true,
    id: 'lantern', nameBn: 'হারিকেন', baseValue: 450, approxValueBn: '~৳৪৫০', weight: 1, rarity: 'common', soundRisk: 0.35,
    effects: ['glass-rattle'], flavorBn: 'কাচটা একটু ঢিলা — দৌড়ালে ঝনঝন করে।', pickupLineBn: 'হারিকেন নিলাম — ঘরটা অন্ধকার হয়ে গেল!',
  },
  'old-radio': {
    category: 'electronics', recognizability: 0.45, conspicuous: true,
    id: 'old-radio', nameBn: 'পুরোনো রেডিও', baseValue: 1200, approxValueBn: '~৳১২০০', weight: 3, rarity: 'uncommon', soundRisk: 0.8,
    effects: ['may-play-music'], flavorBn: 'নব ঘোরালেই গান। হঠাৎ নিজে নিজেও বাজে নাকি?', pickupLineBn: 'এইডা তো জম্পেশ মাল! শুধু বেজে না উঠলেই হলো…',
  },
  chicken: {
    category: 'livestock', recognizability: 0.35, conspicuous: true,
    id: 'chicken', nameBn: 'মুরগি', baseValue: 500, approxValueBn: '~৳৫০০', weight: 2, rarity: 'common', soundRisk: 0.9,
    effects: ['random-cluck'], flavorBn: 'ঝাঁকার নিচে ঘুমাচ্ছে। কতক্ষণ চুপ থাকবে কে জানে।', pickupLineBn: 'চুপ কর মুরগি, চুপ কর!',
  },
  'fake-jewelry': {
    category: 'jewelry', recognizability: 0.1, conspicuous: false, defect: 'fake',
    id: 'fake-jewelry', nameBn: 'সোনালি হার', baseValue: 80, approxValueBn: 'অনেক দামি?', weight: 0.2, rarity: 'common', soundRisk: 0.05,
    effects: ['looks-expensive'], flavorBn: 'চকচক করছে… আসল সোনা নাকি?', pickupLineBn: 'সোনার হার! আজ রাজা হয়ে যাব!',
  },
  'actual-jewelry': {
    category: 'jewelry', recognizability: 0.9, conspicuous: false,
    id: 'actual-jewelry', nameBn: 'আসল গয়না', baseValue: 5000, approxValueBn: 'অনেক দামি?', weight: 0.2, rarity: 'rare', soundRisk: 0.05,
    effects: ['highly-recognizable'], flavorBn: 'ভারী আর ঝকঝকে। এটা সবাই চিনবে।', pickupLineBn: 'এ তো আসল জিনিস মনে হচ্ছে!', marketRestriction: 'recognizable',
  },
  'broken-torch': {
    category: 'junk', recognizability: 0.05, conspicuous: false, defect: 'broken',
    id: 'broken-torch', nameBn: 'নষ্ট টর্চলাইট', baseValue: 20, approxValueBn: '~৳২০', weight: 1, rarity: 'common', soundRisk: 0.1,
    effects: ['useless'], flavorBn: 'সুইচ টিপলে কিছুই হয় না।', pickupLineBn: 'নষ্ট টর্চ… তাও নিয়ে রাখি।',
  },
  dentures: {
    category: 'junk', recognizability: 0.3, conspicuous: false,
    id: 'dentures', nameBn: 'শ্বশুরের নকল দাঁত', baseValue: 10, approxValueBn: '~৳১০', weight: 0.1, rarity: 'uncommon', soundRisk: 0.05,
    effects: ['useless'], flavorBn: 'গ্লাসের পানিতে দাঁত হাসছে।', pickupLineBn: 'এইটা দিয়া কী করমু আল্লাহই জানে!',
  },
  'metal-plate': {
    category: 'metal', recognizability: 0.4, conspicuous: true,
    id: 'metal-plate', nameBn: 'কাঁসার থালা', baseValue: 750, approxValueBn: '~৳৭৫০', weight: 1.4, rarity: 'common', soundRisk: 0.6,
    effects: ['clang-on-drop'], flavorBn: 'ভারী কাঁসা। মাটিতে পড়লে ঝনাৎ!', pickupLineBn: 'কাঁসার থালা — দামি জিনিস!',
  },
  'alarm-clock': {
    category: 'electronics', recognizability: 0.3, conspicuous: false,
    id: 'alarm-clock', nameBn: 'পুরোনো এলার্ম ঘড়ি', baseValue: 350, approxValueBn: '~৳৩৫০', weight: 0.5, rarity: 'common', soundRisk: 0.7,
    effects: ['may-ring'], flavorBn: 'টিক টিক টিক… কখন বাজবে ঠিক নাই।', pickupLineBn: 'ঘড়িটা নিলাম। বাজিস না বাপ!',
  },
};

export function lootDef(id: LootId): LootDef {
  return LOOT[id];
}

export function soundRiskLabelBn(risk: number): string {
  return risk >= 0.65 ? 'বেশি' : risk >= 0.3 ? 'মাঝারি' : 'কম';
}

/** Score value of loot that escapes a house (money comes only from selling, Phase 3). */
export function lootScoreValue(id: LootId): number {
  return Math.round(LOOT[id].baseValue * 0.5);
}
