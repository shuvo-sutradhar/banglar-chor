import { useAppStore } from '../../state/useAppStore';
import { useHudStore } from '../../state/useHudStore';
import { useRunStore } from '../../state/useRunStore';
import type { GameRuntime } from '../GameRuntime';
import { setAction } from '../characters/rigTypes';
import { CRAWL_INSIDE, CRAWL_MID, CRAWL_OUTSIDE, HEADING_INTO_HOUSE, HEADING_OUT_OF_HOUSE } from '../data/rahimHouse';
import { THIEF_NAME } from '../data/dialogue';
import { audio } from '../audio/AudioManager';
import { speakText } from '../audio/voice';

/** Seconds of sim time before a failed entry can be retried (GAME_DESIGN recovery path). */
export const ENTRY_RETRY_COOLDOWN = 6;
export const entryCooldown = { until: 0 };

/**
 * Cross-system night actions (crawl in/out, catch). Plain functions over the stores and the
 * mutable runtime, so 3D components and UI share one implementation.
 */
export function say(text: string, speaker?: string, at?: { x: number; z: number }): void {
  // Manifest dialogue lines are voiced and subtitled by the director (priority, cooldown, sync).
  if (speakText(text, at)) return;
  useHudStore.getState().showCaption(text, speaker);
}

export function crawlIntoRahimHouse(rt: GameRuntime): void {
  if (rt.player.script) return;
  const p = rt.player.position;
  rt.player.faceHeading = null;
  rt.player.script = {
    path: [[p.x, p.y, p.z], CRAWL_OUTSIDE, CRAWL_MID, CRAWL_INSIDE],
    duration: 1.9,
    t: 0,
    headingY: HEADING_INTO_HOUSE,
    action: 'crawl',
    onDone: () => {
      const app = useAppStore.getState();
      if (app.phase === 'entry' || app.phase === 'night' || app.phase === 'chase') app.goTo('interior');
      useRunStore.getState().markHouseEntered('rahim', rt.simTime);
      say('ঢুকে পড়লাম! এবার একদম চুপচাপ…', THIEF_NAME);
    },
  };
}

/**
 * Leave through the sidh. If the player is elsewhere in the room, a brief fade (UI) covers
 * re-positioning to the opening; the crawl itself is a visible scripted move.
 */
export function crawlOutOfRahimHouse(rt: GameRuntime, viaFade: boolean): void {
  if (rt.player.script || useAppStore.getState().phase !== 'interior') return;
  const p = rt.player.position;
  const start: [number, number, number] = viaFade ? CRAWL_INSIDE : [p.x, p.y, p.z];
  if (viaFade && rt.player.body) {
    rt.player.body.setTranslation({ x: CRAWL_INSIDE[0], y: CRAWL_INSIDE[1], z: CRAWL_INSIDE[2] }, true);
    rt.player.position.set(...CRAWL_INSIDE);
  }
  rt.player.script = {
    path: [start, CRAWL_INSIDE, CRAWL_MID, CRAWL_OUTSIDE],
    duration: 1.7,
    t: 0,
    headingY: HEADING_OUT_OF_HOUSE,
    action: 'crawl',
    onDone: () => {
      const app = useAppStore.getState();
      if (app.phase === 'interior') app.goTo('night');
      useRunStore.getState().markHouseExited('rahim', rt.simTime);
      useRunStore.getState().setRahimGrabIn(null);
      const n = useRunStore.getState().run?.inventory.length ?? 0;
      say(n > 0 ? 'বের হয়ে আসছি! এবার দক্ষিণে সীমানার দিকে…' : 'খালি হাতে বের হইলাম…', THIEF_NAME);
    },
  };
}

/** A catch ends the night (GAME_DESIGN §2): confiscation happens immediately and atomically. */
export function triggerCaught(rt: GameRuntime, outcome: 'caught' | 'dawn-caught' = 'caught', by: 'mojnu' | 'rahim' | 'dawn' = 'mojnu'): void {
  const app = useAppStore.getState();
  if (app.phase === 'caught' || app.phase === 'night-resolution') return;
  if (!['night', 'entry', 'interior', 'chase'].includes(app.phase)) return;
  rt.player.script = null;
  rt.player.faceHeading = null;
  setAction(rt.player, 'caught');
  useRunStore.getState().setCaughtBy(outcome === 'dawn-caught' ? 'dawn' : by);
  useRunStore.getState().resolve(outcome, rt.simTime, outcome === 'dawn-caught' ? 'dawn' : by);
  useRunStore.getState().setRahimGrabIn(null);
  audio.play('caught');
  app.goTo('caught');
}
