import { useEffect, useMemo, useRef } from 'react';
import { Vector3, type Group } from 'three';
import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier';
import { damp } from '../../lib/math';
import { useAppStore } from '../../state/useAppStore';
import { useRunStore } from '../../state/useRunStore';
import { useGameRuntime, type NpcRuntime } from '../GameRuntime';
import { createSleeper, RAHIM_SLEEPER, stepSleeper } from '../ai/sleeper';
import { hearingStrength } from '../systems/noise';
import { HOUSES } from '../world/layout';
import { RAHIM_COT, insideRahimHouse } from '../data/rahimHouse';
import { RAHIM_LINES, RAHIM_NAME } from '../data/dialogue';
import { PLAYER_COLLIDER, NPC_COLLIDER } from '../physics/queries';
import { audio } from '../audio/AudioManager';
import { say, triggerCaught } from '../systems/nightActions';
import { HumanRig } from './HumanRig';
import { RAHIM_LOOK } from './appearances';
import { setAction, type RigDriver } from './rigTypes';

const NPC_ID = 'rahim';
const pick = <T,>(lines: readonly T[], k: number): T => lines[Math.abs(Math.floor(k)) % lines.length] as T;

/**
 * রহিম চাচা asleep on his cot. Hears noise events (walls muffle — so digging outside is softer
 * than walking inside); stirs, settles or wakes. Awake, he shouts an alarm that মজনু can hear,
 * and grabs a thief who stays inside past a visible countdown.
 */
export function RahimSleeper() {
  const runtime = useGameRuntime();
  const { world, rapier, colliderStates } = useRapier();
  const poseRef = useRef<Group>(null);
  const sim = useMemo(
    () => ({
      s: createSleeper(),
      lastNoiseId: 0,
      snoreTimer: 4,
      awakeBlend: 0,
      driver: { horizontalSpeed: 0, mode: 'idle', action: null, actionTime: 0 } as RigDriver,
      npc: { id: NPC_ID, nameBn: RAHIM_NAME, position: new Vector3(...RAHIM_COT), facing: new Vector3(1, 0, 0), state: 'asleep', suspicion: 0 } as NpcRuntime,
      ray: new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }),
      lastGrabShown: -1,
    }),
    [rapier],
  );

  useEffect(() => {
    runtime.npcs.set(NPC_ID, sim.npc);
    sim.lastNoiseId = runtime.noise.lastId;
    return () => {
      runtime.npcs.delete(NPC_ID);
      useRunStore.getState().setRahimAwake(false);
      useRunStore.getState().setRahimGrabIn(null);
    };
  }, [runtime, sim]);

  useBeforePhysicsStep(() => {
    const dt = world.timestep;
    const [hx, hy, hz] = RAHIM_COT;
    let loudest = 0;
    for (const e of runtime.noise.since(sim.lastNoiseId, runtime.simTime)) {
      if (e.source === 'alarm') continue;
      const d = Math.hypot(e.x - hx, e.z - hz);
      if (d >= e.radius) continue;
      const dx = e.x - hx;
      const dy = e.y + 0.4 - hy;
      const dz = e.z - hz;
      const len = Math.hypot(dx, dy, dz);
      sim.ray.origin.x = hx;
      sim.ray.origin.y = hy;
      sim.ray.origin.z = hz;
      sim.ray.dir.x = dx / len;
      sim.ray.dir.y = dy / len;
      sim.ray.dir.z = dz / len;
      const hit = world.castRay(sim.ray, Math.max(0, len - 0.1), true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, (c) => {
        const n = colliderStates.get(c.handle)?.object.name;
        return n !== PLAYER_COLLIDER && n !== NPC_COLLIDER;
      });
      // The cot itself is near the origin; only treat hits beyond 0.8 m as walls.
      const occluded = hit !== null && hit.timeOfImpact > 0.8;
      loudest = Math.max(loudest, hearingStrength(d, e.radius, occluded) * e.severity);
    }
    sim.lastNoiseId = runtime.noise.lastId;

    const p = runtime.player.position;
    const inside = runtime.player.body !== null && insideRahimHouse(p.x, p.z) && !runtime.player.script;
    const ev = stepSleeper(sim.s, loudest, inside, dt, RAHIM_SLEEPER);
    const near = Math.hypot(p.x - hx, p.z - hz) < 9;
    const k = runtime.simTime * 3;
    switch (ev) {
      case 'stir':
        if (near) say(pick(RAHIM_LINES.stir, k), RAHIM_NAME);
        break;
      case 'settle':
        if (near) say(pick(RAHIM_LINES.settle, k), RAHIM_NAME);
        break;
      case 'wake':
        say(pick(RAHIM_LINES.wake, k), RAHIM_NAME);
        audio.play('shout', { at: { x: hx, z: hz } });
        audio.play('alert', { at: { x: hx, z: hz } });
        // A real alarm event: the patrol hears it and hurries to the house.
        runtime.noise.emit({ x: hx, y: hy, z: hz, radius: 26, severity: 1, source: 'alarm', byPlayer: false }, runtime.simTime);
        useRunStore.getState().setRahimAwake(true);
        break;
      case 'sleep':
        useRunStore.getState().setRahimAwake(false);
        if (near) say(pick(RAHIM_LINES.settle, k), RAHIM_NAME);
        break;
      case 'grab':
        say(RAHIM_LINES.grab[0], RAHIM_NAME);
        triggerCaught(runtime, 'caught', 'rahim');
        return;
    }
    if (sim.s.state === 'awake' && inside) {
      const left = Math.max(0, Math.ceil(RAHIM_SLEEPER.grabAfter - sim.s.intruderTime));
      if (left !== sim.lastGrabShown) {
        sim.lastGrabShown = left;
        useRunStore.getState().setRahimGrabIn(left);
      }
    } else if (sim.lastGrabShown !== -1) {
      sim.lastGrabShown = -1;
      useRunStore.getState().setRahimGrabIn(null);
    }

    if (sim.s.state === 'asleep') {
      sim.snoreTimer -= dt;
      if (sim.snoreTimer <= 0) {
        sim.snoreTimer = 9 + (runtime.simTime % 5);
        if (near) {
          audio.play('snore', { at: { x: hx, z: hz } });
          if (Math.hypot(p.x - hx, p.z - hz) < 5) say(pick(RAHIM_LINES.snore, k), RAHIM_NAME);
        }
      }
    }
    sim.npc.state = sim.s.state;
    sim.npc.suspicion = sim.s.state === 'awake' ? 100 : sim.s.suspicion;
    setAction(sim.driver, sim.s.state === 'awake' ? 'shout' : sim.s.state === 'stirring' ? 'look-around' : null);
  });

  useFrame((_, rawDt) => {
    if (useAppStore.getState().paused) return;
    const dt = Math.min(rawDt, 0.1);
    sim.awakeBlend = damp(sim.awakeBlend, sim.s.state === 'awake' ? 1 : 0, 4, dt);
    const g = poseRef.current;
    if (!g) return;
    const a = sim.awakeBlend;
    // Lying on the cot (rotated onto his back) → standing beside it, facing the room.
    g.rotation.x = -Math.PI / 2 * (1 - a);
    g.position.set(0, 0.22 * (1 - a) - 0.49 * a, 0.85 * (1 - a));
    g.position.x = -0.85 * a;
    if (sim.s.state === 'stirring') g.rotation.z = Math.sin(runtime.simTime * 2) * 0.15;
    else g.rotation.z = 0;
  });

  return (
    <group position={RAHIM_COT} rotation={[0, HOUSES.rahim.rotY, 0]}>
      <group ref={poseRef}>
        <HumanRig driver={sim.driver} look={RAHIM_LOOK} />
      </group>
    </group>
  );
}
