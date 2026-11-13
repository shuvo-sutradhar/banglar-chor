import { describe, expect, it } from 'vitest';
import { MeshLambertMaterial, MeshStandardMaterial, ShaderLib, type WebGLProgramParametersWithUniforms } from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { ACTION_CLIPS, CARRY_CLIP_THRESHOLD, chooseClip, missingRequiredClips, parseMeta, resolveClip, syncedTimeScale } from '../game/characters/glb/clipSelect';
import { applyCutout, CUTOUT } from '../game/effects/cameraCutout';
import type { ActionPose } from '../game/characters/rigTypes';

const ALL = new Set(['Idle', 'Walk', 'Run', 'CrouchIdle', 'CrouchWalk', 'Sneak', 'Interact', 'Pickup', 'Carry', 'PreparationOil', 'PreparationLungi', 'PreparationGamcha', 'Suspicious', 'Frightened', 'ChaseReaction', 'Caught', 'Celebrate', 'Crawl']);
const SPEEDS = { Walk: 1.5, Run: 4.2, CrouchWalk: 0.9, Carry: 1.5, Crawl: 0.6 };
const base = { mode: 'idle' as const, speed: 0, action: null, carry: 0 };

describe('animation state controller: gameplay state → clip', () => {
  it('locomotion picks the right clip and syncs playback to real speed (no foot sliding)', () => {
    expect(chooseClip(base, ALL, SPEEDS)).toMatchObject({ clip: 'Idle', loop: true, timeScale: 1 });
    expect(chooseClip({ ...base, mode: 'walk', speed: 1.5 }, ALL, SPEEDS)).toMatchObject({ clip: 'Walk', timeScale: 1 });
    expect(chooseClip({ ...base, mode: 'walk', speed: 3.0 }, ALL, SPEEDS).timeScale).toBeCloseTo(2, 5);
    expect(chooseClip({ ...base, mode: 'run', speed: 5.6 }, ALL, SPEEDS).timeScale).toBeCloseTo(5.6 / 4.2, 5);
    expect(chooseClip({ ...base, mode: 'crouch-walk', speed: 1.5 }, ALL, SPEEDS)).toMatchObject({ clip: 'CrouchWalk' });
    expect(chooseClip({ ...base, mode: 'crouch-idle' }, ALL, SPEEDS)).toMatchObject({ clip: 'CrouchIdle', timeScale: 1 });
  });
  it('a heavy ঝোলা switches walking to the Carry clip', () => {
    expect(chooseClip({ ...base, mode: 'walk', speed: 1.4, carry: CARRY_CLIP_THRESHOLD }, ALL, SPEEDS).clip).toBe('Carry');
    expect(chooseClip({ ...base, mode: 'walk', speed: 1.4, carry: 0.5 }, ALL, SPEEDS).clip).toBe('Walk');
  });
  it('actions override locomotion with the documented clip and loop mode', () => {
    expect(chooseClip({ ...base, mode: 'walk', speed: 2, action: 'pickup' }, ALL, SPEEDS)).toMatchObject({ clip: 'Pickup', loop: false, timeScale: 1 });
    expect(chooseClip({ ...base, action: 'caught' }, ALL, SPEEDS)).toMatchObject({ clip: 'Caught', loop: true });
    expect(chooseClip({ ...base, action: 'gamcha' }, ALL, SPEEDS)).toMatchObject({ clip: 'PreparationGamcha' });
    expect(chooseClip({ ...base, action: 'crawl', speed: 0.6 }, ALL, SPEEDS)).toMatchObject({ clip: 'Crawl', timeScale: 1 });
  });
  it('every gameplay action pose maps to a spec clip', () => {
    const poses = Object.keys(ACTION_CLIPS) as ActionPose[];
    expect(poses.length).toBeGreaterThanOrEqual(18);
    for (const p of poses) expect(ALL.has(ACTION_CLIPS[p].clip)).toBe(true);
  });
  it('missing clips fall back to the nearest available one, never to nothing', () => {
    const minimal = new Set(['Idle', 'Walk', 'Run']);
    expect(resolveClip('Sneak', minimal)).toBe('Walk');
    expect(resolveClip('CrouchIdle', minimal)).toBe('Idle');
    expect(resolveClip('Caught', minimal)).toBe('Idle');
    expect(resolveClip('Pickup', new Set(['Idle', 'Interact']))).toBe('Interact');
    expect(chooseClip({ ...base, mode: 'crouch-walk', speed: 0.9 }, minimal, SPEEDS).clip).toBe('Walk');
  });
  it('playback-rate sync is clamped and tolerates missing metadata', () => {
    expect(syncedTimeScale(100, 1.5)).toBe(2.2);
    expect(syncedTimeScale(0.01, 1.5)).toBe(0.35);
    expect(syncedTimeScale(3, undefined)).toBe(1);
  });
  it('a GLB without locomotion clips is rejected (the procedural rig is used instead)', () => {
    expect(missingRequiredClips(new Set(['Idle', 'Walk']))).toEqual(['Run']);
    expect(missingRequiredClips(ALL)).toEqual([]);
  });
  it('reads clip-speed metadata from glTF extras (object or Blender JSON string)', () => {
    expect(parseMeta({ version: 1, clipSpeeds: { Walk: 1.5 } })?.clipSpeeds.Walk).toBe(1.5);
    expect(parseMeta('{"version":1,"clipSpeeds":{"Run":4.2,"Bad":-1}}')?.clipSpeeds).toEqual({ Run: 4.2 });
    expect(parseMeta('not json')).toBeNull();
    expect(parseMeta(undefined)).toBeNull();
  });
});

describe('thief GLB asset (placeholder) meets the character spec', () => {
  it('loads and has the skeleton, clips, metadata and budget the runtime relies on', async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const doc = await io.read('public/assets/models/characters/thief_placeholder.glb');
    const root = doc.getRoot();
    const joints = new Set(root.listSkins().flatMap((s) => s.listJoints().map((j) => j.getName())));
    for (const b of ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'upperarm_L', 'forearm_L', 'hand_L', 'upperarm_R', 'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R']) expect(joints.has(b), b).toBe(true);
    const clips = new Set(root.listAnimations().map((a) => a.getName()));
    expect(missingRequiredClips(clips)).toEqual([]);
    for (const c of ALL) expect(clips.has(c), c).toBe(true);
    let tris = 0;
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
    expect(tris).toBeLessThanOrEqual(6000);
    const meta = root.listNodes().map((n) => parseMeta((n.getExtras() as { sidhel?: unknown }).sidhel)).find(Boolean);
    expect(meta?.clipSpeeds.Walk).toBeGreaterThan(0);
    expect(meta?.clipSpeeds.Run).toBeGreaterThan(meta!.clipSpeeds.Walk!);
  });
});

describe('camera cutout shader patch', () => {
  function compile(material: MeshStandardMaterial | MeshLambertMaterial, lib: 'standard' | 'lambert') {
    const shader = { uniforms: {}, vertexShader: ShaderLib[lib].vertexShader, fragmentShader: ShaderLib[lib].fragmentShader } as unknown as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, undefined as never);
    return shader;
  }
  it('injects the cut into lit materials and shares one set of uniforms', () => {
    for (const [m, lib] of [
      [new MeshStandardMaterial(), 'standard'],
      [new MeshLambertMaterial(), 'lambert'],
    ] as const) {
      applyCutout(m);
      const s = compile(m, lib);
      expect(s.vertexShader).toContain('vCutWorld = (modelMatrix * cutW).xyz;');
      expect(s.fragmentShader).toContain('discard;');
      expect(s.uniforms.uCutTarget).toBe(CUTOUT.target);
      expect(m.customProgramCacheKey()).toContain('cut1');
    }
  });
  it('patching twice is a no-op', () => {
    const m = applyCutout(new MeshStandardMaterial());
    const once = m.onBeforeCompile;
    applyCutout(m);
    expect(m.onBeforeCompile).toBe(once);
  });
});
