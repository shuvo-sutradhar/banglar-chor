import { useEffect, useMemo } from 'react';
import { AnimationMixer, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial, SphereGeometry, type AnimationAction, type AnimationClip, type Bone, type Material, type Object3D, type SkinnedMesh } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { damp } from '../../../lib/math';
import { useAppStore } from '../../../state/useAppStore';
import type { RigDriver } from '../rigTypes';
import { THIEF_GLB_URL } from './thiefAsset';
import { debugHooks } from '../../debugHooks';
import { chooseClip, isGait, missingRequiredClips, parseMeta, type CharacterMeta } from './clipSelect';


type Runtime = {
  model: Object3D;
  mixer: AnimationMixer;
  actions: Map<string, AnimationAction>;
  available: Set<string>;
  clipSpeeds: Record<string, number>;
  current: { name: string; action: AnimationAction } | null;
  tuckMeshes: { mesh: SkinnedMesh; index: number }[];
  headband: Object3D | null;
  skin: MeshStandardMaterial | null;
  sack: Mesh;
  ownMaterials: Material[];
  tuck: number;
  oil: number;
};

function buildRuntime(scene: Object3D, clips: AnimationClip[]): Runtime {
  const model = cloneSkinned(scene);
  const found: { meta: CharacterMeta | null; headband: Object3D | null; skin: MeshStandardMaterial | null; chest: Bone | null } = { meta: null, headband: null, skin: null, chest: null };
  scene.traverse((o) => {
    found.meta ??= parseMeta(o.userData?.sidhel);
  });
  const ownMaterials = new Map<Material, Material>();
  const tuckMeshes: Runtime['tuckMeshes'] = [];
  const swap = (m: Material) => {
    let c = ownMaterials.get(m);
    if (!c) {
      c = m.clone();
      ownMaterials.set(m, c);
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
  });
  const mixer = new AnimationMixer(model);
  const actions = new Map(clips.map((c) => [c.name, mixer.clipAction(c)] as const));
  // The ঝোলা: a jute sack on the back that grows with the load.
  const sack = new Mesh(new SphereGeometry(0.16, 12, 10), new MeshStandardMaterial({ color: '#a8875a', roughness: 0.95 }));
  sack.name = 'sack';
  sack.castShadow = true;
  sack.visible = false;
  sack.position.set(0.02, 0.0, -0.2);
  found.chest?.add(sack);
  return {
    model,
    mixer,
    actions,
    available: new Set(actions.keys()),
    clipSpeeds: found.meta?.clipSpeeds ?? {},
    current: null,
    tuckMeshes,
    headband: found.headband,
    skin: found.skin,
    sack,
    ownMaterials: [...ownMaterials.values()],
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
  const rt = useMemo(() => buildRuntime(gltf.scene, gltf.animations), [gltf]);
  const model = rt.model;
  useEffect(() => {
    debugHooks.anim = () => ({
      clip: rt.current?.name ?? null,
      timeScale: rt.current?.action.getEffectiveTimeScale() ?? 0,
      weight: rt.current?.action.getEffectiveWeight() ?? 0,
      clips: rt.actions.size,
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
      rt.sack.geometry.dispose();
      (rt.sack.material as Material).dispose();
    },
    [rt, model],
  );

  useFrame((_, rawDt) => {
    if (useAppStore.getState().paused) return;
    const dt = Math.min(rawDt, 0.1);
    driver.actionTime += dt;
    const choice = chooseClip({ mode: driver.mode, speed: driver.horizontalSpeed, action: driver.action, carry: driver.carry ?? 0 }, rt.available, rt.clipSpeeds);
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
    if (rt.current) rt.current.action.setEffectiveTimeScale(choice.timeScale);
    rt.mixer.update(dt);

    // Preparation results, shown on the model.
    const c = driver.cosmetic;
    rt.tuck = damp(rt.tuck, c ? Math.min(1, c.tuck) : 0, 6, dt);
    for (const t of rt.tuckMeshes) t.mesh.morphTargetInfluences![t.index] = rt.tuck;
    if (rt.headband) rt.headband.visible = Boolean(c?.headband);
    rt.oil = damp(rt.oil, c ? Math.min(1, c.oil) : 0, 4, dt);
    if (rt.skin) rt.skin.roughness = 0.72 - 0.4 * rt.oil;
    const carry = driver.carry ?? 0;
    rt.sack.visible = carry > 0.01;
    if (rt.sack.visible) rt.sack.scale.setScalar(0.6 + 0.7 * carry);
  });

  return <primitive object={model} />;
}
