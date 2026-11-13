import { useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, MeshBasicMaterial, SpriteMaterial, Vector3, type Group, type Mesh, type Sprite } from 'three';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { dampAngle } from '../../lib/math';
import { useAppStore } from '../../state/useAppStore';
import { useGameRuntime, type GameRuntime, type NpcRuntime } from '../GameRuntime';
import { createBrain, NPC_SPEEDS, stepBrain, VILLAGER_BRAIN_DEFAULTS, type BarkId, type BrainConfig, type HeardPercept, type XZ } from '../ai/npcBrain';
import type { NavGraph } from '../ai/navGraph';
import { exposureAt, inViewCone, sightSuspicionRate, VILLAGER_SIGHT } from '../ai/perception';
import { hearingStrength, type NoiseEvent } from '../systems/noise';
import { NPC_COLLIDER, PLAYER_COLLIDER } from '../physics/queries';
import { audio } from '../audio/AudioManager';
import { say } from '../systems/nightActions';
import { HumanRig, type Appearance } from './HumanRig';
import { nightBody } from '../systems/nightBody';
import { setAction, type RigDriver } from './rigTypes';

type KinematicController = ReturnType<ReturnType<typeof useRapier>['world']['createCharacterController']>;

const SIGHT_INTERVAL = 0.1;
const EYE_HEIGHT = 1.55;

function iconTexture(symbol: string, color: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#17222f';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 32, 35);
  }
  return new CanvasTexture(c);
}

/** Flat fan on the ground showing the NPC's field of view — makes detection readable and fair. */
function coneGeometry(range: number, fov: number): BufferGeometry {
  const seg = 16;
  const pos = new Float32Array((seg + 2) * 3);
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = -fov / 2 + (fov * i) / seg;
    pos.set([Math.sin(a) * range, 0, Math.cos(a) * range], (i + 1) * 3);
    if (i < seg) idx.push(0, i + 1, i + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export type PatrolNpcConfig = {
  id: string;
  nameBn: string;
  look: Appearance;
  route: readonly XZ[];
  nav: NavGraph;
  lights: readonly { x: number; z: number; radius: number }[];
  /** Player standing here is out of bounds for this NPC (safe exit). */
  isSafe: (p: XZ) => boolean;
  barks: Record<BarkId, readonly string[]>;
  /** When false the NPC does not build suspicion from sight (e.g. market watchman before an alarm). */
  sightEnabled?: () => boolean;
  /** Which noise events this NPC reacts to (default: all). */
  hearingFilter?: (e: NoiseEvent) => boolean;
  onAlerted?: (rt: GameRuntime) => void;
  onCaught: (rt: GameRuntime) => void;
  /** Sprint speed override (m/s); defaults to NPC_SPEEDS.run. */
  runSpeed?: number;
};

/**
 * Patrol NPC (মজনু মিয়া at night, the market watchman in the bazaar). Real perception (FOV +
 * line-of-sight raycast + light exposure + posture; hearing from world noise events with wall
 * muffling), FSM brain, nav-graph pathfinding, Rapier kinematic character controller.
 */
export function PatrolNpc({ config }: { config: PatrolNpcConfig }) {
  const runtime = useGameRuntime();
  const { world, rapier, colliderStates } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const visualRef = useRef<Group>(null);
  const iconRef = useRef<Sprite>(null);
  const coneRef = useRef<Mesh>(null);
  const controllerRef = useRef<KinematicController | null>(null);

  // Tonight's plan (Stage 5, systems/villageLife.ts): the village patrol varies its route, pace
  // and sharpness from night 2; the market watchman's pace follows the bazaar situation.
  const plan = useMemo(() => nightBody.current.plan, []);
  const village = config.id === 'mojnu';
  const cfg: BrainConfig = useMemo(
    () => ({ ...VILLAGER_BRAIN_DEFAULTS, route: village && plan.patrol === 'reverse' ? [...config.route].reverse() : config.route }),
    [config.route, village, plan],
  );
  const sight = useMemo(() => ({ ...VILLAGER_SIGHT, viewDistance: VILLAGER_SIGHT.viewDistance * (village ? plan.sightMult : 1) }), [village, plan]);
  const suspicionMult = village ? plan.suspicionMult : 1;
  const walkMult = village ? plan.patrolSpeedMult : 1;
  const runMult = config.id === 'watchman' ? plan.watchmanSpeedMult : 1;
  const sim = useMemo(() => {
    const start = config.route[0] as XZ;
    return {
      brain: createBrain(),
      driver: { horizontalSpeed: 0, mode: 'idle', action: null, actionTime: 0 } as RigDriver,
      heading: Math.PI,
      sightTimer: 0,
      sightRate: 0,
      lastNoiseId: 0,
      path: [] as XZ[],
      pathTarget: null as XZ | null,
      repathTimer: 0,
      lastBarkAt: -99,
      npc: { id: config.id, nameBn: config.nameBn, position: new Vector3(start.x, 0, start.z), facing: new Vector3(0, 0, -1), state: 'patrol', suspicion: 0 } as NpcRuntime,
      ray: new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }),
      move: { x: 0, y: 0, z: 0 },
    };
  }, [rapier, config]);

  const visuals = useMemo(
    () => ({
      question: new SpriteMaterial({ map: iconTexture('?', '#e3ba70'), depthTest: false, transparent: true }),
      bang: new SpriteMaterial({ map: iconTexture('!', '#d8583e'), depthTest: false, transparent: true }),
      cone: coneGeometry(sight.viewDistance, sight.fov),
      coneCalm: new MeshBasicMaterial({ color: '#f2ad55', transparent: true, opacity: 0.1, depthWrite: false, side: DoubleSide }),
      coneAlert: new MeshBasicMaterial({ color: '#d8583e', transparent: true, opacity: 0.18, depthWrite: false, side: DoubleSide }),
    }),
    [sight.viewDistance, sight.fov],
  );
  useEffect(
    () => () => {
      visuals.question.map?.dispose();
      visuals.bang.map?.dispose();
      visuals.question.dispose();
      visuals.bang.dispose();
      visuals.cone.dispose();
      visuals.coneCalm.dispose();
      visuals.coneAlert.dispose();
    },
    [visuals],
  );

  useEffect(() => {
    const c = world.createCharacterController(0.02);
    c.enableSnapToGround(0.3);
    c.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    c.setSlideEnabled(true);
    controllerRef.current = c;
    return () => {
      controllerRef.current = null;
      world.removeCharacterController(c);
    };
  }, [world]);

  useEffect(() => {
    runtime.npcs.set(config.id, sim.npc);
    sim.lastNoiseId = runtime.noise.lastId;
    return () => {
      runtime.npcs.delete(config.id);
    };
  }, [runtime, sim, config.id]);

  /** Ray between two points; true if solid world geometry blocks it (ignores player/NPC capsules). */
  const blocked = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean => {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.05) return false;
    sim.ray.origin.x = ax;
    sim.ray.origin.y = ay;
    sim.ray.origin.z = az;
    sim.ray.dir.x = dx / len;
    sim.ray.dir.y = dy / len;
    sim.ray.dir.z = dz / len;
    const hit = world.castRay(sim.ray, len - 0.05, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, (c) => {
      const name = colliderStates.get(c.handle)?.object.name;
      return name !== PLAYER_COLLIDER && name !== NPC_COLLIDER;
    });
    return hit !== null;
  };

  useBeforePhysicsStep(() => {
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const controller = controllerRef.current;
    if (!body || !collider || !controller) return;
    const dt = world.timestep;
    const b = sim.brain;
    const p = body.translation();
    const npcPos = { x: p.x, z: p.z };
    const player = runtime.player;
    const playerPresent = player.body !== null && !player.script;

    // ---- Sight (10 Hz raycast; rate held between samples) ----
    sim.sightTimer += dt;
    if (sim.sightTimer >= SIGHT_INTERVAL) {
      sim.sightTimer = 0;
      sim.sightRate = 0;
      // Beyond the village edge the patrol does not pursue or build suspicion (safe exit, README §7).
      const sightOn = config.sightEnabled ? config.sightEnabled() : true;
      if (sightOn && playerPresent && !config.isSafe({ x: player.position.x, z: player.position.z })) {
        const crouched = player.mode === 'crouch-idle' || player.mode === 'crouch-walk';
        const dx = player.position.x - p.x;
        const dz = player.position.z - p.z;
        const cone = { dx, dz, facingX: sim.npc.facing.x, facingZ: sim.npc.facing.z, crouched };
        if (inViewCone(cone, sight)) {
          const targetY = player.position.y + (crouched ? 0.7 : 1.15);
          const los = !blocked(p.x, p.y + EYE_HEIGHT, p.z, player.position.x, targetY, player.position.z);
          if (los) {
            const exposure = exposureAt(player.position.x, player.position.z, [...config.lights, { x: p.x, z: p.z, radius: 3.5 }]);
            sim.sightRate = sightSuspicionRate({ ...cone, running: player.mode === 'run', exposure, lineOfSight: true }, sight) * suspicionMult;
          }
        }
      }
    }

    // ---- Hearing: strongest new noise event this step ----
    let heard: HeardPercept | null = null;
    const events = runtime.noise.since(sim.lastNoiseId, runtime.simTime);
    sim.lastNoiseId = runtime.noise.lastId;
    for (const e of events) {
      if (config.hearingFilter && !config.hearingFilter(e)) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d >= e.radius) continue;
      const occluded = blocked(p.x, p.y + EYE_HEIGHT, p.z, e.x, e.y + 0.5, e.z);
      const strength = hearingStrength(d, e.radius, occluded);
      if (strength <= 0) continue;
      const alarm = e.source === 'alarm';
      if (!heard || strength * e.severity > heard.strength * heard.severity) heard = { pos: { x: e.x, z: e.z }, strength, severity: e.severity, alarm };
    }

    const sees = sim.sightRate > 0;
    const out = stepBrain(
      b,
      {
        npcPos,
        sightRate: sim.sightRate,
        playerPos: sees ? { x: player.position.x, z: player.position.z } : null,
        distanceToPlayer: Math.hypot(player.position.x - p.x, player.position.z - p.z),
        heard,
        targetSafe: playerPresent && config.isSafe({ x: player.position.x, z: player.position.z }),
      },
      dt,
      cfg,
    );

    // ---- Reactions: barks, audio, run bookkeeping ----
    if (out.entered === 'alerted') {
      config.onAlerted?.(runtime);
      audio.play('alert', { at: npcPos });
      audio.play('shout', { at: npcPos });
    } else if (out.entered === 'suspicious' || out.entered === 'investigating') {
      audio.play('suspicious', { at: npcPos });
    }
    if (out.bark && runtime.simTime - sim.lastBarkAt > 1.2) {
      const lines = config.barks[out.bark];
      const dPlayer = Math.hypot(player.position.x - p.x, player.position.z - p.z);
      if (dPlayer < 26) say(lines[Math.floor(runtime.simTime * 7) % lines.length] ?? lines[0]!, config.nameBn, { x: p.x, z: p.z });
      sim.lastBarkAt = runtime.simTime;
    }
    if (out.caught) {
      setAction(sim.driver, 'shout');
      config.onCaught(runtime);
      return;
    }

    // ---- Locomotion with nav-graph pathfinding ----
    let speed = (out.pace === 'run' && config.runSpeed !== undefined ? config.runSpeed : NPC_SPEEDS[out.pace]) * (out.pace === 'run' ? runMult : walkMult);
    let dirX = 0;
    let dirZ = 0;
    if (out.target && speed > 0) {
      sim.repathTimer -= dt;
      const targetMoved = !sim.pathTarget || Math.hypot(sim.pathTarget.x - out.target.x, sim.pathTarget.z - out.target.z) > 1;
      if (targetMoved || sim.repathTimer <= 0 || sim.path.length === 0) {
        sim.path = config.nav.findPath(npcPos, out.target);
        sim.pathTarget = { ...out.target };
        sim.repathTimer = 0.5;
      }
      let next = sim.path[0];
      while (next && sim.path.length > 1 && Math.hypot(next.x - p.x, next.z - p.z) < 0.5) {
        sim.path.shift();
        next = sim.path[0];
      }
      if (next) {
        const dx = next.x - p.x;
        const dz = next.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.05) {
          dirX = dx / d;
          dirZ = dz / d;
          speed = Math.min(speed, d / dt);
        } else speed = 0;
      }
    } else speed = 0;

    sim.move.x = dirX * speed * dt;
    sim.move.y = -1 * dt;
    sim.move.z = dirZ * speed * dt;
    controller.computeColliderMovement(collider, sim.move, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, (c) => colliderStates.get(c.handle)?.object.name !== PLAYER_COLLIDER);
    const moved = controller.computedMovement();
    const nx = p.x + moved.x;
    const ny = Math.max(0, p.y + moved.y);
    const nz = p.z + moved.z;
    body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    const actual = Math.hypot(moved.x, moved.z) / dt;

    // Facing: movement direction, or the thing it is looking at.
    let targetHeading = sim.heading;
    if (actual > 0.1) targetHeading = Math.atan2(moved.x, moved.z);
    else if (out.lookAt) targetHeading = Math.atan2(out.lookAt.x - nx, out.lookAt.z - nz);
    sim.heading = dampAngle(sim.heading, targetHeading, out.pace === 'run' ? 10 : 5, dt);
    sim.npc.facing.set(Math.sin(sim.heading), 0, Math.cos(sim.heading));
    sim.npc.position.set(nx, ny, nz);
    sim.npc.state = b.state;
    sim.npc.suspicion = b.suspicion;

    sim.driver.horizontalSpeed = actual;
    sim.driver.mode = actual < 0.15 ? 'idle' : actual > 3.5 ? 'run' : 'walk';
    const action = b.state === 'alerted' ? 'shout' : b.state === 'suspicious' || b.state === 'searching' || (b.state === 'investigating' && actual < 0.15) ? 'look-around' : null;
    setAction(sim.driver, action);
  });

  useFrame(({ clock }) => {
    if (visualRef.current) visualRef.current.rotation.y = sim.heading;
    const s = sim.brain.state;
    const icon = iconRef.current;
    if (icon) {
      const show = s !== 'patrol' && s !== 'idle' && s !== 'returning';
      icon.visible = show;
      icon.material = s === 'alerted' || s === 'chasing' ? visuals.bang : visuals.question;
      const pulse = useAppStore.getState().settings.reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 8) * 0.08;
      icon.scale.setScalar(0.42 * pulse);
    }
    const cone = coneRef.current;
    if (cone) {
      cone.rotation.y = sim.heading;
      cone.material = s === 'alerted' || s === 'chasing' ? visuals.coneAlert : visuals.coneCalm;
    }
  });

  const start = config.route[0] as XZ;
  return (
    <>
      <RigidBody ref={bodyRef} name={`npc-${config.id}`} type="kinematicPosition" colliders={false} position={[start.x, 0.05, start.z]} enabledRotations={[false, false, false]}>
        <CapsuleCollider ref={colliderRef} name={NPC_COLLIDER} args={[0.45, 0.35]} position={[0, 0.8, 0]} />
        <group ref={visualRef}>
          <HumanRig driver={sim.driver} look={config.look} />
        </group>
        <sprite ref={iconRef} position={[0, 2.35, 0]} material={visuals.question} visible={false} renderOrder={10} />
        <mesh ref={coneRef} geometry={visuals.cone} material={visuals.coneCalm} position={[0, 0.06, 0]} renderOrder={2} />
      </RigidBody>
    </>
  );
}
