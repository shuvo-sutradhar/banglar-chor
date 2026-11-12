import type { RapierCollider, useRapier } from '@react-three/rapier';

/**
 * Scene-query filtering by collider *name* tag.
 *
 * Why not Rapier collision groups? With @dimforge/rapier3d-compat 0.19.2 in our browser tests,
 * any `filterGroups` passed to `world.castRay` produced no hits, and `collider.collisionGroups()`
 * read back as 0 — so group-based query filtering was unreliable (docs/DECISIONS.md D-009).
 * Thin props (bamboo, posts, fences, low walls) carry this name and block the player but not
 * the camera, which avoids camera popping when orbiting through foliage.
 */
export const CAMERA_TRANSPARENT = 'camera-transparent';

type ColliderStates = ReturnType<typeof useRapier>['colliderStates'];

/** Predicate for the camera occlusion ray: solid world geometry only. */
export function makeCameraBlocker(states: ColliderStates): (collider: RapierCollider) => boolean {
  return (collider) => states.get(collider.handle)?.object.name !== CAMERA_TRANSPARENT;
}
