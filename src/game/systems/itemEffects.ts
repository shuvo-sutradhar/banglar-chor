import { createRng, type Rng } from '../../lib/rng';
import { useRunStore } from '../../state/useRunStore';
import type { GameRuntime } from '../GameRuntime';
import type { LootId } from '../data/loot';
import { THIEF_NAME } from '../data/dialogue';
import { audio } from '../audio/AudioManager';
import { say } from './nightActions';

/**
 * Carried-item comedy effects (README §8/§13) driven by the run's seeded SIMULATION RNG.
 * Fairness: every noisy surprise is telegraphed with a caption/sound at least 1.2 s before the
 * noise event fires, and dropping the item cancels a pending effect.
 */
type Pending = { instanceId: string; lootId: LootId; fireAt: number; kind: 'ring' | 'music' };

type EffectsState = {
  rng: Rng;
  seed: number;
  pending: Pending[];
  nextCluckAt: Map<string, number>;
  nextRattleAt: number;
  radioRolled: Set<string>;
  clockArmed: Map<string, number>;
};

let state: EffectsState | null = null;

function ensure(seed: number): EffectsState {
  if (!state || state.seed !== seed) {
    state = { rng: createRng(seed ^ 0x5eed), seed, pending: [], nextCluckAt: new Map(), nextRattleAt: 0, radioRolled: new Set(), clockArmed: new Map() };
  }
  return state;
}

export function resetItemEffects(): void {
  state = null;
}

const TELEGRAPH = 1.4;

export function onItemPickedUp(rt: GameRuntime, lootId: LootId): void {
  const run = useRunStore.getState().run;
  if (!run) return;
  const s = ensure(run.seed);
  const item = run.inventory.find((i) => i.lootId === lootId && !s.radioRolled.has(i.instanceId) && !s.clockArmed.has(i.instanceId) && !s.nextCluckAt.has(i.instanceId));
  if (!item) return;
  const now = rt.simTime;
  if (lootId === 'old-radio') {
    s.radioRolled.add(item.instanceId);
    if (s.rng.next() < 0.4) {
      say('রেডিওটা খরখর করতেছে… সর্বনাশ, বেজে উঠবে নাকি?!', THIEF_NAME);
      audio.play('rattle');
      s.pending.push({ instanceId: item.instanceId, lootId, fireAt: now + TELEGRAPH, kind: 'music' });
    }
  } else if (lootId === 'alarm-clock') {
    s.clockArmed.set(item.instanceId, now + s.rng.range(20, 55));
  } else if (lootId === 'chicken') {
    // The hen protests immediately, then every so often.
    cluck(rt);
    s.nextCluckAt.set(item.instanceId, now + s.rng.range(8, 14));
  }
}

function cluck(rt: GameRuntime): void {
  const p = rt.player.position;
  audio.play('cluck');
  say('কক্‌ কক্‌ কঁক্‌!', 'মুরগি');
  rt.noise.emit({ x: p.x, y: p.y, z: p.z, radius: 6, severity: 0.55, source: 'item', byPlayer: true }, rt.simTime);
}

/** Called each physics step while the night is live. */
export function stepItemEffects(rt: GameRuntime): void {
  const run = useRunStore.getState().run;
  if (!run || run.outcome) return;
  const s = ensure(run.seed);
  const now = rt.simTime;
  const carried = new Set(run.inventory.map((i) => i.instanceId));
  const p = rt.player.position;

  // Pending telegraphed effects
  for (let i = s.pending.length - 1; i >= 0; i--) {
    const e = s.pending[i]!;
    if (!carried.has(e.instanceId)) {
      s.pending.splice(i, 1);
      continue;
    }
    if (now < e.fireAt) continue;
    s.pending.splice(i, 1);
    if (e.kind === 'music') {
      audio.play('radio');
      say('♪ টুংটাং টুংটাং, রাত দুপুরে গান! ♪ — রেডিও বেজে উঠল!', 'রেডিও');
      rt.noise.emit({ x: p.x, y: p.y, z: p.z, radius: 11, severity: 0.85, source: 'item', byPlayer: true }, now);
    } else {
      audio.play('alarm-ring');
      say('ক্রিং ক্রিং ক্রিং! — ঘড়ির এলার্ম!', 'এলার্ম ঘড়ি');
      rt.noise.emit({ x: p.x, y: p.y, z: p.z, radius: 10, severity: 0.8, source: 'item', byPlayer: true }, now);
    }
  }

  for (const item of run.inventory) {
    if (item.lootId === 'chicken') {
      const at = s.nextCluckAt.get(item.instanceId);
      if (at === undefined) s.nextCluckAt.set(item.instanceId, now + s.rng.range(8, 14));
      else if (now >= at) {
        cluck(rt);
        s.nextCluckAt.set(item.instanceId, now + s.rng.range(9, 16));
      }
    } else if (item.lootId === 'alarm-clock') {
      const at = s.clockArmed.get(item.instanceId);
      if (at !== undefined && now >= at) {
        s.clockArmed.set(item.instanceId, Number.POSITIVE_INFINITY);
        if (s.rng.next() < 0.6) {
          audio.play('rattle');
          say('টিক টিক টিক… ঘড়িটা কাঁপতেছে! এখনই বাজবে!', THIEF_NAME);
          s.pending.push({ instanceId: item.instanceId, lootId: 'alarm-clock', fireAt: now + TELEGRAPH, kind: 'ring' });
        }
      }
    } else if (item.lootId === 'lantern' && rt.player.mode === 'run' && now >= s.nextRattleAt) {
      s.nextRattleAt = now + 0.7;
      audio.play('rattle');
      rt.noise.emit({ x: p.x, y: p.y, z: p.z, radius: 4.5, severity: 0.35, source: 'item', byPlayer: true }, now);
    }
  }
}
