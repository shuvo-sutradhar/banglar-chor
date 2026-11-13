import { useAppStore } from '../../state/useAppStore';
import { useRunStore } from '../../state/useRunStore';
import type { GameRuntime } from '../GameRuntime';
import { setAction } from '../characters/rigTypes';
import { MERCHANTS, type MerchantId } from '../data/merchants';
import { STALLS, stallKeeperSpot } from '../world/bazaarLayout';
import { audio } from '../audio/AudioManager';
import { say } from './nightActions';

/**
 * Market-side actions shared by 3D components and UI (TradingSystem / MarketChase glue).
 * All state changes go through the run/app stores (pure transitions underneath).
 */
export function merchantSpot(id: MerchantId) {
  const s = STALLS.find((x) => x.merchant === id);
  if (!s) throw new Error(`No stall for ${id}`);
  return stallKeeperSpot(s);
}

export function openTrade(rt: GameRuntime, id: MerchantId): void {
  const app = useAppStore.getState();
  if (app.phase !== 'bazaar') return;
  const run = useRunStore.getState().run;
  const state = run?.market?.merchants[id];
  if (!run?.market || !state) return;
  if (state.closed) {
    say('তোর সাথে আর কোনো কারবার নাই! ভাগ এখান থেকে!', MERCHANTS[id].nameBn);
    return;
  }
  if (useRunStore.getState().wanted) {
    say('এখন না! পাহারাদার চোর খুঁজতেছে, পরে আসো।', MERCHANTS[id].nameBn);
    return;
  }
  const spot = merchantSpot(id);
  const p = rt.player.position;
  // Face the merchant; the camera frames the conversation over the thief's shoulder.
  const heading = Math.atan2(spot.x - p.x, spot.z - p.z);
  rt.player.faceHeading = heading;
  rt.camera.focusYaw = heading + Math.PI + 0.75;
  useRunStore.getState().setInventoryOpen(false);
  useRunStore.getState().setActiveMerchant(id);
  app.goTo('bargain');
}

export function closeTrade(rt: GameRuntime): void {
  useRunStore.getState().setActiveMerchant(null);
  rt.player.faceHeading = null;
  rt.camera.focusYaw = null;
  const app = useAppStore.getState();
  if (app.phase === 'bargain') app.goTo('bazaar');
}

/**
 * Recognition escalated: shout, make the watchman hunt (sight enabled), emit a real alarm noise
 * he can hear, and drop out of any open trade. The chase itself starts only when he SEES you.
 */
export function raiseMarketAlarm(rt: GameRuntime, by: string, line: string): void {
  const store = useRunStore.getState();
  if (store.run?.market?.outcome) return;
  closeTrade(rt);
  store.setWanted(true);
  store.recordMarket('market-alarm', rt.simTime, by);
  say(line, by);
  audio.play('shout');
  audio.play('alert');
  const p = rt.player.position;
  rt.noise.emit({ x: p.x, y: p.y, z: p.z, radius: 45, severity: 1, source: 'alarm', byPlayer: false }, rt.simTime);
  setAction(rt.player, 'frightened');
  window.setTimeout(() => {
    if (rt.player.action === 'frightened') setAction(rt.player, null);
  }, 900);
}

/** Caught at the market: unsold items confiscated, half the money fined, run ends (D-035). */
export function triggerMarketCaught(rt: GameRuntime): void {
  const app = useAppStore.getState();
  if (app.phase === 'caught' || app.phase === 'results') return;
  rt.player.faceHeading = null;
  rt.camera.focusYaw = null;
  setAction(rt.player, 'caught');
  const store = useRunStore.getState();
  store.setActiveMerchant(null);
  store.setCaughtBy('watchman');
  store.finishMarket('caught', rt.simTime);
  store.setWanted(false);
  audio.play('caught');
  app.goTo('caught');
}

/** Leaving through a gate. During a chase this counts as escaping the market. */
export function leaveMarket(rt: GameRuntime, escaping: boolean): void {
  const store = useRunStore.getState();
  if (store.run?.market?.outcome) return;
  store.finishMarket(escaping ? 'escaped' : 'completed', rt.simTime);
  store.setWanted(false);
  useAppStore.getState().showResults();
}
