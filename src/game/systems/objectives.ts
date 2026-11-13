import type { GamePhase } from './runPhases';

export type ObjectiveInput = {
  phase: GamePhase;
  houseEntered: boolean;
  holeOpen: boolean;
  carrying: number;
  inventoryFull: boolean;
  dawnWarning: boolean;
  rahimAwake: boolean;
  /** Phase 3 additions (optional so older callers still work). */
  zone?: 'village' | 'bazaar';
  money?: number;
  wanted?: boolean;
};

/** The single next objective shown in the HUD (GAME_DESIGN §1). */
export function currentObjective(s: ObjectiveInput): string {
  if (s.phase === 'preparation') return 'চুরির প্রস্তুতি শেষ করো';
  if (s.phase === 'dawn') return 'ভোর হচ্ছে — বাজারের পথে';
  if (s.zone === 'bazaar') {
    if (s.phase === 'chase') return 'পাহারাদারের হাত থেকে বাঁচো — চোখের আড়াল হও বা গেট দিয়ে পালাও!';
    if (s.phase === 'bargain') return 'দাম ঠিক করো — বেশি চাইলে সন্দেহ বাড়বে';
    if (s.wanted) return 'পাহারাদার খুঁজছে! গা ঢাকা দাও, নাহলে বাজার থেকে বের হয়ে যাও';
    if (s.carrying > 0) return 'দোকানির কাছে গিয়ে চুরি করা মাল বিক্রি করো';
    return 'বাজার থেকে বের হয়ে হিসাব শেষ করো (উত্তর বা দক্ষিণের গেট)';
  }
  if (s.phase === 'chase') return 'গ্রামবাসীর হাত থেকে বাঁচো! চোখের আড়াল হও, নাহলে সীমানায় পালাও';
  if (s.phase === 'entry') return 'ছন্দ মিলিয়ে চাপো — বেশি শব্দ কোরো না!';
  if (s.phase === 'interior') {
    if (s.rahimAwake) return 'রহিম চাচা জেগে গেছেন! এখনই সিঁধ দিয়ে বের হও!';
    if (s.inventoryFull) return 'ঝোলা ভরা — কিছু ফেলো, নয়তো বের হয়ে যাও';
    return s.carrying > 0 ? 'আরও নেবে, নাকি সিঁধ দিয়ে বের হবে?' : 'চুপিচুপি জিনিস তুলে নাও';
  }
  if (s.dawnWarning) return 'ভোর হয়ে আসছে! তাড়াতাড়ি গ্রামের সীমানায় ফেরো!';
  if (!s.houseEntered) {
    return s.holeOpen ? 'সিঁধ দিয়ে রহিম চাচার ঘরে ঢোকো' : 'একটা বাড়ি বেছে নাও — রহিম চাচার মাটির ঘরের পেছনের দেয়ালে যাও';
  }
  return s.carrying > 0 ? 'এবার নিরাপদে পালাও — দক্ষিণে গ্রামের সীমানায়' : 'খালি হাতে? আবার ঢোকো, নয়তো সীমানায় ফেরো';
}
