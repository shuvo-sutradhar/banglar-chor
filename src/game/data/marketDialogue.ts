import type { BarkId } from '../ai/npcBrain';
import type { LootId } from './loot';
import type { MerchantId } from './merchants';

/** Original Bangla market dialogue (README §10/§13). Every line is also shown as a subtitle. */
export const WATCHMAN_NAME = 'হাটের পাহারাদার বাবুল';

export const MERCHANT_GREETINGS: Record<MerchantId, readonly string[]> = {
  hashem: ['আসো বাবা, পিতল-কাঁসা যা আছে দেখাও। ঠকামু না।', 'সকাল সকাল কী নিয়া আসলা? দেখি দেখি।'],
  jalil: ['আরে ভাই! কী মাল আনছেন? রেডিও-টেডিও থাকলে দেখান!', 'জলিল ইলেকট্রনিক্সে স্বাগতম — পুরানা জিনিস, নতুন দাম!'],
  bokul: ['কী আনছ, তাড়াতাড়ি দেখাও — আমার হাতে সময় কম।', 'আসো আসো, ভালো জিনিস হইলে ভালো দাম দিমু।'],
};

/** Merchants calling out to passers-by (idle barks, only when the player is near). */
export const MERCHANT_CALLS: Record<MerchantId, readonly string[]> = {
  hashem: ['খাঁটি পিতল! খাঁটি কাঁসা!', 'হাঁড়ি-পাতিল-বদনা, সস্তায় পাবেন!'],
  jalil: ['রেডিও সারাই, ঘড়ি সারাই — পুরানা জিনিস কিনি!', 'ভাই, ঘড়ি লাগবে? এক্কেবারে সময়মতো বাজে!'],
  bokul: ['ডিম, কাপড়, মুরগি — সব আছে!', 'দাম কম, মাল ভালো — বকুলের দোকানে আসেন!'],
};

/** Merchant's verdict when he examines a specific item (comedy, by item). */
export const EXAMINE_LINES: Partial<Record<LootId, { merchant: string; thief?: string }>> = {
  lantern: { merchant: 'হারিকেনটা তো ভালোই… কাচটা একটু ঢিলা।' },
  'old-radio': { merchant: 'রেডিওটা গান গাইতে পারে?', thief: 'পারে মানে! নিজে নিজেই গায়!' },
  dentures: { merchant: 'নকল দাঁত কে কিনবে রে ভাই?', thief: 'কাস্টমার আছে, দাম কম দেন!' },
  'broken-torch': { merchant: 'এইটা তো জ্বলেই না! নষ্ট মাল।', thief: 'চাঁদনী রাতে জ্বলে, দিনে লজ্জা পায়!' },
  'fake-jewelry': { merchant: 'সোনার হার? দেখি দেখি…' },
  'actual-jewelry': { merchant: 'বাপরে! এ তো খাঁটি সোনা! কই পাইলা?', thief: 'নানির জিনিস, কাকা… বিপদে পড়ছি।' },
  chicken: { merchant: 'মুরগিটা তো তাজা! ডিম পাড়ে?', thief: 'রোজ দুইটা, শুক্রবারে তিনটা!' },
  'brass-pot': { merchant: 'পিতলের বদনা… ওজনটা ভালো।' },
  'metal-plate': { merchant: 'কাঁসার থালা! আগের দিনের জিনিস।' },
  'alarm-clock': { merchant: 'ঘড়িটা ঠিকমতো চলে তো?', thief: 'চলে মানে, দৌড়ায়!' },
};

export const DEFECT_LINES = {
  fake: 'এইটা তো পিতলের উপর সোনালি রং! দশ টাকাও বেশি।',
  broken: 'নষ্ট জিনিস, পার্টস ছাড়া আর কিছু নাই।',
  fooled: 'আহা! খাঁটি সোনা মনে হইতেছে… ভালো দাম দিমু!',
};

/** Recognition exchange (the example from the brief, plus variants). */
export const RECOGNITION_LINES: Partial<Record<LootId, string>> & { default: string } = {
  lantern: 'এই হারিকেনটা রহিম চাচার মতো লাগতেছে!',
  'brass-pot': 'এই বদনাটা তো রহিম চাচার! ওনার বদনায় একটা টোল খাওয়া দাগ আছে…',
  'old-radio': 'এই রেডিওটা তো রহিম চাচা রোজ সন্ধ্যায় বাজায়!',
  'actual-jewelry': 'এই গয়না তো রহিম চাচার বউয়ের! সারা গ্রাম চিনে!',
  'metal-plate': 'এই থালা তো রহিম চাচার বাড়িতে দেখছি মনে হয়…',
  default: 'এই জিনিস তো চেনা চেনা লাগে… কার জিনিস এইটা?',
};

export const EXCUSE_LINES = {
  thief: 'আরে কাকা, একই ডিজাইনের হাজারটা আছে!',
  merchantDoubt: 'তাই নাকি? রহিমরে ডাক দিই?',
  thiefOk: 'না না কাকা, এত কষ্ট করার দরকার নাই! দাম একটু কম দেন, তাতেই হবে।',
  merchantBelieves: 'আচ্ছা আচ্ছা, হাজারটা থাকতেই পারে… তবে দাম কম।',
  thiefFail: 'ইয়ে… মানে… আমার মামার… না, চাচার… ইয়ে…',
  merchantAngry: 'মিথ্যা বলস! দাঁড়া, পাহারাদার ডাকি!',
};

export const CONFRONT_LINES = ['চোর! চোর! রহিম চাচার মাল! পাহারাদার — ধরো ওরে!', 'চোরাই মাল বেচতে আসছস? বাবুল! ধর!'];

export const COUNTER_REPLIES = {
  agreed: 'ঠিক আছে, এই দামেই। খুশি?',
  halfway: 'এত না, মাঝামাঝি দিলাম।',
  improved: 'আচ্ছা, একটু বাড়াইলাম — আর না!',
  dropped: 'এত দাম চাইলি? যা, দাম আরও কমাইলাম!',
  suspicious: 'এত দাম? এমন দামি জিনিস কই পাইলা?',
  lastOffer: 'এইটাই শেষ কথা। নিলে নাও, না নিলে যাও।',
};

export const PERSUADE_LINES = ['আরেকটু বাড়ান কাকা, পেট চালামু কী দিয়া?', 'বাজারে এর চেয়ে ভালো মাল পাইবেন না!', 'আমার শেষ দাম, বিশ্বাস করেন!'];

export const RAHIM_MARKET_LINES = {
  notice: 'হুঁ? ওই হারিকেন-বদনা চেনা চেনা লাগে…',
  closer: 'দাঁড়াও তো! ওইটা আমার জিনিস না?',
  alarm: 'চোর! আমার জিনিস! বাবুল, ধরো ওরে!',
  calm: 'চোখের ভুল মনে হয়… চশমাটা আনা উচিত ছিল।',
  browsing: ['আলুর দাম আজকে এত কেন!', 'বকুল, ডিম কত কইরা?', 'হাশেম ভাই, একটা নতুন বদনা লাগবে — আমারটা কই যেন গেল!'],
};

export const WATCHMAN_BARKS: Record<BarkId, readonly string[]> = {
  'who-there': ['এই! কে ওখানে?', 'দাঁড়াও তো!'],
  heard: ['কী হইছে? কে চিল্লায়?', 'চোর কই? কোন দিকে?'],
  investigate: ['দেখি তো কোথায় গেল!', 'হাট থেকে পালাইতে দিমু না!'],
  alarm: ['ওই চোর! দাঁড়া!', 'পাইছি তোরে! থাম!'],
  lost: ['গেল কই? এই ভিড়ের মধ্যে…', 'হারাইয়া গেল!'],
  'give-up': ['পালাইছে… যাক, চোখ রাখমু।', 'আর দেখা পাইলে ছাড়মু না!'],
};

export const MARKET_CATCH_LINES = {
  watchman: 'পাইছি! চোরাই মাল বেচতে আসছস হাটে?',
  crowd: 'সব মাল ফেরত দে! টাকাও জরিমানা!',
  thief: 'ও মারে! আর জীবনে চুরি করমু না!',
};

export const DAWN_LINES = ['রাত শেষ! মোরগ ডাকে, আমি বাজারে যাই…', 'ঝোলাটা ঠিকঠাক — এবার হাটে গিয়া মাল বেচমু!', 'সাবধানে থাকতে হবে, কেউ যেন না চিনে!'];
