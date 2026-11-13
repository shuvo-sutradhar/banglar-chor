import { useGLTF } from '@react-three/drei';

const MODELS = `${import.meta.env.BASE_URL}assets/models/characters/`;

/** The Blender-built thief (Phase 4A: assets-source/blender/characters/thief.blend). */
export const THIEF_GLB_URL = `${MODELS}thief.glb`;
/** The earlier code-generated placeholder, kept as the first fallback. */
export const THIEF_FALLBACK_GLB_URL = `${MODELS}thief_placeholder.glb`;
/** Load order: Blender model, then placeholder, then (outside this file) the procedural rig. */
export const THIEF_GLB_CANDIDATES = [THIEF_GLB_URL, THIEF_FALLBACK_GLB_URL] as const;

export type ThiefStats = { triangles: number; materials: number; textures: number; textureBytes: number; maxTexture: number; clips: number; bones: number };
/** Which thief visual actually rendered, and what it costs (debug snapshot / tests / perf scripts). */
export const thiefVisual = {
  kind: 'procedural' as 'procedural' | 'model',
  error: null as string | null,
  url: null as string | null,
  /** ms from the start of the file probe to the model's first mount (fetch + parse + setup). */
  loadMs: null as number | null,
  stats: null as ThiefStats | null,
};
let loadStart = 0;
export function thiefLoadStarted(): number {
  return loadStart;
}

const probes = new Map<string, Promise<boolean>>();
/**
 * Cheap existence check before mounting the loader, so a missing file (offline cache miss, asset
 * not deployed) quietly uses the next fallback instead of raising a loader error.
 */
export function probeThief(url: string = THIEF_GLB_URL): Promise<boolean> {
  let p = probes.get(url);
  if (!p) {
    p = fetch(url, { method: 'HEAD' })
      .then((r) => r.ok)
      .catch(() => false);
    probes.set(url, p);
  }
  return p;
}

/** First candidate that exists, or null (→ procedural rig). */
export async function resolveThiefUrl(candidates: readonly string[] = THIEF_GLB_CANDIDATES): Promise<string | null> {
  loadStart ||= performance.now();
  for (const url of candidates) if (await probeThief(url)) return url;
  return null;
}

/** Start fetching the model early. Draco is off (no external decoder fetch); meshopt decodes locally. */
export function preloadThief(url: string = THIEF_GLB_URL): void {
  useGLTF.preload(url, false, true);
}
