import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshLambertMaterial, MeshStandardMaterial, SkinnedMesh, Texture, Vector3 } from 'three';
import { batchRig } from '../game/characters/rigBatcher';
import { recordingPriority, voiceFile, voiceLine, voiceTakes, VOICE_LINES } from '../game/audio/voiceLines';

function rig() {
  const root = new Group();
  const pelvis = new Group();
  pelvis.position.set(0, 0.8, 0);
  const arm = new Group();
  arm.position.set(0.25, 0.4, 0);
  root.add(pelvis);
  pelvis.add(arm);
  const skin = new MeshLambertMaterial({ color: '#94603f' });
  const shirt = new MeshLambertMaterial({ color: '#a8946a' });
  const cloth = new MeshLambertMaterial({ map: new Texture() });
  const glow = new MeshStandardMaterial({ emissive: '#ffaa00' });
  const box = new BoxGeometry(1, 1, 1);
  const parts = [
    new Mesh(box, skin),
    new Mesh(box, shirt),
    new Mesh(box, cloth),
    new Mesh(box, skin),
    new Mesh(box, glow),
  ];
  parts[0]!.position.set(0, 0.1, 0);
  parts[0]!.scale.set(0.3, 0.2, 0.3);
  pelvis.add(parts[0]!, parts[1]!, parts[2]!);
  parts[3]!.position.set(0, -0.15, 0);
  parts[3]!.scale.set(0.1, 0.3, 0.1);
  arm.add(parts[3]!);
  const hand = new Group();
  hand.userData.noBatch = true;
  hand.add(parts[4]!);
  arm.add(hand);
  return { root, pelvis, arm, parts };
}

function skinnedWorld(sm: SkinnedMesh, i: number): Vector3 {
  sm.skeleton.update();
  const v = new Vector3().fromBufferAttribute(sm.geometry.attributes.position!, i);
  sm.applyBoneTransform(i, v);
  return v.applyMatrix4(sm.matrixWorld);
}

describe('rig batching (draw calls) is visually exact', () => {
  it('merges plain colours into one mesh, keeps one per textured cloth, leaves special parts alone', () => {
    const { root, parts } = rig();
    const { stats } = batchRig(root);
    const batched = root.children.filter((c) => (c as SkinnedMesh).isSkinnedMesh) as SkinnedMesh[];
    expect(batched).toHaveLength(2); // plain (skin + shirt + arm skin) + the textured cloth
    expect(stats.parts).toBe(5);
    expect(stats.batchedParts).toBe(4);
    expect(stats.drawsBefore).toBe(5);
    expect(stats.drawsAfter).toBe(3); // 2 batches + the glowing hand prop
    expect(parts[4]!.visible).toBe(true); // noBatch prop untouched
    expect(parts.slice(0, 4).every((p) => !p.visible)).toBe(true);
    const plain = batched.find((b) => b.name === 'rig-batch:plain')!;
    expect(plain.geometry.attributes.color).toBeTruthy();
  });
  it('vertices sit exactly where the original parts were, at rest and after a bone moves', () => {
    const { root, arm, parts } = rig();
    root.position.set(5, 0, -3);
    root.rotation.y = 0.7;
    const plain = (() => {
      batchRig(root);
      return root.children.find((c) => c.name === 'rig-batch:plain') as SkinnedMesh;
    })();
    const expected = () => new Vector3().fromBufferAttribute(parts[3]!.geometry.attributes.position!, 0).applyMatrix4(parts[3]!.matrixWorld);
    root.updateWorldMatrix(true, true);
    // Locate the arm part's first vertex in the merged buffer (traversal order is depth-first).
    const pos = plain.geometry.attributes.position!;
    let armIndex = -1;
    for (let i = 0; i < pos.count && armIndex < 0; i++) if (new Vector3().fromBufferAttribute(pos, i).applyMatrix4(plain.matrixWorld).distanceTo(expected()) < 1e-6) armIndex = i;
    expect(armIndex).toBeGreaterThanOrEqual(0);
    expect(skinnedWorld(plain, armIndex).distanceTo(expected())).toBeLessThan(1e-5);
    // Animate: swing the arm and move the whole character, like the game does every frame.
    arm.rotation.x = 1.1;
    root.position.x += 2;
    root.updateMatrixWorld(true); // what the renderer does each frame (refreshes the skinned mesh's bind inverse)
    expect(skinnedWorld(plain, armIndex).distanceTo(expected())).toBeLessThan(1e-5);
  });
  it('disposing restores the original meshes', () => {
    const { root, parts } = rig();
    const b = batchRig(root);
    b.dispose();
    expect(root.children.some((c) => (c as SkinnedMesh).isSkinnedMesh)).toBe(false);
    expect(parts.every((p) => p.visible)).toBe(true);
  });
});

describe('voice production pipeline', () => {
  const line = voiceLine('villager.chor')!;
  it('finds every recorded take; never plays a missing file; rough falls back to family takes', () => {
    expect(voiceTakes(line, false, new Set())).toEqual([]);
    const two = new Set([voiceFile(line), voiceFile(line, false, 2)]);
    expect(voiceTakes(line, false, two)).toEqual([voiceFile(line), voiceFile(line, false, 2)]);
    const rough = voiceLine('villager.catch.a')!;
    expect(voiceTakes(rough, true, new Set([voiceFile(rough)]))).toEqual([voiceFile(rough)]);
    expect(voiceTakes(rough, true, new Set([voiceFile(rough), voiceFile(rough, true)]))).toEqual([voiceFile(rough, true)]);
    expect(voiceFile(line, false, 3)).toBe('assets/audio/voice/villager/villager.chor.3.ogg');
  });
  it('recording order follows the production priority (thief, Rahim, Mojnu, chase, catch, merchants, food, shop)', () => {
    const p = (id: string) => recordingPriority(voiceLine(id)!);
    expect(p('thief.night.start')).toBeLessThan(p('rahim.wake.0'));
    expect(p('rahim.wake.0')).toBeLessThan(p('mojnu.alarm.0'));
    expect(p('mojnu.alarm.0')).toBeLessThan(p('villager.chor'));
    expect(p('villager.chor')).toBeLessThan(p('villager.punch.chicken'));
    expect(p('villager.punch.chicken')).toBeLessThan(p('merchant-hashem.greet.0'));
    expect(p('merchant-bokul.greet.0')).toBeLessThan(p('thief.eat.yum'));
    expect(p('thief.eat.yum')).toBeLessThan(p('thief.shop.bought'));
    for (const l of VOICE_LINES) expect(recordingPriority(l)).toBeGreaterThanOrEqual(1);
  });
});

describe('sound design rules', () => {
  it('footsteps follow the ground: road dirt, grass, the mud floor indoors, the pond edge, the bazaar', async () => {
    const { surfaceAt, FOOTSTEP_SOUND } = await import('../game/audio/surfaces');
    expect(surfaceAt(1, 30, 'village')).toBe('dirt'); // on the road
    expect(surfaceAt(25, 32, 'village')).toBe('grass');
    expect(surfaceAt(-12, 6, 'village')).toBe('mud-floor'); // inside Rahim's house
    expect(surfaceAt(13 + 6.5, 19, 'village')).toBe('wet');
    expect(surfaceAt(0, 0, 'bazaar')).toBe('packed');
    expect(new Set(Object.values(FOOTSTEP_SOUND)).size).toBe(5);
  });
  it('short sounds never repeat the same variant twice in a row', async () => {
    const { pickVariant } = await import('../game/audio/surfaces');
    const memo = new Map<string, number>();
    let last = -1;
    for (let i = 0; i < 200; i++) {
      const v = pickVariant(memo, 'k', 3, Math.random());
      expect(v).not.toBe(last);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(3);
      last = v;
    }
  });
  it('every loot category has its own pickup sound', async () => {
    const { PICKUP_SOUND } = await import('../game/audio/surfaces');
    const { LOOT } = await import('../game/data/loot');
    for (const def of Object.values(LOOT)) expect(PICKUP_SOUND[def.category], def.id).toBeTruthy();
  });
});

describe('dialogue: instructions are shown at once', () => {
  it('an info line interrupts an equal-priority reaction instead of waiting behind it', async () => {
    const { VoiceDirector } = await import('../game/audio/voice');
    let t = 0;
    const started: string[] = [];
    const stopped: string[] = [];
    const d = new VoiceDirector(
      { start: (l) => (started.push(l.id), { duration: 2, voiced: false, stop: () => stopped.push(l.id) }) },
      { show: () => 1, clear: () => {} },
      () => t,
    );
    d.speak('thief.entry.fail'); // priority 2 reaction
    t = 0.5;
    expect(d.speak('thief.entry.cooldown')).toBe('played'); // priority 2, info
    expect(stopped).toEqual(['thief.entry.fail']);
    expect(d.current?.id).toBe('thief.entry.cooldown');
  });
});
