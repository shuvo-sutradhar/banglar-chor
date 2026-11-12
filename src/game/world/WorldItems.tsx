import { memo } from 'react';
import { useRunStore } from '../../state/useRunStore';
import { useGameRuntime } from '../GameRuntime';
import { LOOT } from '../data/loot';
import { pickUpWorldItem } from '../systems/pickup';
import type { WorldItem } from '../systems/inventory';
import { Interactable } from './Interactable';
import { LootMesh } from './LootMesh';

const WorldItemView = memo(function WorldItemView({ item }: { item: WorldItem }) {
  const runtime = useGameRuntime();
  const def = LOOT[item.lootId];
  const [x, y, z] = item.position;
  return (
    <>
      <group position={item.position} rotation={[0, item.dropped ? 0.7 : 0, 0]}>
        <LootMesh lootId={item.lootId} />
      </group>
      <Interactable
        id={`item:${item.instanceId}`}
        kind="pick_up"
        labelBn={def.nameBn}
        position={[x, y + 0.2, z]}
        groundY={y + 0.02}
        maxDistance={1.9}
        lootId={item.lootId}
        losTolerance={0.12}
        onInteract={() => pickUpWorldItem(runtime, item)}
      />
    </>
  );
});

/** Every loot item in the world (house interiors + anything the player dropped). */
export function WorldItems() {
  const items = useRunStore((s) => s.run?.worldItems);
  if (!items) return null;
  return (
    <>
      {items.map((item) => (
        <WorldItemView key={item.instanceId} item={item} />
      ))}
    </>
  );
}
