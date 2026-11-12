import type { PlayerRuntime } from '../GameRuntime';
import { HumanRig } from './HumanRig';
import { THIEF_LOOK } from './appearances';

/**
 * Original low-poly thief: oiled shoulders, checked lungi, red gamcha round the neck,
 * green gamcha headband (after preparation) and a proud moustache.
 */
export function ThiefModel({ runtime }: { runtime: PlayerRuntime }) {
  return <HumanRig driver={runtime} look={THIEF_LOOK} />;
}
