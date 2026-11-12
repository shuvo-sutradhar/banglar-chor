import { memo } from 'react';
import { useHudStore } from '../../state/useHudStore';
import { INSPECTABLES, type InspectableDef } from '../data/inspectables';
import { Buildings } from './Buildings';
import { Interactable } from './Interactable';
import { Terrain } from './Terrain';
import { Vegetation } from './Vegetation';

const inspectCounts = new Map<string, number>();

function inspect(def: InspectableDef) {
  const n = inspectCounts.get(def.id) ?? 0;
  inspectCounts.set(def.id, n + 1);
  const line = def.linesBn[n % def.linesBn.length] ?? def.labelBn;
  useHudStore.getState().showCaption(line, def.speakerBn);
}

/** Static village: terrain, buildings, vegetation (all colliders are fixed bodies). */
export const VillageScenery = memo(function VillageScenery() {
  return (
    <>
      <Terrain />
      <Buildings />
      <Vegetation />
    </>
  );
});

/** Interaction targets exist only while the player is in the world. */
export function VillageInteractables() {
  return (
    <>
      {INSPECTABLES.map((def) => (
        <Interactable key={def.id} id={def.id} kind={def.kind} labelBn={def.labelBn} position={def.position} maxDistance={def.maxDistance} onInteract={() => inspect(def)} />
      ))}
    </>
  );
}
