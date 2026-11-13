import { useEffect, useMemo, useRef } from 'react';
import { Vector3, type Group } from 'three';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { dampAngle } from '../../lib/math';
import { useAppStore } from '../../state/useAppStore';
import { useRunStore } from '../../state/useRunStore';
import { useGameRuntime, type GameRuntime, type NpcRuntime } from '../GameRuntime';
import type { XZ } from '../ai/npcBrain';
import { NPC_COLLIDER, PLAYER_COLLIDER } from '../physics/queries';
import { MERCHANTS, type MerchantId } from '../data/merchants';
import { MERCHANT_CALLS, MERCHANT_GREETINGS, RAHIM_MARKET_LINES } from '../data/marketDialogue';
import { LOOT } from '../data/loot';
import { RAHIM_NAME } from '../data/dialogue';
import { STALLS, stallFront, stallKeeperSpot } from '../world/bazaarLayout';
import { Interactable } from '../world/Interactable';
import { openTrade, raiseMarketAlarm } from '../systems/marketActions';
import { say } from '../systems/nightActions';
import { HumanRig, type Appearance } from './HumanRig';
import { BOKUL_LOOK, HASHEM_LOOK, JALIL_LOOK, RAHIM_LOOK } from './appearances';
import { setAction, type RigDriver } from './rigTypes';

type KinematicController = ReturnType<ReturnType<typeof useRapier>['world']['createCharacterController']>;

/**
 * A shopper walking a loop with pauses, on a kinematic body + character controller (the player
 * bumps into them, they don't walk through stalls). `onStep` lets Rahim add recognition.
 */
export function AmbientWalker({
  id,
  look,
  route,
  speed = 1.2,
  pause = 2.5,
  startIndex = 0,
  onStep,
  nameBn,
}: {
  id: string;
  look: Appearance;
  route: readonly XZ[];
  speed?: number;
  pause?: number;
  startIndex?: number;
  nameBn?: string;
  onStep?: (rt: GameRuntime, pos: XZ, facing: XZ, dt: number, sim: { driver: RigDriver }) => void;
}) {
  const runtime = useGameRuntime();
  const { world, rapier, colliderStates } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const visualRef = useRef<Group>(null);
  const controllerRef = useRef<KinematicController | null>(null);
  const start = route[startIndex % route.length] as XZ;
  const sim = useMemo(
    () => ({
      wp: (startIndex + 1) % route.length,
      wait: 0,
      heading: 0,
      stuck: 0,
      driver: { horizontalSpeed: 0, mode: 'idle', action: null, actionTime: 0 } as RigDriver,
      move: { x: 0, y: 0, z: 0 },
      npc: nameBn ? ({ id, nameBn, position: new Vector3(start.x, 0, start.z), facing: new Vector3(0, 0, 1), state: 'patrol', suspicion: 0 } as NpcRuntime) : null,
    }),
    [route, startIndex, id, nameBn, start.x, start.z],
  );

  useEffect(() => {
    const c = world.createCharacterController(0.02);
    c.enableSnapToGround(0.3);
    c.setSlideEnabled(true);
    controllerRef.current = c;
    return () => {
      controllerRef.current = null;
      world.removeCharacterController(c);
    };
  }, [world]);

  useEffect(() => {
    if (!sim.npc) return;
    runtime.npcs.set(id, sim.npc);
    return () => {
      runtime.npcs.delete(id);
    };
  }, [runtime, sim, id]);

  useBeforePhysicsStep(() => {
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const controller = controllerRef.current;
    if (!body || !collider || !controller) return;
    const dt = world.timestep;
    const p = body.translation();
    const target = route[sim.wp] as XZ;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    let vx = 0;
    let vz = 0;
    if (sim.wait > 0) sim.wait -= dt;
    else if (d < 0.4) {
      sim.wait = pause;
      sim.wp = (sim.wp + 1) % route.length;
    } else {
      vx = (dx / d) * speed;
      vz = (dz / d) * speed;
    }
    sim.move.x = vx * dt;
    sim.move.y = -dt;
    sim.move.z = vz * dt;
    controller.computeColliderMovement(collider, sim.move, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, (c) => colliderStates.get(c.handle)?.object.name !== PLAYER_COLLIDER);
    const m = controller.computedMovement();
    const nx = p.x + m.x;
    const nz = p.z + m.z;
    body.setNextKinematicTranslation({ x: nx, y: Math.max(0, p.y + m.y), z: nz });
    const actual = Math.hypot(m.x, m.z) / dt;
    // Never stay wedged: skip to the next waypoint if blocked for a while.
    sim.stuck = vx || vz ? (actual < 0.2 ? sim.stuck + dt : 0) : 0;
    if (sim.stuck > 2) {
      sim.stuck = 0;
      sim.wp = (sim.wp + 1) % route.length;
    }
    if (actual > 0.1) sim.heading = Math.atan2(m.x, m.z);
    sim.driver.horizontalSpeed = actual;
    sim.driver.mode = actual > 0.15 ? 'walk' : 'idle';
    if (sim.npc) {
      sim.npc.position.set(nx, 0, nz);
      sim.npc.facing.set(Math.sin(sim.heading), 0, Math.cos(sim.heading));
    }
    onStep?.(runtime, { x: nx, z: nz }, { x: Math.sin(sim.heading), z: Math.cos(sim.heading) }, dt, sim);
  });

  useFrame((_, dt) => {
    if (!visualRef.current || useAppStore.getState().paused) return;
    visualRef.current.rotation.y = dampAngle(visualRef.current.rotation.y, sim.heading, 6, Math.min(dt, 0.1));
  });

  return (
    <RigidBody ref={bodyRef} name={`npc-${id}`} type="kinematicPosition" colliders={false} position={[start.x, 0.05, start.z]} enabledRotations={[false, false, false]}>
      <CapsuleCollider ref={colliderRef} name={NPC_COLLIDER} args={[0.45, 0.33]} position={[0, 0.8, 0]} />
      <group ref={visualRef}>
        <HumanRig driver={sim.driver} look={look} />
      </group>
    </RigidBody>
  );
}

/** Seated tea-stall customer (static, animated idle). */
export function SeatedVillager({ x, z, rotY, look }: { x: number; z: number; rotY: number; look: Appearance }) {
  const driver = useMemo<RigDriver>(() => ({ horizontalSpeed: 0, mode: 'idle', action: 'sit', actionTime: Math.abs(x * 7.1 + z * 3.3) % 5 }), [x, z]);
  return (
    <group position={[x, 0.02, z]} rotation={[0, rotY, 0]}>
      <HumanRig driver={driver} look={look} />
    </group>
  );
}

const MERCHANT_LOOKS: Record<MerchantId, Appearance> = { hashem: HASHEM_LOOK, jalil: JALIL_LOOK, bokul: BOKUL_LOOK };
const MERCHANT_STAGGER: Record<MerchantId, number> = { hashem: 1, jalil: 4.5, bokul: 8 };

/**
 * A merchant behind his/her counter: idle animation, calls to passers-by, greets on approach,
 * examines goods during a trade. The trade opens by walking up and pressing E / the action button.
 */
export function MerchantNpc({ id }: { id: MerchantId }) {
  const runtime = useGameRuntime();
  const stall = STALLS.find((s) => s.merchant === id)!;
  const spot = stallKeeperSpot(stall);
  const front = stallFront(stall, 1.0);
  const profile = MERCHANTS[id];
  const driver = useMemo<RigDriver>(() => ({ horizontalSpeed: 0, mode: 'idle', action: null, actionTime: 0 }), []);
  // Deterministic stagger so the three merchants do not call out in unison.
  const timers = useRef({ call: 5 + MERCHANT_STAGGER[id], greeted: false });

  useFrame((_, rawDt) => {
    if (useAppStore.getState().paused) return;
    const dt = Math.min(rawDt, 0.1);
    const active = useRunStore.getState().activeMerchant === id;
    const p = runtime.player.position;
    const near = Math.hypot(p.x - front.x, p.z - front.z) < 3.2;
    if (active) setAction(driver, 'examine');
    else if (driver.action === 'examine') setAction(driver, null);
    if (!active) {
      if (near && !timers.current.greeted) {
        timers.current.greeted = true;
        setAction(driver, 'wave');
        say(MERCHANT_GREETINGS[id][Math.floor(Math.random() * MERCHANT_GREETINGS[id].length)]!, profile.nameBn);
      }
      if (!near) timers.current.greeted = false;
      timers.current.call -= dt;
      if (timers.current.call <= 0) {
        timers.current.call = 9 + Math.random() * 8;
        setAction(driver, 'wave');
        if (Math.hypot(p.x - spot.x, p.z - spot.z) < 9) say(MERCHANT_CALLS[id][Math.floor(Math.random() * MERCHANT_CALLS[id].length)]!, profile.nameBn);
      }
      if ((driver.action === 'wave' || driver.action === 'shout') && driver.actionTime > 1.6) setAction(driver, null);
    }
  });

  return (
    <>
      <group position={[spot.x, 0.02, spot.z]} rotation={[0, stall.rotY, 0]}>
        <HumanRig driver={driver} look={MERCHANT_LOOKS[id]} />
      </group>
      <Interactable
        id={`merchant:${id}`}
        kind="talk"
        labelBn={`${profile.nameBn} — দরদাম করো`}
        position={[front.x, 1.1, front.z]}
        maxDistance={2.6}
        onInteract={() => openTrade(runtime, id)}
      />
    </>
  );
}

/**
 * রহিম চাচা at the haat. If he sees conspicuous items stolen from HIS house on you, a recognition
 * meter rises (warning at 35 → alarm at 100, max 32/s so there are ≥2 s to react). Moving out of
 * his view, crouching, or keeping your distance lets it fall again (D-036).
 */
export function RahimShopper({ route }: { route: readonly XZ[] }) {
  const meter = useRef({ value: 0, warned: false, alarmed: false, browseIn: 12 });
  const onStep = useMemo(
    () => (rt: GameRuntime, pos: XZ, facing: XZ, dt: number, sim: { driver: RigDriver }) => {
      const store = useRunStore.getState();
      const app = useAppStore.getState();
      const m = meter.current;
      const p = rt.player.position;
      const inv = store.run?.inventory ?? [];
      const visible = inv.filter((i) => i.sourceHouseId === 'rahim' && LOOT[i.lootId].conspicuous);
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      const d = Math.hypot(dx, dz);
      const cos = (dx * facing.x + dz * facing.z) / Math.max(d, 0.01);
      const crouched = rt.player.mode === 'crouch-idle' || rt.player.mode === 'crouch-walk';
      const range = crouched ? 4.5 : 7;
      const sees = !m.alarmed && app.phase !== 'caught' && visible.length > 0 && d < range && cos > Math.cos((60 * Math.PI) / 180);
      if (sees) {
        const strength = Math.max(...visible.map((i) => LOOT[i.lootId].recognizability));
        const rate = Math.min(32, 40 * strength * (1.4 - d / range) * (crouched ? 0.5 : 1));
        m.value = Math.min(100, m.value + rate * dt);
      } else m.value = Math.max(0, m.value - 12 * dt);

      if (!m.warned && m.value >= 35) {
        m.warned = true;
        say(RAHIM_MARKET_LINES.notice, RAHIM_NAME);
        setAction(sim.driver, 'look-around');
      }
      if (m.warned && !m.alarmed && m.value >= 70 && m.value - 32 * dt < 70) say(RAHIM_MARKET_LINES.closer, RAHIM_NAME);
      if (m.warned && m.value < 10) {
        m.warned = false;
        say(RAHIM_MARKET_LINES.calm, RAHIM_NAME);
        setAction(sim.driver, null);
      }
      if (!m.alarmed && m.value >= 100) {
        m.alarmed = true;
        setAction(sim.driver, 'shout');
        const it = visible[0];
        store.recordMarket('recognition', rt.simTime, 'rahim', it?.instanceId);
        raiseMarketAlarm(rt, RAHIM_NAME, RAHIM_MARKET_LINES.alarm);
      }
      // Idle chatter while shopping (only when the player is near).
      m.browseIn -= dt;
      if (m.browseIn <= 0) {
        m.browseIn = 14 + Math.random() * 8;
        if (d < 8 && !m.warned) say(RAHIM_MARKET_LINES.browsing[Math.floor(Math.random() * RAHIM_MARKET_LINES.browsing.length)]!, RAHIM_NAME);
      }
      const npc = rt.npcs.get('rahim-market');
      if (npc) {
        npc.suspicion = m.value;
        npc.state = m.alarmed ? 'alerted' : m.warned ? 'suspicious' : 'patrol';
      }
      store.setRahimRecognition(m.value);
    },
    [],
  );
  return <AmbientWalker id="rahim-market" nameBn={RAHIM_NAME} look={RAHIM_LOOK} route={route} speed={1.0} pause={3.2} onStep={onStep} />;
}
