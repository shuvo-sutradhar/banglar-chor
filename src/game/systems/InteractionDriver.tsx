import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { t } from '../../locales';
import { CONTROL_PHASES, useAppStore } from '../../state/useAppStore';
import { useHudStore } from '../../state/useHudStore';
import { useGameRuntime } from '../GameRuntime';
import { makeSightRayFilter } from '../physics/queries';
import type { FocusQuery, RegisteredTarget } from './InteractionSystem';

const FOCUS_INTERVAL = 0.1;
const CHEST_HEIGHT = 1.1;

/**
 * Each 100 ms: pick the best in-range, in-front, visible target (raycast line of sight),
 * publish it to the HUD only when it changes. Interact input is consumed every frame and
 * re-validated by the registry so stale focus can never fire out of range.
 */
export function InteractionDriver() {
  const runtime = useGameRuntime();
  const { world, rapier, colliderStates } = useRapier();
  const sightFilter = useMemo(() => makeSightRayFilter(colliderStates), [colliderStates]);
  const timer = useRef(0);
  const scratch = useMemo(() => {
    const query: FocusQuery = { playerPosition: { x: 0, y: 0, z: 0 }, playerForward: { x: 0, z: -1 } };
    return { query, ray: new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }) };
  }, [rapier]);

  const hasLineOfSight = useMemo(
    () => (target: RegisteredTarget, distance: number) => {
      const from = scratch.query.playerPosition;
      const ray = scratch.ray;
      ray.origin.x = from.x;
      ray.origin.y = from.y;
      ray.origin.z = from.z;
      const inv = 1 / Math.max(distance, 1e-4);
      ray.dir.x = (target.position.x - from.x) * inv;
      ray.dir.y = (target.position.y - from.y) * inv;
      ray.dir.z = (target.position.z - from.z) * inv;
      const hit = world.castRay(ray, distance, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, sightFilter);
      // Large targets sit inside their own collider; small items get a tight tolerance.
      return hit === null || hit.timeOfImpact >= distance - (target.losTolerance ?? 0.9);
    },
    [world, rapier, scratch, sightFilter],
  );

  useFrame((_, dt) => {
    const app = useAppStore.getState();
    if (app.paused || !runtime.player.body) return;
    if (!CONTROL_PHASES.includes(app.phase) || runtime.player.script) {
      useHudStore.getState().setFocus(null);
      runtime.input.consumeInteract();
      return;
    }
    const p = runtime.player.position;
    const q = scratch.query;
    q.playerPosition.x = p.x;
    q.playerPosition.y = p.y + CHEST_HEIGHT;
    q.playerPosition.z = p.z;
    q.playerForward.x = runtime.player.forward.x;
    q.playerForward.z = runtime.player.forward.z;
    q.hasLineOfSight = hasLineOfSight;

    timer.current += dt;
    if (timer.current >= FOCUS_INTERVAL) {
      timer.current = 0;
      const focus = runtime.interactions.findFocus(q);
      useHudStore.getState().setFocus(focus ? { id: focus.id, kind: focus.kind, labelBn: focus.labelBn, lootId: focus.lootId } : null);
    }

    if (runtime.input.consumeInteract()) {
      const focusId = useHudStore.getState().focus?.id ?? null;
      const ran = runtime.interactions.interact(focusId, q);
      if (!ran) useHudStore.getState().showCaption(t('actionNothing'));
    }
  });

  return null;
}
