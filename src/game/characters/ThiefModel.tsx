import { useRef } from 'react';
import type { Group } from 'three';
import { useFrame } from '@react-three/fiber';
import { damp } from '../../lib/math';
import { useAppStore } from '../../state/useAppStore';
import type { PlayerRuntime } from '../GameRuntime';
import { UNIT_BOX, UNIT_CYLINDER, UNIT_SPHERE } from '../world/sharedGeometry';
import { mat } from '../world/materials';

/** Leg segment lengths (m). Hip height = (THIGH + SHIN) * cos(bend). */
const THIGH = 0.43;
const SHIN = 0.43;
const LEG = THIGH + SHIN;

type Pose = {
  hipHeight: number;
  /** Leg swing amplitude (rad) for the gait. */
  swing: number;
  lean: number;
  armSwing: number;
  elbow: number;
  /** Arms raised forward in a cartoon sneak. */
  sneakArms: number;
  bob: number;
};

const POSES: Record<'idle' | 'walk' | 'run' | 'crouchIdle' | 'crouchWalk' | 'air', Pose> = {
  idle: { hipHeight: 0.84, swing: 0, lean: 0.02, armSwing: 0, elbow: 0.15, sneakArms: 0, bob: 0 },
  walk: { hipHeight: 0.83, swing: 0.42, lean: 0.06, armSwing: 0.45, elbow: 0.3, sneakArms: 0, bob: 0.035 },
  run: { hipHeight: 0.8, swing: 0.75, lean: 0.24, armSwing: 0.9, elbow: 1.35, sneakArms: 0, bob: 0.07 },
  crouchIdle: { hipHeight: 0.56, swing: 0, lean: 0.5, armSwing: 0, elbow: 1.0, sneakArms: 0.9, bob: 0 },
  crouchWalk: { hipHeight: 0.56, swing: 0.32, lean: 0.5, armSwing: 0.15, elbow: 1.0, sneakArms: 0.9, bob: 0.025 },
  air: { hipHeight: 0.8, swing: 0.1, lean: 0.05, armSwing: 0.2, elbow: 0.6, sneakArms: 0.4, bob: 0 },
};

function poseFor(runtime: PlayerRuntime): Pose {
  switch (runtime.mode) {
    case 'walk':
      return POSES.walk;
    case 'run':
      return POSES.run;
    case 'crouch-idle':
      return POSES.crouchIdle;
    case 'crouch-walk':
      return POSES.crouchWalk;
    case 'airborne':
      return POSES.air;
    default:
      return POSES.idle;
  }
}

/**
 * Original low-poly thief: oiled shoulders, checked lungi, red gamcha round the neck,
 * green gamcha headband and a proud moustache. Procedurally animated:
 * - The gait phase advances by *measured* ground speed divided by stride length,
 *   so feet plant instead of sliding, at any speed (walk, run, sneaking, carried load).
 * - All pose parameters blend with exponential damping, so mode switches never pop.
 */
export function ThiefModel({ runtime }: { runtime: PlayerRuntime }) {
  const pelvis = useRef<Group>(null);
  const spine = useRef<Group>(null);
  const head = useRef<Group>(null);
  const thighL = useRef<Group>(null);
  const thighR = useRef<Group>(null);
  const shinL = useRef<Group>(null);
  const shinR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const foreL = useRef<Group>(null);
  const foreR = useRef<Group>(null);
  const lungi = useRef<Group>(null);

  const anim = useRef({ phase: 0, hipHeight: 0.84, swing: 0, lean: 0, armSwing: 0, elbow: 0.15, sneak: 0, bob: 0, breath: 0 });

  useFrame((_, rawDt) => {
    if (useAppStore.getState().paused) return;
    const dt = Math.min(rawDt, 0.1);
    const a = anim.current;
    const pose = poseFor(runtime);
    const k = 10;
    a.hipHeight = damp(a.hipHeight, pose.hipHeight, k, dt);
    a.lean = damp(a.lean, pose.lean, k, dt);
    a.elbow = damp(a.elbow, pose.elbow, k, dt);
    a.sneak = damp(a.sneak, pose.sneakArms, 8, dt);
    a.bob = damp(a.bob, pose.bob, k, dt);
    // Gait amplitude follows actual speed so a stalled player (pushing a wall) stops striding.
    const speed = runtime.horizontalSpeed;
    const speedFactor = Math.min(1, speed / 0.6);
    a.swing = damp(a.swing, pose.swing * speedFactor, k, dt);
    a.armSwing = damp(a.armSwing, pose.armSwing * speedFactor, k, dt);

    // Stride: one full gait cycle covers two steps; each step length ~ 2 * LEG * sin(swing).
    const stepLength = Math.max(0.12, 2 * LEG * Math.sin(Math.max(a.swing, 0.05)));
    a.phase += (speed / (2 * stepLength)) * Math.PI * 2 * dt;
    if (speed < 0.05) {
      // Ease the legs back to neutral at rest instead of freezing mid-stride.
      a.phase = damp(a.phase, Math.round(a.phase / Math.PI) * Math.PI, 6, dt);
    }
    a.breath += dt;

    const s = Math.sin(a.phase);
    const bend = Math.acos(Math.min(0.999, a.hipHeight / LEG));
    const bob = Math.abs(Math.cos(a.phase)) * a.bob;

    if (pelvis.current) pelvis.current.position.y = a.hipHeight + bob;
    if (spine.current) {
      spine.current.rotation.x = a.lean;
      const breathe = 1 + Math.sin(a.breath * 2.2) * 0.012 * (1 - Math.min(1, speed));
      spine.current.scale.set(1, breathe, 1);
    }
    if (head.current) head.current.rotation.x = -a.lean * 0.6 + Math.sin(a.breath * 1.1) * 0.02;

    // Legs: thigh forward = negative X rotation in this rig. Knee lifts on the swing-forward half.
    const legPose = (thigh: Group | null, shin: Group | null, side: number) => {
      if (!thigh || !shin) return;
      const swing = s * side * a.swing;
      const lift = Math.max(0, -Math.cos(a.phase) * side) * a.swing * 1.4;
      thigh.rotation.x = -bend - swing - lift * 0.5;
      shin.rotation.x = 2 * bend + lift;
    };
    legPose(thighL.current, shinL.current, 1);
    legPose(thighR.current, shinR.current, -1);

    const armPose = (arm: Group | null, fore: Group | null, side: number) => {
      if (!arm || !fore) return;
      arm.rotation.x = s * side * a.armSwing - a.sneak;
      arm.rotation.z = side * (0.12 + a.sneak * 0.15);
      fore.rotation.x = -a.elbow - a.sneak * 0.3;
    };
    armPose(armL.current, foreL.current, -1);
    armPose(armR.current, foreR.current, 1);

    if (lungi.current) lungi.current.rotation.x = -a.swing * 0.15 * s;
  });

  const skin = mat('skinOily');
  return (
    <group>
      <group ref={pelvis} position={[0, 0.84, 0]}>
        {/* Legs */}
        {([
          [-0.11, thighL, shinL],
          [0.11, thighR, shinR],
        ] as const).map(([x, thighRef, shinRef]) => (
          <group key={x} ref={thighRef} position={[x, 0, 0]}>
            <mesh geometry={UNIT_CYLINDER} material={skin} position={[0, -THIGH / 2, 0]} scale={[0.13, THIGH, 0.13]} castShadow />
            <group ref={shinRef} position={[0, -THIGH, 0]}>
              <mesh geometry={UNIT_CYLINDER} material={skin} position={[0, -SHIN / 2, 0]} scale={[0.11, SHIN, 0.11]} castShadow />
              {/* Rubber sandal */}
              <mesh geometry={UNIT_BOX} material={mat('black')} position={[0, -SHIN - 0.01, 0.05]} scale={[0.12, 0.04, 0.26]} castShadow />
            </group>
          </group>
        ))}

        {/* Checked lungi */}
        <group ref={lungi}>
          <mesh geometry={UNIT_CYLINDER} material={mat('lungi')} position={[0, -0.2, 0]} scale={[0.5, 0.52, 0.42]} castShadow />
          <mesh geometry={UNIT_CYLINDER} material={mat('lungi')} position={[0, -0.44, 0]} scale={[0.56, 0.06, 0.48]} />
          {/* Tucked knot */}
          <mesh geometry={UNIT_SPHERE} material={mat('lungi')} position={[0, 0.02, 0.2]} scale={[0.12, 0.08, 0.08]} />
        </group>

        <group ref={spine} position={[0, 0.04, 0]}>
          <mesh geometry={UNIT_CYLINDER} material={skin} position={[0, 0.27, 0]} scale={[0.42, 0.54, 0.32]} castShadow />
          <mesh geometry={UNIT_SPHERE} material={skin} position={[0, 0.03, 0.02]} scale={[0.42, 0.22, 0.34]} />
          {/* Red gamcha round the neck with dangling ends */}
          <mesh geometry={UNIT_CYLINDER} material={mat('gamcha')} position={[0, 0.55, 0]} scale={[0.4, 0.09, 0.32]} />
          <mesh geometry={UNIT_BOX} material={mat('gamcha')} position={[0.12, 0.38, 0.17]} rotation={[0.1, 0, 0.15]} scale={[0.09, 0.3, 0.02]} />
          <mesh geometry={UNIT_BOX} material={mat('gamcha')} position={[-0.1, 0.4, -0.17]} rotation={[-0.1, 0, -0.2]} scale={[0.09, 0.26, 0.02]} />

          <group ref={head} position={[0, 0.64, 0.02]}>
            <mesh geometry={UNIT_CYLINDER} material={skin} position={[0, 0.03, 0]} scale={[0.12, 0.1, 0.12]} />
            <mesh geometry={UNIT_SPHERE} material={skin} position={[0, 0.22, 0]} scale={[0.36, 0.38, 0.36]} castShadow />
            {/* Hair + green gamcha headband (a cartoon thief's signature) */}
            <mesh geometry={UNIT_SPHERE} material={mat('black')} position={[0, 0.31, -0.03]} scale={[0.37, 0.24, 0.36]} />
            <mesh geometry={UNIT_CYLINDER} material={mat('gamchaHead')} position={[0, 0.29, 0]} scale={[0.39, 0.07, 0.39]} />
            <mesh geometry={UNIT_BOX} material={mat('gamchaHead')} position={[0, 0.27, -0.21]} rotation={[0.5, 0, 0.3]} scale={[0.06, 0.16, 0.02]} />
            {/* Face: eyes, nose, big moustache, ears */}
            {[-0.07, 0.07].map((x) => (
              <group key={x} position={[x, 0.24, 0.16]}>
                <mesh geometry={UNIT_SPHERE} material={mat('white')} scale={[0.07, 0.06, 0.04]} />
                <mesh geometry={UNIT_SPHERE} material={mat('black')} position={[0, 0, 0.017]} scale={[0.03, 0.035, 0.02]} />
              </group>
            ))}
            <mesh geometry={UNIT_SPHERE} material={skin} position={[0, 0.18, 0.18]} scale={[0.06, 0.08, 0.07]} />
            <mesh geometry={UNIT_BOX} material={mat('black')} position={[0, 0.12, 0.165]} rotation={[0, 0, 0]} scale={[0.2, 0.035, 0.04]} />
            <mesh geometry={UNIT_BOX} material={mat('black')} position={[0.11, 0.105, 0.16]} rotation={[0, 0, 0.5]} scale={[0.06, 0.03, 0.035]} />
            <mesh geometry={UNIT_BOX} material={mat('black')} position={[-0.11, 0.105, 0.16]} rotation={[0, 0, -0.5]} scale={[0.06, 0.03, 0.035]} />
            {[-0.18, 0.18].map((x) => (
              <mesh key={x} geometry={UNIT_SPHERE} material={skin} position={[x, 0.21, 0]} scale={[0.05, 0.09, 0.06]} />
            ))}
          </group>

          {/* Arms */}
          {([
            [-0.25, armL, foreL],
            [0.25, armR, foreR],
          ] as const).map(([x, armRef, foreRef]) => (
            <group key={x} ref={armRef} position={[x, 0.48, 0]}>
              <mesh geometry={UNIT_SPHERE} material={skin} scale={[0.15, 0.14, 0.15]} />
              <mesh geometry={UNIT_CYLINDER} material={skin} position={[0, -0.15, 0]} scale={[0.1, 0.3, 0.1]} castShadow />
              <group ref={foreRef} position={[0, -0.3, 0]}>
                <mesh geometry={UNIT_CYLINDER} material={skin} position={[0, -0.13, 0]} scale={[0.085, 0.27, 0.085]} castShadow />
                <mesh geometry={UNIT_SPHERE} material={skin} position={[0, -0.29, 0]} scale={[0.1, 0.11, 0.1]} />
              </group>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}
