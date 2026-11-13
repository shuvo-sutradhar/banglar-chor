import { useEffect, useMemo } from 'react';
import { AnimationMixer, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial, Source, SphereGeometry, type AnimationAction, type AnimationClip, type Bone, type Material, type Object3D, type SkinnedMesh, type Texture } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { damp } from '../../../lib/math';
import { useAppStore } from '../../../state/useAppStore';
import type { RigDriver } from '../rigTypes';
import { THIEF_GLB_URL, thiefLoadStarted, thiefVisual, type ThiefStats } from './thiefAsset';
import { timed } from '../../perfCounters';
import { useQualityProfile } from '../../quality';
import { debugHooks } from '../../debugHooks';
import { blinkAmount, chooseClip, isGait, missingRequiredClips, nextBlinkDelay, parseMeta, type CharacterMeta } from './clipSelect';


type Runtime = {
  /** Hand tools by equipment id (bone-parented Tool_* nodes). */
  tools: Map<string, Object3D>;
  model: Object3D;
  mixer: AnimationMixer;
  actions: Map<string, AnimationAction>;
  available: Set<string>;
  clipSpeeds: Record<string, number>;
  current: { name: string; action: AnimationAction } | null;
  tuckMeshes: { mesh: SkinnedMesh; index: number }[];
  blinkMeshes: { mesh: SkinnedMesh; index: number }[];
  blinkAt: number;
  blinkT: number;
  headband: Object3D | null;
  skin: MeshStandardMaterial | null;
  sack: Mesh;
  ownMaterials: Material[];
  ownTextures: Texture[];
  stats: ThiefStats;
  tuck: number;
  oil: number;
};

const TEX_SLOTS = ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'aoMap', 'emissiveMap'] as const;

/** A smaller copy of a texture (own Source, so the cached full-size original is never touched). */
function downscaleTexture(tex: Texture, max: number): Texture | null {
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | null;
  if (!img || !img.width || Math.max(img.width, img.height) <= max || typeof document === 'undefined') return null;
  const s = max / Math.max(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * s));
  c.height = Math.max(1, Math.round(img.height * s));
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const t = tex.clone();
  t.source = new Source(c);
  t.needsUpdate = true;
  return t;
}

/**
 * maxTexture caps texture size for this instance (Low quality: 512). Only the per-instance
 * materials render, so the full-size originals in the loader cache are never uploaded to the GPU.
 */
function buildRuntime(scene: Object3D, clips: AnimationClip[], maxTexture = 4096): Runtime {
  const model = cloneSkinned(scene);
  const found: { meta: CharacterMeta | null; headband: Object3D | null; skin: MeshStandardMaterial | null; chest: Bone | null } = { meta: null, headband: null, skin: null, chest: null };
  scene.traverse((o) => {
    found.meta ??= parseMeta(o.userData?.sidhel);
  });
  const ownMaterials = new Map<Material, Material>();
  const smallTex = new Map<Texture, Texture | null>();
  const ownTextures: Texture[] = [];
  const tuckMeshes: Runtime['tuckMeshes'] = [];
  const blinkMeshes: Runtime['blinkMeshes'] = [];
  const swap = (m: Material) => {
    let c = ownMaterials.get(m);
    if (!c) {
      c = m.clone();
      ownMaterials.set(m, c);
      const slots = c as unknown as Record<string, Texture | null | undefined>;
      for (const k of TEX_SLOTS) {
        const tex = slots[k];
        if (!tex) continue;
        let small = smallTex.get(tex);
        if (small === undefined) {
          small = downscaleTexture(tex, maxTexture);
          smallTex.set(tex, small);
          if (small) ownTextures.push(small);
        }
        if (small) slots[k] = small;
      }
      if (c.name === 'Thief_Skin') found.skin = c as MeshStandardMaterial;
    }
    return c;
  };
  model.traverse((o) => {
    if (o.name === 'Headband') found.headband = o;
    if ((o as Bone).isBone && o.name === 'chest') found.chest = o as Bone;
    const mesh = o as SkinnedMesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    // Skinned bounds are the bind pose; animation can leave them, so never cull the player.
    mesh.frustumCulled = false;
    // Per-instance materials (oil shine must not leak into the shared GLTF cache).
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    const idx = mesh.morphTargetDictionary?.LungiTuck;
    if (idx !== undefined) tuckMeshes.push({ mesh, index: idx });
    const bi = mesh.morphTargetDictionary?.Blink;
    if (bi !== undefined) blinkMeshes.push({ mesh, index: bi });
  });
  // Measured budget numbers for this instance (debug snapshot / perf scripts).
  const usedTex = new Set<Texture>();
  let triangles = 0;
  let bones = 0;
  model.traverse((o) => {
    const mesh = o as SkinnedMesh;
    if ((o as Bone).isBone) bones++;
    if (!mesh.isMesh) return;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position!.count) / 3;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const slots = m as unknown as Record<string, Texture | null | undefined>;
      for (const k of TEX_SLOTS) if (slots[k]) usedTex.add(slots[k]!);
    }
  });
  let textureBytes = 0;
  let maxTex = 0;
  for (const t of usedTex) {
    const img = t.image as { width?: number; height?: number } | null;
    const w = img?.width ?? 0;
    const h = img?.height ?? 0;
    maxTex = Math.max(maxTex, w, h);
    textureBytes += w * h * 4 * (4 / 3); // RGBA8 + mip chain
  }
  const stats: ThiefStats = { triangles, materials: ownMaterials.size, textures: usedTex.size, textureBytes: Math.round(textureBytes), maxTexture: maxTex, clips: clips.length, bones };
  const mixer = new AnimationMixer(model);
  const actions = new Map(clips.map((c) => [c.name, mixer.clipAction(c)] as const));
  // The ঝোলা: a jute sack on the back that grows with the load.
  const sack = new Mesh(new SphereGeometry(0.16, 12, 10), new MeshStandardMaterial({ color: '#a8875a', roughness: 0.95 }));
  sack.name = 'sack';
  sack.castShadow = true;
  sack.visible = false;
  sack.position.set(0.02, 0.0, -0.2);
  found.chest?.add(sack);
  // Bone-parented hand tools (Tool_<equipment id>), hidden until used.
  const tools = new Map<string, Object3D>();
  model.traverse((o) => {
    if (o.name.startsWith('Tool_')) {
      tools.set(o.name.slice(5), o);
      o.visible = false;
    }
  });
  return {
    tools,
    model,
    mixer,
    actions,
    available: new Set(actions.keys()),
    clipSpeeds: found.meta?.clipSpeeds ?? {},
    current: null,
    tuckMeshes,
    blinkMeshes,
    blinkAt: 1.5,
    blinkT: -1,
    headband: found.headband,
    skin: found.skin,
    sack,
    ownMaterials: [...ownMaterials.values()],
    ownTextures,
    stats,
    tuck: 0,
    oil: 0,
  };
}

/**
 * Skinned GLB character driven by the same RigDriver the procedural rig uses. Animation runs in
 * useFrame (never through React state): one clip at a time, cross-faded only when the chosen clip
 * changes, gait phase preserved between walk/run, playback synced to real speed (no foot sliding).
 * Throws (→ caller's fallback) if the file lacks the required locomotion clips.
 */
export function GlbCharacter({ driver, url = THIEF_GLB_URL }: { driver: RigDriver; url?: string }) {
  const gltf = useGLTF(url, false, true);
  const missing = missingRequiredClips(new Set(gltf.animations.map((a) => a.name)));
  if (missing.length) throw new Error(`character GLB missing clips: ${missing.join(', ')}`);
  const maxTexture = useQualityProfile().level === 'low' ? 512 : 4096;
  const rt = useMemo(() => buildRuntime(gltf.scene, gltf.animations, maxTexture), [gltf, maxTexture]);
  const model = rt.model;
  useEffect(() => {
    thiefVisual.stats = rt.stats;
    if (thiefVisual.loadMs === null && thiefLoadStarted()) thiefVisual.loadMs = Math.round(performance.now() - thiefLoadStarted());
    debugHooks.anim = () => ({
      clip: rt.current?.name ?? null,
      timeScale: rt.current?.action.getEffectiveTimeScale() ?? 0,
      weight: rt.current?.action.getEffectiveWeight() ?? 0,
      clips: rt.actions.size,
      blink: rt.blinkMeshes.length > 0,
    });
    return () => {
      if (debugHooks.anim) delete debugHooks.anim;
    };
  }, [rt]);

  useEffect(
    () => () => {
      rt.mixer.stopAllAction();
      rt.mixer.uncacheRoot(model);
      for (const m of rt.ownMaterials) m.dispose();
      for (const t of rt.ownTextures) t.dispose();
      rt.sack.geometry.dispose();
      (rt.sack.material as Material).dispose();
    },
    [rt, model],
  );

  useFrame((_, rawDt) => timed('mixer', () => tick(rawDt)));
  function tick(rawDt: number) {
    if (useAppStore.getState().paused) return;
    const dt = Math.min(rawDt, 0.1);
    driver.actionTime += dt;
    const choice = chooseClip({ mode: driver.mode, speed: driver.horizontalSpeed, action: driver.action, carry: driver.carry ?? 0, tired: driver.tired }, rt.available, rt.clipSpeeds);
    const next = rt.actions.get(choice.clip);
    if (next && (!rt.current || rt.current.name !== choice.clip)) {
      const prev = rt.current;
      next.reset();
      next.setLoop(choice.loop ? LoopRepeat : LoopOnce, Infinity);
      next.clampWhenFinished = !choice.loop;
      // Keep the stride phase when changing gait so the feet stay planted through the blend.
      if (prev && isGait(prev.name) && isGait(choice.clip)) {
        const p = prev.action.time / prev.action.getClip().duration;
        next.time = (p % 1) * next.getClip().duration;
      }
      next.setEffectiveWeight(1);
      next.play();
      if (prev) prev.action.crossFadeTo(next, choice.fade, false);
      rt.current = { name: choice.clip, action: next };
    }
    if (rt.current) {
      // Phase-locked actions (the Dig swing on the rhythm beat) are positioned, not played.
      const locked = driver.clipPhase !== null && driver.clipPhase !== undefined && driver.action !== null;
      if (locked) rt.current.action.time = driver.clipPhase! * rt.current.action.getClip().duration;
      rt.current.action.setEffectiveTimeScale(locked ? 0 : choice.timeScale);
    }
    rt.mixer.update(dt);
    // Only the equipped tool, only while it's in use.
    for (const [id, obj] of rt.tools) obj.visible = driver.tool === id;

    // Preparation results, shown on the model.
    const c = driver.cosmetic;
    rt.tuck = damp(rt.tuck, c ? Math.min(1, c.tuck) : 0, 6, dt);
    for (const t of rt.tuckMeshes) t.mesh.morphTargetInfluences![t.index] = rt.tuck;
    if (rt.headband) rt.headband.visible = Boolean(c?.headband);
    // Eyes blink on their own (Blender model's `Blink` shape key; absent on the placeholder).
    if (rt.blinkMeshes.length) {
      rt.blinkAt -= dt;
      if (rt.blinkAt <= 0) {
        rt.blinkT = 0;
        rt.blinkAt = nextBlinkDelay(Math.random());
      }
      const w = rt.blinkT >= 0 ? blinkAmount(rt.blinkT) : 0;
      if (rt.blinkT >= 0) rt.blinkT += dt;
      for (const b of rt.blinkMeshes) b.mesh.morphTargetInfluences![b.index] = w;
    }
    rt.oil = damp(rt.oil, c ? Math.min(1, c.oil) : 0, 4, dt);
    if (rt.skin) rt.skin.roughness = 0.72 - 0.4 * rt.oil;
    const carry = driver.carry ?? 0;
    rt.sack.visible = carry > 0.01;
    if (rt.sack.visible) rt.sack.scale.setScalar(0.6 + 0.7 * carry);
  }

  return <primitive object={model} />;
}
