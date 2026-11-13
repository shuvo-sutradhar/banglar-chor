import { useRunStore } from '../../state/useRunStore';
import type { GameRuntime } from '../GameRuntime';
import { LOOT, type LootId } from '../data/loot';
import { THIEF_NAME } from '../data/dialogue';
import { setAction } from '../characters/rigTypes';
import { audio } from '../audio/AudioManager';
import { say } from './nightActions';
import { onItemPickedUp } from './itemEffects';
import type { WorldItem } from './inventory';
import { PICKUP_SOUND } from '../audio/surfaces';

const LOAD_CUE_LINES: Record<string, string> = {
  '0.6': 'ভালোই ভারী হইছে… দৌড়াইতে কষ্ট হবে।',
  '0.85': 'কোমর গেল রে! এই বোঝা নিয়া পালামু ক্যামনে?',
  '1': 'ঝোলা ভরা! আর একটাও না!',
};

export function pickUpWorldItem(rt: GameRuntime, item: WorldItem): void {
  const def = LOOT[item.lootId];
  const res = useRunStore.getState().pickup(item.instanceId, rt.simTime);
  if (!res.ok) {
    if (res.reason === 'over-capacity') {
      say('ঝোলায় আর জায়গা নাই! আগে কিছু ফেলো (ঝোলা খুলে "ফেলে দাও")।', THIEF_NAME);
      useRunStore.getState().setInventoryOpen(true);
    }
    return;
  }
  setAction(rt.player, 'pickup');
  audio.play('pickup', { gain: 0.6 });
  audio.play(PICKUP_SOUND[def.category], { at: { x: item.position[0], z: item.position[2] } });
  // Picking things up is not silent; risky items make more noise.
  const [x, y, z] = item.position;
  rt.noise.emit({ x, y, z, radius: 1.5 + 3 * def.soundRisk, severity: 0.15 + 0.3 * def.soundRisk, source: 'pickup', byPlayer: true }, rt.simTime);
  say(res.cue !== null ? `${def.pickupLineBn} ${LOAD_CUE_LINES[String(res.cue)] ?? ''}` : def.pickupLineBn, THIEF_NAME);
  onItemPickedUp(rt, item.lootId as LootId);
}
