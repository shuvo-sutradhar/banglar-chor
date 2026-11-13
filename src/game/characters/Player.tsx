import { useEffect, useMemo, useRef } from 'react';
import { CircleGeometry, MeshBasicMaterial, type Group, CanvasTexture } from 'three';
import { useFrame } from '@react-three/fiber';
import {
  CapsuleCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier';
import { dampAngle } from '../../lib/math';
import { useAppStore } from '../../state/useAppStore';
import { useHudStore } from '../../state/useHudStore';
import { useGameRuntime } from '../GameRuntime';
import { PLAYER_SPAWN, PLAYER_TUNING } from '../data/tuning';
import { cameraRelativeDirection, resolveMovementMode, stepHorizontalVelocity, targetSpeedFor, type MovementMode, type Vec2 } from '../physics/motorMath';
import { PLAYER_COLLIDER } from '../physics/queries';
import { ThiefModel } from './ThiefModel';
import { setAction } from './rigTypes';
import { FOOTSTEP_NOISE } from '../systems/noise';
import { audio } from '../audio/AudioManager';

type KinematicController = ReturnType<ReturnType<typeof useRapier>['world']['createCharacterController']>;

function blobShadowMaterial(): MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false });
}

/**
 * Player = Rapier kinematic capsule driven by Rapier's KinematicCharacterController
 * (collide-and-slide, autostep, snap-to-ground, slope limit). Movement integrates in
 * `useBeforePhysicsStep` at the fixed physics rate, so speed is frame-rate independent
 * and pausing the physics world pauses the player.
 */
export function Player({ spawn = PLAYER_SPAWN }: { spawn?: readonly [number, number, number] }) {
  const runtime = useGameRuntime();
  const { world, rapier } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const visualRef = useRef<Group>(null);
  const controllerRef = useRef<KinematicController | null>(null);

  const motor = useMemo(
    () => ({
      velocity: { x: 0, z: 0 } as Vec2,
      desired: { x: 0, z: 0 } as Vec2,
      direction: { x: 0, z: 0 } as Vec2,
      move: { x: 0, y: 0 },
      translation: { x: 0, y: 0, z: 0 },
      verticalVelocity: 0,
      grounded: true,
      /** Facing -Z (into the village) at spawn. */
      targetHeading: Math.PI,
      heading: Math.PI,
      lastMode: 'idle' as MovementMode,
      strideAccum: 0,
    }),
    [],
  );

  const shadow = useMemo(() => ({ geometry: new CircleGeometry(0.5, 16), material: blobShadowMaterial() }), []);
  useEffect(
    () => () => {
      shadow.geometry.dispose();
      shadow.material.map?.dispose();
      shadow.material.dispose();
    },
    [shadow],
  );

  useEffect(() => {
    const c = world.createCharacterController(PLAYER_TUNING.controllerOffset);
    c.enableAutostep(PLAYER_TUNING.autostepHeight, PLAYER_TUNING.autostepMinWidth, false);
    c.enableSnapToGround(PLAYER_TUNING.snapToGround);
    c.setMaxSlopeClimbAngle((PLAYER_TUNING.maxSlopeClimbDeg * Math.PI) / 180);
    c.setSlideEnabled(true);
    c.setApplyImpulsesToDynamicBodies(false);
    controllerRef.current = c;
    return () => {
      controllerRef.current = null;
      world.removeCharacterController(c);
    };
  }, [world]);

  useEffect(() => {
    const p = runtime.player;
    p.body = bodyRef.current;
    p.collider = colliderRef.current;
    p.visual = visualRef.current;
    p.position.set(...spawn);
    p.forward.set(0, 0, -1);
    p.mode = 'idle';
    p.horizontalSpeed = 0;
    p.elapsed = 0;
    runtime.input.onCrouchChange = (c) => useHudStore.getState().setCrouched(c);
    return () => {
      p.body = null;
      p.collider = null;
      p.visual = null;
      runtime.input.onCrouchChange = null;
    };
  }, [runtime, spawn]);

  useBeforePhysicsStep(() => {
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const controller = controllerRef.current;
    if (!body || !collider || !controller) return;
    const dt = world.timestep;
    const { input, camera, player } = runtime;
    player.elapsed += dt;
    runtime.simTime += dt;

    // Scripted move (crawling through the sidh): follows a designed path through an opening
    // whose blocking collider is removed; bypasses the controller only for this cutscene-like move.
    const script = player.script;
    if (script) {
      script.t = Math.min(script.duration, script.t + dt);
      const u = script.t / script.duration;
      const segs = script.path.length - 1;
      const fi = Math.min(segs - 1e-6, u * segs);
      const i = Math.floor(fi);
      const k = fi - i;
      const pa = script.path[i]!;
      const pb = script.path[i + 1]!;
      const nx = pa[0] + (pb[0] - pa[0]) * k;
      const ny = pa[1] + (pb[1] - pa[1]) * k;
      const nz = pa[2] + (pb[2] - pa[2]) * k;
      const prev = body.translation();
      body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
      player.horizontalSpeed = Math.hypot(nx - prev.x, nz - prev.z) / dt;
      player.position.set(nx, ny, nz);
      motor.targetHeading = script.headingY;
      motor.velocity.x = motor.velocity.z = 0;
      setAction(player, script.action);
      if (script.t >= script.duration) {
        player.script = null;
        setAction(player, null);
        script.onDone();
      }
      return;
    }

    input.readMove(motor.move);
    const magnitude = cameraRelativeDirection(motor.move.x, motor.move.y, camera.yaw, motor.direction);
    const mode = resolveMovementMode({ inputMagnitude: magnitude, sprintHeld: input.sprintHeld, crouched: input.crouched, grounded: motor.grounded });
    // Carried weight slows walking and especially sprinting (greed vs. escape, README §8).
    const speed = targetSpeedFor(mode, magnitude, player.loadRatio);
    motor.desired.x = motor.direction.x * speed;
    motor.desired.z = motor.direction.z * speed;
    stepHorizontalVelocity(motor.velocity, motor.desired, dt);

    if (motor.grounded) motor.verticalVelocity = -1;
    else motor.verticalVelocity = Math.max(motor.verticalVelocity - PLAYER_TUNING.gravity * dt, -PLAYER_TUNING.maxFallSpeed);

    motor.translation.x = motor.velocity.x * dt;
    motor.translation.y = motor.verticalVelocity * dt;
    motor.translation.z = motor.velocity.z * dt;
    controller.computeColliderMovement(collider, motor.translation, rapier.QueryFilterFlags.EXCLUDE_SENSORS);
    const moved = controller.computedMovement();
    motor.grounded = controller.computedGrounded();

    // Velocity is NOT reduced to the blocked motion: keeping the intended speed lets the
    // controller slide along walls and climb ramps reliably. Animation uses *actual* speed.
    const actualVx = moved.x / dt;
    const actualVz = moved.z / dt;
    const actual = Math.hypot(actualVx, actualVz);

    const p = body.translation();
    let nx = p.x + moved.x;
    let ny = p.y + moved.y;
    let nz = p.z + moved.z;
    if (ny < PLAYER_TUNING.killPlaneY) {
      // Safety net only (should never trigger): return to spawn rather than fall forever.
      [nx, ny, nz] = spawn;
      body.setTranslation({ x: nx, y: ny, z: nz }, true);
      motor.velocity.x = motor.velocity.z = motor.verticalVelocity = 0;
    } else {
      body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    }

    player.position.set(nx, ny, nz);
    player.horizontalSpeed = actual;
    player.carry = player.loadRatio;
    player.grounded = motor.grounded;
    // Report the animation mode from real motion so "walking into a wall" reads as idle.
    const effectiveMode: MovementMode = actual < 0.15 && mode !== 'airborne' ? (input.crouched ? 'crouch-idle' : 'idle') : mode;
    player.mode = effectiveMode;
    // Face where the player is steering (responsive even when sliding along / blocked by a wall);
    // fall back to the actual motion when there is no input (e.g. momentum after release).
    if (player.faceHeading !== null) motor.targetHeading = player.faceHeading;
    else if (magnitude > 0.1 && motor.grounded) motor.targetHeading = Math.atan2(motor.direction.x, motor.direction.z);
    else if (actual > 0.15) motor.targetHeading = Math.atan2(actualVx, actualVz);
    if (effectiveMode !== motor.lastMode) {
      motor.lastMode = effectiveMode;
      useHudStore.getState().setMovementMode(effectiveMode);
    }
    if (player.action === 'pickup' && player.actionTime > 0.6) setAction(player, null);

    // Footsteps are real noise events at the player's position (README §7).
    motor.strideAccum += actual * dt;
    if (motor.strideAccum >= FOOTSTEP_NOISE.strideMeters && motor.grounded) {
      motor.strideAccum = 0;
      const f = effectiveMode === 'run' ? FOOTSTEP_NOISE.run : effectiveMode === 'crouch-walk' ? FOOTSTEP_NOISE.crouch : FOOTSTEP_NOISE.walk;
      const radius = f.radius * (1 + FOOTSTEP_NOISE.loadRadiusBoost * player.loadRatio);
      runtime.noise.emit({ x: nx, y: ny, z: nz, radius, severity: f.severity, source: 'footstep', byPlayer: true }, runtime.simTime);
      audio.play('footstep', { gain: effectiveMode === 'run' ? 0.8 : effectiveMode === 'crouch-walk' ? 0.25 : 0.5 });
    }
  });

  useFrame((_, rawDt) => {
    if (useAppStore.getState().paused) return;
    const dt = Math.min(rawDt, 0.1);
    // Big reversals turn faster so a U-turn never feels sluggish; small corrections stay smooth.
    const diff = Math.abs(Math.atan2(Math.sin(motor.targetHeading - motor.heading), Math.cos(motor.targetHeading - motor.heading)));
    motor.heading = dampAngle(motor.heading, motor.targetHeading, PLAYER_TUNING.turnRate * (diff > Math.PI / 2 ? 1.5 : 1), dt);
    if (visualRef.current) visualRef.current.rotation.y = motor.heading;
    runtime.player.forward.set(Math.sin(motor.heading), 0, Math.cos(motor.heading));
  });

  const { capsuleHalfHeight: hh, capsuleRadius: r } = PLAYER_TUNING;
  return (
    <RigidBody ref={bodyRef} name="player" type="kinematicPosition" colliders={false} position={[...spawn]} enabledRotations={[false, false, false]}>
      <CapsuleCollider ref={colliderRef} name={PLAYER_COLLIDER} args={[hh, r]} position={[0, hh + r, 0]} />
      <group ref={visualRef} rotation={[0, Math.PI, 0]}>
        <ThiefModel driver={runtime.player} />
      </group>
      <mesh geometry={shadow.geometry} material={shadow.material} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} scale={[1.1, 1.1, 1]} renderOrder={1} />
    </RigidBody>
  );
}
