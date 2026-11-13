import { MARKET_RULES } from '../systems/market';
import { useRunStore } from '../../state/useRunStore';
import { inExitZone, LIGHT_POOLS, VILLAGE_NAV, VILLAGER_ROUTE } from '../ai/villageNav';
import { MOJNU_BARKS, MOJNU_NAME } from '../data/dialogue';
import { triggerCaught } from '../systems/nightActions';
import { MOJNU_LOOK, WATCHMAN_LOOK } from './appearances';
import { BAZAAR_NAV } from '../ai/bazaarNav';
import { inBazaarExit, WATCHMAN_ROUTE } from '../world/bazaarLayout';
import { WATCHMAN_BARKS, WATCHMAN_NAME } from '../data/marketDialogue';
import { triggerMarketCaught } from '../systems/marketActions';
import type { PatrolNpcConfig } from './PatrolNpc';

/** মজনু মিয়া — the village night patrol (Phase 2 behaviour, unchanged). */
export const MOJNU_CONFIG: PatrolNpcConfig = {
  id: 'mojnu',
  nameBn: MOJNU_NAME,
  look: MOJNU_LOOK,
  route: VILLAGER_ROUTE,
  nav: VILLAGE_NAV,
  lights: LIGHT_POOLS,
  isSafe: inExitZone,
  barks: MOJNU_BARKS,
  onAlerted: (rt) => useRunStore.getState().recordDetection(rt.simTime, 'mojnu'),
  onCaught: (rt) => triggerCaught(rt, 'caught', 'mojnu'),
};

/**
 * হাটের পাহারাদার — strolls the market lanes. He only builds suspicion from sight (and only
 * reacts to noise) after an alarm makes the player 'wanted'; the gates are safe exits.
 */
export const WATCHMAN_CONFIG: PatrolNpcConfig = {
  id: 'watchman',
  nameBn: WATCHMAN_NAME,
  look: WATCHMAN_LOOK,
  route: WATCHMAN_ROUTE,
  nav: BAZAAR_NAV,
  lights: [],
  isSafe: (p) => inBazaarExit(p) !== null,
  barks: WATCHMAN_BARKS,
  sightEnabled: () => useRunStore.getState().wanted,
  hearingFilter: (e) => e.source === 'alarm' || useRunStore.getState().wanted,
  onAlerted: (rt) => useRunStore.getState().recordMarket('market-chase', rt.simTime, 'watchman'),
  onCaught: (rt) => triggerMarketCaught(rt),
  /**
   * Older man with a lathi in a crowd: slower than the village patrol (D-037), so a thief who
   * bolts for a gate at once with a light ঝোলা gets away, while a heavily loaded one is caught.
   */
  runSpeed: MARKET_RULES.watchmanRunSpeed,
};
