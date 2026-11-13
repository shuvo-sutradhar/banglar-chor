import { useGLTF } from '@react-three/drei';

/** Placeholder until an artist's Blender export lands (docs/BLENDER_CHARACTER_SPEC.md). */
export const THIEF_GLB_URL = `${import.meta.env.BASE_URL}assets/models/characters/thief_placeholder.glb`;

/** Which thief visual actually rendered (debug snapshot / tests). */
export const thiefVisual = { kind: 'procedural' as 'procedural' | 'model', error: null as string | null };

let probe: Promise<boolean> | null = null;
/**
 * Cheap existence check before mounting the loader, so a missing file (artist asset not delivered
 * yet, offline cache miss) quietly uses the procedural rig instead of raising a loader error.
 */
export function probeThief(url = THIEF_GLB_URL): Promise<boolean> {
  probe ??= fetch(url, { method: 'HEAD' })
    .then((r) => r.ok)
    .catch(() => false);
  return probe;
}

/** Start fetching the model early. Draco is off (no external decoder fetch); meshopt decodes locally. */
export function preloadThief(url = THIEF_GLB_URL): void {
  useGLTF.preload(url, false, true);
}
