import type { GamePhase } from './runPhases';

export type ObjectiveInput = {
  phase: GamePhase;
  houseEntered: boolean;
  holeOpen: boolean;
  carrying: number;
  inventoryFull: boolean;
  dawnWarning: boolean;
  rahimAwake: boolean;
};

/** The single next objective shown in the HUD (GAME_DESIGN §1). */
export function currentObjective(s: ObjectiveInput): string {
  if (s.phase === 'chase') return 'চোখের আড়াল হও, নাহলে গ্রামের সীমানায় পালাও!';
  if (s.phase === 'entry') return 'ছন্দ মিলিয়ে চাপো — বেশি শব্দ কোরো না!';
  if (s.phase === 'interior') {
    if (s.rahimAwake) return 'রহিম চাচা জেগে গেছেন! এখনই সিঁধ দিয়ে বের হও!';
    if (s.inventoryFull) return 'ঝোলা ভরা — কিছু ফেলো, নয়তো বের হয়ে যাও';
    return s.carrying > 0 ? 'আরও নেবে, নাকি সিঁধ দিয়ে বের হবে?' : 'চুপিচুপি জিনিস তুলে নাও';
  }
  if (s.dawnWarning) return 'ভোর হয়ে আসছে! তাড়াতাড়ি গ্রামের সীমানায় ফেরো!';
  if (!s.houseEntered) {
    return s.holeOpen ? 'সিঁধ দিয়ে রহিম চাচার ঘরে ঢোকো' : 'রহিম চাচার মাটির ঘরের পেছনের দেয়ালে যাও';
  }
  return s.carrying > 0 ? 'মাল নিয়ে দক্ষিণে গ্রামের সীমানায় পালাও' : 'খালি হাতে? আবার ঢোকো, নয়তো সীমানায় ফেরো';
}
