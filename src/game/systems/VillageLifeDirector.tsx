import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CanvasTexture, Euler, Matrix4, MeshStandardMaterial, Quaternion, SpriteMaterial, Vector3, type BufferGeometry, type Group, type Sprite } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, useBeforePhysicsStep } from '@react-three/rapier';
import { useAppStore } from '../../state/useAppStore';
import { useGameRuntime } from '../GameRuntime';
import { nightBody } from './nightBody';
import { nightMinutesAt } from './runLogic';
import { hearingStrength } from './noise';
import { audio } from '../audio/AudioManager';
import { voiceLine } from '../audio/voiceLines';
import { say } from './nightActions';
import { THIEF_NAME } from '../data/dialogue';
import { DOG_RULES, DOG_SPOT, HOUSEHOLD_NOISE, stepDog, type DogState, type HouseholdKind } from './villageLife';

const KIND_BN: Record<HouseholdKind, string> = {
  'pot-clatter': 'হাঁড়ি-পাতিল পড়ার ঝনঝন শব্দ',
  cough: 'কারো খকখক কাশি',
  'door-creak': 'দরজার ক্যাঁচক্যাঁচ',
  'cat-yowl': 'বিড়ালের ম্যাঁও-ম্যাঁও ঝগড়া',
};

/**
 * Living village (Stage 5): tonight's plan made audible and visible. Household noises are real
 * world noise events NOT attributed to the player (the patrol may wander off to check: a chance,
 * never a trap); the dog naps by the lane and wakes on nearby noise, growls first (a fair
 * warning), and barks only if the disturbance continues — a bark is a noise the patrol hears.
 */
export function VillageLife() {
  const runtime = useGameRuntime();
  const plan = useMemo(() => nightBody.current.plan, []);
  const st = useRef({ opened: false, fired: new Set<number>() });

  useBeforePhysicsStep(() => {
    const phase = useAppStore.getState().phase;
    if (phase === 'caught' || phase === 'night-resolution') return;
    const s = st.current;
    if (!s.opened && runtime.simTime > 1.5) {
      s.opened = true;
      if (plan.memoryLine) say(voiceLine('villager.memory')!.text, 'গ্রামবাসী', { x: 13, z: -4 });
      else if (plan.day <= 1) say(voiceLine('thief.night.start')!.text, THIEF_NAME);
    }
    const minutes = nightMinutesAt(runtime.simTime);
    plan.events.forEach((e, i) => {
      if (s.fired.has(i) || minutes < e.atMinute) return;
      s.fired.add(i);
      audio.play(e.kind, { at: { x: e.x, z: e.z }, range: 40, gain: 1.2 });
      runtime.noise.emit({ x: e.x, y: 0.5, z: e.z, radius: HOUSEHOLD_NOISE.radius, severity: HOUSEHOLD_NOISE.severity, source: 'item', byPlayer: false }, runtime.simTime);
      say(`দূরে ${e.labelBn} থেকে ${KIND_BN[e.kind]}…`, '🔊');
    });
  });

  return plan.dog ? <VillageDog /> : null;
}

function labelTexture(text: string, color: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#17222f';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 35);
  }
  return new CanvasTexture(c);
}

const BOX = new BoxGeometry(1, 1, 1);

/** Boxes merged into one geometry (one draw call per material per animated part). */
function boxes(parts: [pos: [number, number, number], scale: [number, number, number], rot?: [number, number, number]][]): BufferGeometry {
  return mergeGeometries(
    parts.map(([p, sc, r]) => BOX.clone().applyMatrix4(new Matrix4().compose(new Vector3(...p), new Quaternion().setFromEuler(new Euler(...(r ?? [0, 0, 0]))), new Vector3(...sc)))),
  )!;
}

/** Measured: the dog was 11 draw calls; merged per material and animated part it is 6 (D-062). */
const DOG_GEO = {
  body: boxes([[[0, 0.18, 0], [0.32, 0.26, 0.62]], [[-0.1, 0.06, 0.22], [0.08, 0.12, 0.2]], [[0.1, 0.06, 0.22], [0.08, 0.12, 0.2]]]),
  headFur: boxes([[[0, 0, 0], [0.22, 0.2, 0.22]]]),
  headDark: boxes([[[0, -0.03, 0.15], [0.11, 0.09, 0.12]], [[-0.08, 0.12, -0.02], [0.06, 0.1, 0.03], [0, 0, 0.4]], [[0.08, 0.12, -0.02], [0.06, 0.1, 0.03], [0, 0, -0.4]]]),
  tail: boxes([[[0, 0.05, -0.08], [0.05, 0.05, 0.2], [0.7, 0, 0]]]),
};

/** A scruffy village dog (procedural, two shared materials). */
function VillageDog() {
  const runtime = useGameRuntime();
  const head = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const body = useRef<Group>(null);
  const icon = useRef<Sprite>(null);
  const looks = useMemo(
    () => ({
      fur: new MeshStandardMaterial({ color: '#a9824f', roughness: 0.95 }),
      dark: new MeshStandardMaterial({ color: '#3b2b1c', roughness: 0.9 }),
      z: new SpriteMaterial({ map: labelTexture('z', '#9fb3c8'), depthTest: false, transparent: true }),
      warn: new SpriteMaterial({ map: labelTexture('?', '#e3ba70'), depthTest: false, transparent: true }),
      bark: new SpriteMaterial({ map: labelTexture('!', '#d8583e'), depthTest: false, transparent: true }),
    }),
    [],
  );
  useEffect(
    () => () => {
      looks.fur.dispose();
      looks.dark.dispose();
      for (const m of [looks.z, looks.warn, looks.bark]) {
        m.map?.dispose();
        m.dispose();
      }
    },
    [looks],
  );
  const sim = useRef({ dog: { state: 'asleep' as DogState, t: 0 }, lastNoise: 0, hushed: false, barkTimer: 0, growlPlayed: false });

  useBeforePhysicsStep((world) => {
    const s = sim.current;
    const dt = world.timestep;
    let heard = 0;
    for (const e of runtime.noise.since(s.lastNoise, runtime.simTime)) {
      if (!e.byPlayer) continue;
      heard = Math.max(heard, hearingStrength(Math.hypot(e.x - DOG_SPOT.x, e.z - DOG_SPOT.z), e.radius, false) * e.severity * 4);
    }
    s.lastNoise = runtime.noise.lastId;
    const p = runtime.player.position;
    const near = runtime.player.body !== null && Math.hypot(p.x - DOG_SPOT.x, p.z - DOG_SPOT.z) < 2;
    const before = s.dog.state;
    const r = stepDog(s.dog, heard, near, dt);
    s.dog = { state: r.state, t: r.t };
    if (r.state === 'growl' && before !== 'growl') audio.play('grumble', { at: DOG_SPOT, gain: 0.8 });
    if (r.barked) {
      s.barkTimer = 0;
      if (!s.hushed) {
        s.hushed = true;
        say(voiceLine('thief.dog.hush')!.text, THIEF_NAME);
      }
    }
    if (r.state === 'bark') {
      s.barkTimer -= dt;
      if (s.barkTimer <= 0) {
        s.barkTimer = 1.1;
        audio.play('dog-bark', { at: DOG_SPOT, gain: 1.1, range: 40 });
        runtime.noise.emit({ x: DOG_SPOT.x, y: 0.4, z: DOG_SPOT.z, radius: DOG_RULES.barkNoise.radius, severity: DOG_RULES.barkNoise.severity, source: 'item', byPlayer: true }, runtime.simTime);
      }
    }
  });

  useFrame(() => {
    const st = sim.current.dog.state;
    const t = runtime.simTime;
    const up = st === 'asleep' || st === 'settling' ? 0 : 1;
    if (head.current) {
      head.current.position.y = 0.16 + 0.12 * up;
      head.current.rotation.x = up ? -0.2 + (st === 'bark' ? 0.25 * Math.abs(Math.sin(t * 9)) : 0) : 0.35;
    }
    if (body.current) body.current.scale.y = 1 + 0.03 * Math.sin(t * (up ? 6 : 1.6));
    if (tail.current) tail.current.rotation.y = up ? 0.6 * Math.sin(t * 10) : 0.1;
    if (icon.current) icon.current.material = st === 'bark' ? looks.bark : st === 'growl' ? looks.warn : looks.z;
  });

  return (
    <group position={[DOG_SPOT.x, 0, DOG_SPOT.z]} rotation={[0, DOG_SPOT.heading, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.22, 0.25, 0.42]} position={[0, 0.25, 0]} />
      </RigidBody>
      <group ref={body}>
        <mesh geometry={DOG_GEO.body} material={looks.fur} castShadow />
      </group>
      <group ref={head} position={[0, 0.16, 0.36]}>
        <mesh geometry={DOG_GEO.headFur} material={looks.fur} castShadow />
        <mesh geometry={DOG_GEO.headDark} material={looks.dark} />
      </group>
      <group ref={tail} position={[0, 0.26, -0.32]}>
        <mesh geometry={DOG_GEO.tail} material={looks.fur} />
      </group>
      <sprite ref={icon} material={looks.z} position={[0, 0.75, 0]} scale={[0.32, 0.32, 0.32]} />
    </group>
  );
}
