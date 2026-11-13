/**
 * The comic catch, as one synchronised cue list (docs/AUDIO_DIRECTION.md §6). Times match the
 * 3D vignette in CaughtScene.tsx: the sandal flies off at 0 s (peak ≈ 0.45 s), the dust cloud
 * puffs at 0 s and again at 2.6 s, neighbours run in from 0.6 s to ≈ 2.4 s. No injuries: the
 * sounds are cartoon (slide whistle, boing, poof, wah-wah).
 *
 * Pure: builds the list; CaughtOverlay plays it (subtitles + voice director + SFX group 'catch'),
 * and skipping stops the whole group at once.
 */
import type { SoundId } from './AudioManager';
import { CATCH_LINES, MOJNU_NAME, RAHIM_NAME, THIEF_NAME } from '../data/dialogue';
import { MARKET_CATCH_LINES, WATCHMAN_NAME } from '../data/marketDialogue';
import type { LootId } from '../data/loot';

export type CatchCue =
  | { at: number; kind: 'line'; lineId: string; speaker: string; text: string }
  | { at: number; kind: 'sfx'; sound: SoundId; gain?: number };

export type CatchContext = {
  zone: 'village' | 'bazaar';
  caughtBy: 'mojnu' | 'rahim' | 'dawn' | 'watchman' | null;
  dawn: boolean;
  rough: boolean;
  /** Loot confiscated (drives the punchline). */
  confiscated: readonly LootId[];
  seed: number;
};

export const CATCH_DURATION = 6.4;
export const CATCH_SKIP_AFTER = 1.2;

const SPECIAL: readonly LootId[] = ['actual-jewelry', 'dentures', 'chicken', 'old-radio', 'alarm-clock'];

export function buildCatchSequence(c: CatchContext): CatchCue[] {
  const sfx: CatchCue[] = [
    { at: 0, kind: 'sfx', sound: 'slide-whistle' },
    { at: 0.05, kind: 'sfx', sound: 'dust-poof' },
    { at: 0.45, kind: 'sfx', sound: 'boing', gain: 0.8 },
    { at: 0.6, kind: 'sfx', sound: 'run-steps' },
    { at: 1.6, kind: 'sfx', sound: 'run-steps', gain: 0.8 },
    { at: 2.6, kind: 'sfx', sound: 'dust-poof', gain: 0.8 },
    { at: 3.15, kind: 'sfx', sound: 'pant', gain: 0.7 },
    { at: 5.3, kind: 'sfx', sound: 'wah-wah' },
  ];
  if (c.zone === 'bazaar') {
    const market: CatchCue[] = [
      ...sfx,
      { at: 0.1, kind: 'line', lineId: 'watchman.catch', speaker: WATCHMAN_NAME, text: MARKET_CATCH_LINES.watchman },
      { at: 1.3, kind: 'line', lineId: 'villager.market-crowd', speaker: 'হাটের লোকজন', text: MARKET_CATCH_LINES.crowd },
      { at: 2.6, kind: 'line', lineId: 'thief.market-caught', speaker: THIEF_NAME, text: MARKET_CATCH_LINES.thief },
      { at: 4.0, kind: 'line', lineId: 'watchman.fine', speaker: WATCHMAN_NAME, text: 'মাল সব বাজেয়াপ্ত, অর্ধেক টাকা জরিমানা! যা, ভাগ!' },
    ];
    return market.sort((a, b) => a.at - b.at);
  }
  const p = CATCH_LINES.punchlines;
  const special = SPECIAL.find((id) => c.confiscated.includes(id)) as keyof typeof p | undefined;
  const punchKey = c.confiscated.length === 0 ? 'empty' : special ?? null;
  const punch = punchKey ? (p[punchKey] as string) : p.other[c.seed % p.other.length]!;
  const punchId = punchKey ? `villager.punch.${punchKey}` : `villager.punch.other.${c.seed % p.other.length}`;
  const opener: CatchCue = c.dawn
    ? { at: 0.1, kind: 'line', lineId: 'villager.dawn', speaker: 'গ্রামবাসী', text: 'ভোর হয়ে গেছে — চোর এখনো গ্রামে!' }
    : c.caughtBy === 'rahim'
      ? { at: 0.1, kind: 'line', lineId: 'rahim.wake.0', speaker: RAHIM_NAME, text: 'চোর! চোর! আমার ঘরে চোর! কে আছ, আসো!' }
      : { at: 0.1, kind: 'line', lineId: 'villager.chor', speaker: MOJNU_NAME, text: CATCH_LINES.mojnu };
  const night: CatchCue[] = [
    ...sfx,
    opener,
    { at: 1.2, kind: 'line', lineId: 'villager.catch.a', speaker: 'প্রতিবেশী', text: c.rough ? CATCH_LINES.roughA : CATCH_LINES.familyA },
    { at: 2.1, kind: 'line', lineId: 'villager.catch.b', speaker: 'আরেক প্রতিবেশী', text: c.rough ? CATCH_LINES.roughB : CATCH_LINES.familyB },
    { at: 3.1, kind: 'line', lineId: 'thief.caught.full', speaker: THIEF_NAME, text: CATCH_LINES.thief },
    { at: 4.3, kind: 'line', lineId: punchId, speaker: c.caughtBy === 'rahim' ? RAHIM_NAME : MOJNU_NAME, text: punch },
  ];
  return night.sort((a, b) => a.at - b.at);
}
