/**
 * Voice line manifest (docs/AUDIO_DIRECTION.md §4). Every spoken line has a stable id, a
 * character, the Bangla subtitle, an emotion for the actor, a playback priority and cooldown, and
 * the audio file it will play once recorded (public/assets/audio/voice/<character>/<id>.ogg).
 *
 * Built from the existing dialogue tables, so the game's text and the recording script can never
 * drift apart. `npm run voice:script` regenerates docs/VOICE_RECORDING_SCRIPT.md from this file.
 */
import { CATCH_LINES, ENTRY_LINES, MOJNU_BARKS, PREP_LINES, RAHIM_LINES } from '../data/dialogue';
import { CONFRONT_LINES, EXCUSE_LINES, MARKET_CATCH_LINES, MERCHANT_CALLS, MERCHANT_GREETINGS, PERSUADE_LINES, RAHIM_MARKET_LINES, RECOGNITION_LINES, WATCHMAN_BARKS } from '../data/marketDialogue';
import { MERCHANTS, type MerchantId } from '../data/merchants';
import type { BarkId } from '../ai/npcBrain';

export type CharacterId = 'thief' | 'rahim' | 'mojnu' | 'villager' | 'neighbour' | 'merchant-hashem' | 'merchant-jalil' | 'merchant-bokul' | 'watchman';

export type Emotion = 'sly' | 'cheerful' | 'proud' | 'scared' | 'panicked' | 'tired' | 'sleepy' | 'suspicious' | 'angry' | 'alarmed' | 'haggling' | 'friendly' | 'pleading' | 'relieved';

/** 3 = must be heard (alarms, catches), 2 = warnings / key reactions, 1 = flavour, 0 = background chatter. */
export type Priority = 0 | 1 | 2 | 3;

export type VoiceLine = {
  id: string;
  character: CharacterId;
  /** Family-friendly subtitle (always available). */
  text: string;
  /** Rough village alternative, used only when the player enables rough dialogue. */
  roughText?: string;
  emotion: Emotion;
  priority: Priority;
  /** Seconds before this same line may play again. */
  cooldown: number;
  /** Spoken from the character's position in the world (NPCs) rather than "in the head". */
  positional: boolean;
  /** Gameplay-critical info: its subtitle is always shown even if its audio is suppressed. */
  info?: boolean;
};

export const CHARACTER_NAMES: Record<CharacterId, string> = {
  thief: 'চোর',
  rahim: 'রহিম চাচা',
  mojnu: 'মজনু মিয়া',
  villager: 'গ্রামবাসী',
  neighbour: 'প্রতিবেশী',
  'merchant-hashem': MERCHANTS.hashem.nameBn,
  'merchant-jalil': MERCHANTS.jalil.nameBn,
  'merchant-bokul': MERCHANTS.bokul.nameBn,
  watchman: 'পাহারাদার বাবুল',
};

/** Voice direction per character, for the casting/recording sheet. */
export const CHARACTER_DIRECTION: Record<CharacterId, string> = {
  thief: 'Adult man, 30s, rural Dhaka/Mymensingh dialect. Quick, sly, self-satisfied; collapses into comic panic when caught. Never menacing.',
  rahim: 'Elderly man, 60s, sleepy and gruff; grumbles, then outraged when he finds a thief. Warm underneath.',
  mojnu: 'Village night-watch volunteer, 40s. Nosy, jumpy, loud when alarmed, quickly bored when nothing happens.',
  villager: 'Mixed adult voices (men and women) of neighbours woken up: excited, indignant, a little gleeful.',
  neighbour: 'Adult neighbour, comic indignation.',
  'merchant-hashem': 'Brass-and-bell-metal trader, 50s, polite, slow, shrewd.',
  'merchant-jalil': 'Electronics repairman, 30s, fast-talking salesman.',
  'merchant-bokul': 'General goods seller, 40s, impatient, sharp-eyed.',
  watchman: 'Market watchman, 50s, carries a lathi; slow, booming, self-important.',
};

const lines: VoiceLine[] = [];
const byId = new Map<string, VoiceLine>();
const byText = new Map<string, VoiceLine>();

function add(line: Omit<VoiceLine, 'positional' | 'cooldown'> & Partial<Pick<VoiceLine, 'positional' | 'cooldown'>>): void {
  const full: VoiceLine = { cooldown: 4, positional: line.character !== 'thief', ...line };
  if (byId.has(full.id)) throw new Error(`Duplicate voice line id ${full.id}`);
  lines.push(full);
  byId.set(full.id, full);
  if (!byText.has(full.text)) byText.set(full.text, full);
  if (full.roughText && !byText.has(full.roughText)) byText.set(full.roughText, full);
}

const BARK_META: Record<BarkId, { emotion: Emotion; priority: Priority; cooldown: number }> = {
  'who-there': { emotion: 'suspicious', priority: 2, cooldown: 5 },
  heard: { emotion: 'suspicious', priority: 2, cooldown: 5 },
  investigate: { emotion: 'suspicious', priority: 2, cooldown: 5 },
  alarm: { emotion: 'alarmed', priority: 3, cooldown: 3 },
  lost: { emotion: 'suspicious', priority: 1, cooldown: 6 },
  'give-up': { emotion: 'relieved', priority: 1, cooldown: 8 },
};

// ---- Thief: the brief's signature lines + existing ritual/entry lines
add({ id: 'thief.night.start', character: 'thief', text: 'আইজকা দেখি কপালে কী আছে!', emotion: 'sly', priority: 1 });
add({ id: 'thief.caught.cry', character: 'thief', text: 'ও মারে! ও বাবারে!', emotion: 'panicked', priority: 3, cooldown: 2 });
add({ id: 'thief.caught.promise', character: 'thief', text: 'আর করমু না!', emotion: 'pleading', priority: 3, cooldown: 2 });
add({ id: 'thief.caught.full', character: 'thief', text: CATCH_LINES.thief, emotion: 'panicked', priority: 3, cooldown: 2 });
add({ id: 'thief.prep.intro', character: 'thief', text: PREP_LINES.intro, emotion: 'sly', priority: 1 });
PREP_LINES.oilHit.forEach((t, i) => add({ id: `thief.prep.oil-hit.${i}`, character: 'thief', text: t, emotion: 'proud', priority: 1, cooldown: 1 }));
PREP_LINES.oilMiss.forEach((t, i) => add({ id: `thief.prep.oil-miss.${i}`, character: 'thief', text: t, emotion: 'scared', priority: 1, cooldown: 1 }));
add({ id: 'thief.prep.oil-auto', character: 'thief', text: PREP_LINES.oilAuto, emotion: 'cheerful', priority: 1, cooldown: 1 });
add({ id: 'thief.prep.tuck-ok', character: 'thief', text: PREP_LINES.tuckOk, emotion: 'proud', priority: 1, cooldown: 1 });
add({ id: 'thief.prep.tuck-loose', character: 'thief', text: PREP_LINES.tuckLoose, emotion: 'scared', priority: 1, cooldown: 1 });
add({ id: 'thief.prep.tuck-tight', character: 'thief', text: PREP_LINES.tuckTight, emotion: 'scared', priority: 1, cooldown: 1 });
add({ id: 'thief.prep.tuck-auto', character: 'thief', text: PREP_LINES.tuckAuto, emotion: 'cheerful', priority: 1, cooldown: 1 });
add({ id: 'thief.prep.gamcha-ok', character: 'thief', text: PREP_LINES.gamchaOk, emotion: 'proud', priority: 1, cooldown: 1 });
add({ id: 'thief.prep.gamcha-miss', character: 'thief', text: PREP_LINES.gamchaMiss, emotion: 'scared', priority: 1, cooldown: 1 });
add({ id: 'thief.prep.gamcha-auto', character: 'thief', text: PREP_LINES.gamchaAuto, emotion: 'cheerful', priority: 1, cooldown: 1 });
add({ id: 'thief.prep.done', character: 'thief', text: PREP_LINES.done, emotion: 'proud', priority: 1 });
add({ id: 'thief.entry.success', character: 'thief', text: ENTRY_LINES.success, emotion: 'sly', priority: 2, cooldown: 2 });
add({ id: 'thief.entry.fail', character: 'thief', text: ENTRY_LINES.fail, emotion: 'scared', priority: 2, cooldown: 2 });
add({ id: 'thief.entry.cooldown', character: 'thief', text: ENTRY_LINES.cooldown, emotion: 'tired', priority: 2, cooldown: 2, info: true });
add({ id: 'thief.entry.no-chase', character: 'thief', text: ENTRY_LINES.noChase, emotion: 'panicked', priority: 2, cooldown: 2, info: true });
add({ id: 'thief.tool.tired', character: 'thief', text: 'হাঁপাই গেলাম… একটু জিরাই।', emotion: 'tired', priority: 1, cooldown: 8 });
add({ id: 'thief.tool.rest', character: 'thief', text: 'দম নিই, একটু দম নিই…', emotion: 'tired', priority: 1, cooldown: 6 });
add({ id: 'thief.tool.clang', character: 'thief', text: 'উফ! ঠন করে বাজল — চুপ, চুপ!', emotion: 'scared', priority: 2, cooldown: 4 });
add({ id: 'thief.sprint.out', character: 'thief', text: 'আর দৌড়াইতে পারি না… দম শেষ!', emotion: 'tired', priority: 1, cooldown: 12 });
add({ id: 'thief.eat.yum', character: 'thief', text: 'আহা! পেট ঠান্ডা, মন ঠান্ডা!', emotion: 'cheerful', priority: 1, cooldown: 3 });
add({ id: 'thief.eat.fish', character: 'thief', text: 'মাছে-ভাতে বাঙালি — আইজকা গায়ে জোর আইছে!', emotion: 'proud', priority: 1, cooldown: 3 });
add({ id: 'thief.eat.tea', character: 'thief', text: 'এক কাপ চা না খাইলে চোখ খোলে না!', emotion: 'cheerful', priority: 1, cooldown: 3 });
add({ id: 'thief.eat.free', character: 'thief', text: 'পান্তা ভাত আর কাঁচা মরিচ — গরিবের রাজভোগ!', emotion: 'cheerful', priority: 1, cooldown: 3 });
add({ id: 'thief.rest.nap', character: 'thief', text: 'একটু ঘুমাই নিই… রাতে আবার কাম আছে।', emotion: 'sleepy', priority: 1, cooldown: 3 });
add({ id: 'thief.shop.bought', character: 'thief', text: 'নতুন জিনিস! আইজকা রাতে দেখামু খেলা!', emotion: 'proud', priority: 1, cooldown: 3 });
add({ id: 'thief.shop.broke', character: 'thief', text: 'পকেট তো ফাঁকা… আগে কিছু কামাই করি।', emotion: 'tired', priority: 1, cooldown: 3, info: true });
add({ id: 'thief.dog.hush', character: 'thief', text: 'চুপ কর রে কুত্তা, চুপ!', emotion: 'scared', priority: 2, cooldown: 8 });

// ---- Rahim (asleep at night / shopping in the bazaar)
RAHIM_LINES.snore.forEach((t, i) => add({ id: `rahim.snore.${i}`, character: 'rahim', text: t, emotion: 'sleepy', priority: 0, cooldown: 6 }));
RAHIM_LINES.stir.forEach((t, i) => add({ id: `rahim.stir.${i}`, character: 'rahim', text: t, emotion: 'sleepy', priority: 2, cooldown: 4 }));
RAHIM_LINES.settle.forEach((t, i) => add({ id: `rahim.settle.${i}`, character: 'rahim', text: t, emotion: 'sleepy', priority: 1, cooldown: 4 }));
RAHIM_LINES.wake.forEach((t, i) => add({ id: `rahim.wake.${i}`, character: 'rahim', text: t, emotion: 'alarmed', priority: 3, cooldown: 2 }));
add({ id: 'rahim.grab', character: 'rahim', text: RAHIM_LINES.grab[0], emotion: 'angry', priority: 3, cooldown: 2 });
add({ id: 'rahim.market.notice', character: 'rahim', text: RAHIM_MARKET_LINES.notice, emotion: 'suspicious', priority: 2 });
add({ id: 'rahim.market.closer', character: 'rahim', text: RAHIM_MARKET_LINES.closer, emotion: 'suspicious', priority: 2 });
add({ id: 'rahim.market.alarm', character: 'rahim', text: RAHIM_MARKET_LINES.alarm, emotion: 'alarmed', priority: 3, cooldown: 2 });
add({ id: 'rahim.market.calm', character: 'rahim', text: RAHIM_MARKET_LINES.calm, emotion: 'relieved', priority: 1 });
RAHIM_MARKET_LINES.browsing.forEach((t, i) => add({ id: `rahim.market.browse.${i}`, character: 'rahim', text: t, emotion: 'friendly', priority: 0, cooldown: 10 }));

// ---- Mojnu (night patrol) and the market watchman: perception barks
(Object.keys(MOJNU_BARKS) as BarkId[]).forEach((b) => MOJNU_BARKS[b].forEach((t, i) => add({ id: `mojnu.${b}.${i}`, character: 'mojnu', text: t, ...BARK_META[b] })));
(Object.keys(WATCHMAN_BARKS) as BarkId[]).forEach((b) => WATCHMAN_BARKS[b].forEach((t, i) => add({ id: `watchman.${b}.${i}`, character: 'watchman', text: t, ...BARK_META[b] })));

// ---- Villagers: the chase / catch crowd (brief's lines + catch scene)
add({ id: 'villager.chor', character: 'villager', text: 'চোর! চোর!', emotion: 'alarmed', priority: 3, cooldown: 3 });
add({ id: 'villager.dhor', character: 'villager', text: 'ধর ধর, পালাইতেছে!', emotion: 'alarmed', priority: 3, cooldown: 3 });
add({ id: 'villager.oi', character: 'villager', text: 'ওই ব্যাডা কই যায়!', emotion: 'angry', priority: 2, cooldown: 4 });
add({ id: 'villager.catch.a', character: 'neighbour', text: CATCH_LINES.familyA, roughText: CATCH_LINES.roughA, emotion: 'angry', priority: 3, cooldown: 2 });
add({ id: 'villager.catch.b', character: 'neighbour', text: CATCH_LINES.familyB, roughText: CATCH_LINES.roughB, emotion: 'angry', priority: 3, cooldown: 2 });
add({ id: 'villager.dawn', character: 'villager', text: 'ভোর হয়ে গেছে — চোর এখনো গ্রামে!', emotion: 'alarmed', priority: 3, cooldown: 2 });
add({ id: 'villager.memory', character: 'villager', text: 'কাইলকা রাইতে নাকি চোর আইছিল — আইজ সবাই সজাগ থাকো!', emotion: 'suspicious', priority: 1, cooldown: 30 });
Object.entries(CATCH_LINES.punchlines).forEach(([k, v]) => {
  if (typeof v === 'string') add({ id: `villager.punch.${k}`, character: 'villager', text: v, emotion: 'cheerful', priority: 2, cooldown: 2 });
  else v.forEach((t, i) => add({ id: `villager.punch.other.${i}`, character: 'villager', text: t, emotion: 'angry', priority: 2, cooldown: 2 }));
});

// ---- Merchants (brief's lines + greetings/calls/recognition/haggling)
const MERCHANT_CHAR: Record<MerchantId, CharacterId> = { hashem: 'merchant-hashem', jalil: 'merchant-jalil', bokul: 'merchant-bokul' };
add({ id: 'merchant.where', character: 'merchant-bokul', text: 'এই মাল কই পাইছেন?', emotion: 'suspicious', priority: 2 });
add({ id: 'merchant.lower', character: 'merchant-hashem', text: 'দাম আরেকটু কমান!', emotion: 'haggling', priority: 1 });
add({ id: 'merchant.familiar', character: 'merchant-jalil', text: 'এইডা তো চেনা চেনা লাগে!', emotion: 'suspicious', priority: 2 });
(Object.keys(MERCHANT_GREETINGS) as MerchantId[]).forEach((m) => MERCHANT_GREETINGS[m].forEach((t, i) => add({ id: `${MERCHANT_CHAR[m]}.greet.${i}`, character: MERCHANT_CHAR[m], text: t, emotion: 'friendly', priority: 1 })));
(Object.keys(MERCHANT_CALLS) as MerchantId[]).forEach((m) => MERCHANT_CALLS[m].forEach((t, i) => add({ id: `${MERCHANT_CHAR[m]}.call.${i}`, character: MERCHANT_CHAR[m], text: t, emotion: 'cheerful', priority: 0, cooldown: 12 })));
Object.entries(RECOGNITION_LINES).forEach(([k, t]) => add({ id: `merchant.recognise.${k}`, character: 'merchant-hashem', text: t as string, emotion: 'suspicious', priority: 2 }));
CONFRONT_LINES.forEach((t, i) => add({ id: `merchant.confront.${i}`, character: 'merchant-bokul', text: t, emotion: 'alarmed', priority: 3, cooldown: 2 }));
add({ id: 'thief.excuse', character: 'thief', text: EXCUSE_LINES.thief, emotion: 'sly', priority: 2, cooldown: 2 });
add({ id: 'thief.excuse-fail', character: 'thief', text: EXCUSE_LINES.thiefFail, emotion: 'scared', priority: 2, cooldown: 2 });
add({ id: 'thief.excuse-ok', character: 'thief', text: EXCUSE_LINES.thiefOk, emotion: 'sly', priority: 2, cooldown: 2 });
PERSUADE_LINES.forEach((t, i) => add({ id: `thief.persuade.${i}`, character: 'thief', text: t, emotion: 'haggling', priority: 2, cooldown: 2 }));
add({ id: 'watchman.fine', character: 'watchman', text: 'মাল সব বাজেয়াপ্ত, অর্ধেক টাকা জরিমানা! যা, ভাগ!', emotion: 'angry', priority: 3, cooldown: 2 });
add({ id: 'watchman.catch', character: 'watchman', text: MARKET_CATCH_LINES.watchman, emotion: 'angry', priority: 3, cooldown: 2 });
add({ id: 'villager.market-crowd', character: 'villager', text: MARKET_CATCH_LINES.crowd, emotion: 'angry', priority: 3, cooldown: 2 });
add({ id: 'thief.market-caught', character: 'thief', text: MARKET_CATCH_LINES.thief, emotion: 'panicked', priority: 3, cooldown: 2 });

export const VOICE_LINES: readonly VoiceLine[] = lines;

export function voiceLine(id: string): VoiceLine | undefined {
  return byId.get(id);
}

/** Exact-text lookup: lets existing `say(text)` calls voice themselves without new ids. */
export function voiceLineForText(text: string): VoiceLine | undefined {
  return byText.get(text);
}

/** Subtitle for the current dialogue setting (rough variant only when enabled). */
export function lineText(line: VoiceLine, rough: boolean): string {
  return rough && line.roughText ? line.roughText : line.text;
}

/** Where the recorded file for a line lives (relative to the site base). */
export function voiceFile(line: Pick<VoiceLine, 'id' | 'character'>, rough = false): string {
  return `assets/audio/voice/${line.character}/${line.id}${rough ? '.rough' : ''}.ogg`;
}
