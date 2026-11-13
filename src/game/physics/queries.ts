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

/**
 * Walls/ceiling of an enterable house. They block movement, sight and the outdoor camera, but the
 * camera ignores them while the player is INSIDE (the camera cutout opens the view instead).
 */
export const HOUSE_SHELL = 'house-shell';

type ColliderStates = ReturnType<typeof useRapier>['colliderStates'];


/** Name tag on the player's capsule so queries can skip it without holding a body reference. */
export const PLAYER_COLLIDER = 'player-capsule';

/**
 * Camera occlusion: solid world geometry only (not the player, not thin props).
 * The player is excluded by tag rather than by passing its RigidBody, because a body reference
 * captured across React StrictMode remounts can be stale (found by the dev-mode smoke test).
 */
export function makeCameraRayFilter(states: ColliderStates): (collider: RapierCollider) => boolean {
  return (collider) => {
    const name = states.get(collider.handle)?.object.name;
    return name !== CAMERA_TRANSPARENT && name !== PLAYER_COLLIDER && name !== NPC_COLLIDER;
  };
}

/** Indoors: like the camera filter, but the house shell no longer pushes the camera in. */
export function makeInteriorCameraRayFilter(states: ColliderStates): (collider: RapierCollider) => boolean {
  return (collider) => {
    const name = states.get(collider.handle)?.object.name;
    return name !== CAMERA_TRANSPARENT && name !== HOUSE_SHELL && name !== PLAYER_COLLIDER && name !== NPC_COLLIDER;
  };
}

/** Interaction line of sight: everything except the player blocks. */
export function makeSightRayFilter(states: ColliderStates): (collider: RapierCollider) => boolean {
  return (collider) => {
    const name = states.get(collider.handle)?.object.name;
    return name !== PLAYER_COLLIDER && name !== NPC_COLLIDER;
  };
}

/** Name tag on NPC capsules (excluded from camera and sight rays). */
export const NPC_COLLIDER = 'npc-capsule';
