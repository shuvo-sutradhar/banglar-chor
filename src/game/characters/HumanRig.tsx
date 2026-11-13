import { useRef, type ReactNode } from 'react';
import { MeshStandardMaterial, type Group, type Material } from 'three';
import { useFrame } from '@react-three/fiber';
import { timed } from '../perfCounters';
import { damp } from '../../lib/math';
import { useAppStore } from '../../state/useAppStore';
import { UNIT_BOX, UNIT_CYLINDER, UNIT_SPHERE } from '../world/sharedGeometry';
import { mat } from '../world/materials';
import type { RigDriver } from './rigTypes';

/** Leg segment lengths (m). Hip height = (THIGH + SHIN) * cos(bend). */
const THIGH = 0.43;
const SHIN = 0.43;
const LEG = THIGH + SHIN;

export type Appearance = {
  skin: Material;
  lower: Material;
  /** Shirt / genji over the torso; null = bare (the oiled thief). */
  top: Material | null;
  hair: Material;
  neckGamcha: Material | null;
  /** Headband material; shown when `cosmetic.headband` is set (or always if `alwaysHeadband`). */
  headband: Material | null;
  alwaysHeadband?: boolean;
  cap: Material | null;
  beard: Material | null;
  moustache: boolean;
  /** Skin shine follows `cosmetic.oil` (thief only). */
  oilable?: boolean;
  /** Extra object held in the right hand (e.g. a lantern). */
  rightHand?: ReactNode;
  /** Lower garment length multiplier (saree ≈ 1.55). */
  skirt?: number;
  /** Head covering (saree anchal / scarf). */
  hood?: Material | null;
  glasses?: boolean;
  /** Fewer meshes (no face details / hands) for background characters — keeps draw calls low. */
  lowDetail?: boolean;
  /** Show a sack on the back when `driver.carry` > 0 (the thief). */
  sack?: boolean;
};

type Params = {
  hip: number;
  lean: number;
  swing: number;
  armSwing: number;
  elbowL: number;
  elbowR: number;
  armLX: number;
  armRX: number;
  armLZ: number;
  armRZ: number;
  headYaw: number;
  headPitch: number;
  sideLean: number;
  hipDrop: number;
  bob: number;
};

const LOCO: Record<string, Pick<Params, 'hip' | 'swing' | 'lean' | 'armSwing' | 'bob'> & { elbow: number; sneak: number }> = {
  idle: { hip: 0.84, swing: 0, lean: 0.02, armSwing: 0, elbow: 0.15, sneak: 0, bob: 0 },
  walk: { hip: 0.83, swing: 0.42, lean: 0.06, armSwing: 0.45, elbow: 0.3, sneak: 0, bob: 0.035 },
  run: { hip: 0.8, swing: 0.75, lean: 0.24, armSwing: 0.9, elbow: 1.35, sneak: 0, bob: 0.07 },
  'crouch-idle': { hip: 0.56, swing: 0, lean: 0.5, armSwing: 0, elbow: 1.0, sneak: 0.9, bob: 0 },
  'crouch-walk': { hip: 0.56, swing: 0.32, lean: 0.5, armSwing: 0.15, elbow: 1.0, sneak: 0.9, bob: 0.025 },
  airborne: { hip: 0.8, swing: 0.1, lean: 0.05, armSwing: 0.2, elbow: 0.6, sneak: 0.4, bob: 0 },
};

/**
 * Procedural low-poly human. Locomotion gait is speed-synced (no foot sliding, D-011); action
 * poses (preparation, digging, crawling, fright, catch, shouting…) override the upper body and
 * hips; every parameter is damped so switching never pops. Temporary until GLB animation (A1).
 */
export function HumanRig({ driver, look }: { driver: RigDriver; look: Appearance }) {
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
  const headbandRef = useRef<Group>(null);
  const sackRef = useRef<Group>(null);

  const p = useRef<Params>({ hip: 0.84, lean: 0, swing: 0, armSwing: 0, elbowL: 0.15, elbowR: 0.15, armLX: 0, armRX: 0, armLZ: -0.12, armRZ: 0.12, headYaw: 0, headPitch: 0, sideLean: 0, hipDrop: 0, bob: 0 });
  const phase = useRef(0);
  const breath = useRef(0);

  const tick = (rawDt: number) => {
    if (useAppStore.getState().paused) return;
    const dt = Math.min(rawDt, 0.1);
    driver.actionTime += dt;
    const t = driver.actionTime;
    const a = p.current;
    const loco = LOCO[driver.mode] ?? LOCO.idle!;
    const speed = driver.horizontalSpeed;
    const speedFactor = Math.min(1, speed / 0.6);

    // Locomotion targets
    let hip = loco.hip;
    let lean = loco.lean;
    let swing = loco.swing * speedFactor;
    const armSwing = loco.armSwing * speedFactor;
    let elbowL = loco.elbow;
    let elbowR = loco.elbow;
    let armLX = -loco.sneak;
    let armRX = -loco.sneak;
    let armLZ = -(0.12 + loco.sneak * 0.15);
    let armRZ = 0.12 + loco.sneak * 0.15;
    let headYaw = 0;
    let headPitch = 0;
    let sideLean = 0;
    let hipDrop = 0;
    let gaitArms = true;
    const s = (f: number, ph = 0) => Math.sin(t * f + ph);

    switch (driver.action) {
      case 'oil-rub':
        gaitArms = false;
        armLX = -0.9 + s(14) * 0.35;
        armRX = -0.9 - s(14) * 0.35;
        armLZ = 0.55;
        armRZ = -0.55;
        elbowL = elbowR = 1.6;
        headPitch = 0.25;
        break;
      case 'oil-miss':
        gaitArms = false;
        armLX = armRX = -2.3;
        armLZ = 0.2;
        armRZ = -0.2;
        elbowL = elbowR = 1.8;
        headYaw = s(18) * 0.45;
        sideLean = s(9) * 0.08;
        break;
      case 'tuck':
        gaitArms = false;
        armLX = armRX = -0.25;
        armLZ = 0.45;
        armRZ = -0.45;
        elbowL = elbowR = 1.4;
        hipDrop = Math.abs(s(6)) * 0.07;
        headPitch = 0.35;
        break;
      case 'tuck-fail':
        gaitArms = false;
        armLZ = -1.2 + s(10) * 0.3;
        armRZ = 1.2 - s(10) * 0.3;
        sideLean = s(7) * 0.15;
        headYaw = s(5) * 0.3;
        break;
      case 'gamcha':
      case 'gamcha-fail':
        gaitArms = false;
        armLX = armRX = -2.6 + s(12) * 0.12;
        armLZ = 0.3;
        armRZ = -0.3;
        elbowL = elbowR = 1.3;
        headPitch = driver.action === 'gamcha-fail' ? 0.45 : -0.05;
        headYaw = driver.action === 'gamcha-fail' ? s(10) * 0.35 : 0;
        break;
      case 'proud':
        gaitArms = false;
        armLX = armRX = 0.15;
        armLZ = -0.95;
        armRZ = 0.95;
        elbowL = elbowR = 2.0;
        lean = -0.12;
        headPitch = -0.18;
        hipDrop = -Math.abs(s(3)) * 0.02;
        break;
      case 'dig':
        gaitArms = false;
        hip = 0.56;
        lean = 0.75;
        armLX = -1.3 + s(9) * 0.5;
        armRX = -1.3 + s(9, Math.PI) * 0.5;
        elbowL = elbowR = 0.6;
        break;
      case 'crawl':
        gaitArms = false;
        hip = 0.44;
        lean = 1.25;
        swing = 0.3;
        armLX = -2.3 + s(8) * 0.4;
        armRX = -2.3 + s(8, Math.PI) * 0.4;
        elbowL = elbowR = 0.3;
        headPitch = -0.9;
        break;
      case 'pickup': {
        const k = Math.sin(Math.min(t / 0.55, 1) * Math.PI);
        hip = 0.84 - 0.2 * k;
        lean = 0.9 * k;
        armLX = armRX = -0.9 * k;
        break;
      }
      case 'frightened':
        gaitArms = false;
        armLX = armRX = -2.8;
        armLZ = 0.4 + s(30) * 0.06;
        armRZ = -0.4 - s(30) * 0.06;
        elbowL = elbowR = 0.3;
        headYaw = s(12) * 0.3;
        sideLean = s(25) * 0.04;
        break;
      case 'caught':
        gaitArms = false;
        hip = 0.52;
        lean = 0.45;
        armLX = armRX = -2.5;
        armLZ = 0.2;
        armRZ = -0.2;
        elbowL = elbowR = 2.2;
        sideLean = s(28) * 0.04;
        headPitch = 0.3 + s(20) * 0.05;
        break;
      case 'shout':
        armRX = -2.6;
        armRZ = 0.2;
        elbowR = 0.05;
        headPitch = -0.2;
        hipDrop = -Math.abs(s(8)) * 0.03;
        break;
      case 'look-around':
        headYaw = s(1.8) * 0.9;
        break;
      case 'sit':
        gaitArms = false;
        hip = 0.47;
        lean = 0.1;
        armLX = armRX = -0.6;
        elbowL = elbowR = 1.3;
        headYaw = s(0.7) * 0.25;
        break;
      case 'examine':
        gaitArms = false;
        armLX = armRX = -1.05;
        armLZ = 0.25;
        armRZ = -0.25;
        elbowL = elbowR = 1.25 + s(3) * 0.1;
        headPitch = 0.4;
        headYaw = s(1.6) * 0.15;
        break;
      case 'wave':
        armRX = -2.7;
        armRZ = 0.35 + s(9) * 0.35;
        elbowR = 0.4;
        break;
      case 'sit-up':
        gaitArms = false;
        armLX = armRX = -2.9 + s(2) * 0.1;
        elbowL = elbowR = 0.6;
        headPitch = -0.3;
        break;
      default:
        break;
    }

    const k = 10;
    a.hip = damp(a.hip, hip, k, dt);
    a.lean = damp(a.lean, lean, k, dt);
    a.swing = damp(a.swing, swing, k, dt);
    a.armSwing = damp(a.armSwing, gaitArms ? armSwing : 0, k, dt);
    a.elbowL = damp(a.elbowL, elbowL, k, dt);
    a.elbowR = damp(a.elbowR, elbowR, k, dt);
    a.armLX = damp(a.armLX, armLX, 14, dt);
    a.armRX = damp(a.armRX, armRX, 14, dt);
    a.armLZ = damp(a.armLZ, armLZ, 14, dt);
    a.armRZ = damp(a.armRZ, armRZ, 14, dt);
    a.headYaw = damp(a.headYaw, headYaw, 12, dt);
    a.headPitch = damp(a.headPitch, headPitch, 12, dt);
    a.sideLean = damp(a.sideLean, sideLean, 14, dt);
    a.hipDrop = damp(a.hipDrop, hipDrop, 14, dt);
    a.bob = damp(a.bob, loco.bob * speedFactor, k, dt);

    // Stride: phase advances by measured ground speed / step length, so feet plant (D-011).
    const effectiveSpeed = driver.action === 'crawl' ? Math.max(speed, 0.6) : speed;
    const stepLength = Math.max(0.12, 2 * LEG * Math.sin(Math.max(a.swing, 0.05)));
    phase.current += (effectiveSpeed / (2 * stepLength)) * Math.PI * 2 * dt;
    if (effectiveSpeed < 0.05) phase.current = damp(phase.current, Math.round(phase.current / Math.PI) * Math.PI, 6, dt);
    breath.current += dt;

    const ph = phase.current;
    const sp = Math.sin(ph);
    const bend = Math.acos(Math.min(0.999, Math.max(0.2, a.hip) / LEG));
    const bob = Math.abs(Math.cos(ph)) * a.bob;

    if (pelvis.current) {
      pelvis.current.position.y = a.hip + bob - a.hipDrop;
      pelvis.current.rotation.z = a.sideLean;
    }
    if (spine.current) {
      spine.current.rotation.x = a.lean;
      const breathe = 1 + Math.sin(breath.current * 2.2) * 0.012 * (1 - Math.min(1, speed));
      spine.current.scale.set(1, breathe, 1);
    }
    if (head.current) {
      head.current.rotation.x = -a.lean * 0.6 + a.headPitch + Math.sin(breath.current * 1.1) * 0.02;
      head.current.rotation.y = a.headYaw;
    }
    const sitting = driver.action === 'sit';
    const legPose = (thigh: Group | null, shin: Group | null, side: number) => {
      if (!thigh || !shin) return;
      if (sitting) {
        thigh.rotation.x = -1.45;
        shin.rotation.x = 1.45;
        return;
      }
      const sw = sp * side * a.swing;
      const lift = Math.max(0, -Math.cos(ph) * side) * a.swing * 1.4;
      thigh.rotation.x = -bend - sw - lift * 0.5;
      shin.rotation.x = 2 * bend + lift;
    };
    legPose(thighL.current, shinL.current, 1);
    legPose(thighR.current, shinR.current, -1);
    const armPose = (arm: Group | null, fore: Group | null, side: number, baseX: number, baseZ: number, elbow: number) => {
      if (!arm || !fore) return;
      arm.rotation.x = baseX + sp * side * a.armSwing;
      arm.rotation.z = baseZ;
      fore.rotation.x = -elbow;
    };
    armPose(armL.current, foreL.current, -1, a.armLX, a.armLZ, a.elbowL);
    armPose(armR.current, foreR.current, 1, a.armRX, a.armRZ, a.elbowR);

    const c = driver.cosmetic;
    if (lungi.current) {
      lungi.current.rotation.x = -a.swing * 0.15 * sp;
      const tuck = c?.tuck ?? 0;
      lungi.current.scale.y = 1 - 0.32 * tuck;
      lungi.current.position.y = 0.06 * tuck;
    }
    if (headbandRef.current) headbandRef.current.visible = Boolean(look.alwaysHeadband || c?.headband);
    if (sackRef.current) {
      const carry = driver.carry ?? 0;
      sackRef.current.visible = carry > 0.01;
      sackRef.current.scale.setScalar(0.7 + 0.6 * Math.min(1, carry));
    }
    if (look.oilable && look.skin instanceof MeshStandardMaterial) {
      const oil = c?.oil ?? 0;
      look.skin.roughness = 0.62 - 0.38 * oil;
      look.skin.metalness = 0.02 + 0.12 * oil;
    }
  };
  useFrame((_, rawDt) => timed('rig', () => tick(rawDt)));

  const skin = look.skin;
  const torso = look.top ?? skin;
  const detail = !look.lowDetail;
  const skirt = look.skirt ?? 1;
  return (
    <group>
      <group ref={pelvis} position={[0, 0.84, 0]}>
        {([
          [-0.11, thighL, shinL],
          [0.11, thighR, shinR],
        ] as const).map(([x, thighRef, shinRef]) => (
          <group key={x} ref={thighRef} position={[x, 0, 0]}>
            <mesh geometry={UNIT_CYLINDER} material={skin} position={[0, -THIGH / 2, 0]} scale={[0.13, THIGH, 0.13]} />
            <group ref={shinRef} position={[0, -THIGH, 0]}>
              <mesh geometry={UNIT_CYLINDER} material={skin} position={[0, -SHIN / 2, 0]} scale={[0.11, SHIN, 0.11]} />
              <mesh geometry={UNIT_BOX} material={mat('black')} position={[0, -SHIN - 0.01, 0.05]} scale={[0.12, 0.04, 0.26]} />
            </group>
          </group>
        ))}

        <group ref={lungi}>
          <mesh geometry={UNIT_CYLINDER} material={look.lower} position={[0, 0.06 - 0.26 * skirt, 0]} scale={[0.5 + 0.04 * (skirt - 1), 0.52 * skirt, 0.42 + 0.04 * (skirt - 1)]} castShadow />
          {detail && <mesh geometry={UNIT_CYLINDER} material={look.lower} position={[0, 0.06 - 0.5 * skirt, 0]} scale={[0.56, 0.06, 0.48]} />}
          {detail && skirt <= 1 && <mesh geometry={UNIT_SPHERE} material={look.lower} position={[0, 0.02, 0.2]} scale={[0.12, 0.08, 0.08]} />}
        </group>

        <group ref={spine} position={[0, 0.04, 0]}>
          <mesh geometry={UNIT_CYLINDER} material={torso} position={[0, 0.27, 0]} scale={[0.42, 0.54, 0.32]} castShadow />
          {detail && <mesh geometry={UNIT_SPHERE} material={torso} position={[0, 0.03, 0.02]} scale={[0.42, 0.22, 0.34]} />}
          {look.sack && (
            <group ref={sackRef} position={[0, 0.32, -0.27]} visible={false}>
              <mesh geometry={UNIT_SPHERE} material={mat('weave')} scale={[0.42, 0.5, 0.3]} />
              <mesh geometry={UNIT_CYLINDER} material={mat('gamcha')} position={[0, 0.27, 0.02]} scale={[0.16, 0.08, 0.16]} />
            </group>
          )}
          {look.neckGamcha && (
            <>
              <mesh geometry={UNIT_CYLINDER} material={look.neckGamcha} position={[0, 0.55, 0]} scale={[0.4, 0.09, 0.32]} />
              <mesh geometry={UNIT_BOX} material={look.neckGamcha} position={[0.12, 0.38, 0.17]} rotation={[0.1, 0, 0.15]} scale={[0.09, 0.3, 0.02]} />
              <mesh geometry={UNIT_BOX} material={look.neckGamcha} position={[-0.1, 0.4, -0.17]} rotation={[-0.1, 0, -0.2]} scale={[0.09, 0.26, 0.02]} />
            </>
          )}

          <group ref={head} position={[0, 0.64, 0.02]}>
            <mesh geometry={UNIT_CYLINDER} material={skin} position={[0, 0.03, 0]} scale={[0.12, 0.1, 0.12]} />
            <mesh geometry={UNIT_SPHERE} material={skin} position={[0, 0.22, 0]} scale={[0.36, 0.38, 0.36]} castShadow />
            <mesh geometry={UNIT_SPHERE} material={look.hair} position={[0, 0.31, -0.03]} scale={[0.37, 0.24, 0.36]} />
            {look.cap && <mesh geometry={UNIT_CYLINDER} material={look.cap} position={[0, 0.4, -0.01]} scale={[0.33, 0.12, 0.33]} />}
            {look.hood && <mesh geometry={UNIT_SPHERE} material={look.hood} position={[0, 0.28, -0.04]} scale={[0.42, 0.42, 0.42]} />}
            {look.glasses && <mesh geometry={UNIT_BOX} material={mat('black')} position={[0, 0.245, 0.175]} scale={[0.26, 0.06, 0.03]} />}
            {look.headband && (
              <group ref={headbandRef} visible={Boolean(look.alwaysHeadband)}>
                <mesh geometry={UNIT_CYLINDER} material={look.headband} position={[0, 0.29, 0]} scale={[0.39, 0.07, 0.39]} />
                <mesh geometry={UNIT_BOX} material={look.headband} position={[0, 0.27, -0.21]} rotation={[0.5, 0, 0.3]} scale={[0.06, 0.16, 0.02]} />
              </group>
            )}
            {detail && [-0.07, 0.07].map((x) => (
              <group key={x} position={[x, 0.24, 0.16]}>
                <mesh geometry={UNIT_SPHERE} material={mat('white')} scale={[0.07, 0.06, 0.04]} />
                <mesh geometry={UNIT_SPHERE} material={mat('black')} position={[0, 0, 0.017]} scale={[0.03, 0.035, 0.02]} />
              </group>
            ))}
            {detail && <mesh geometry={UNIT_SPHERE} material={skin} position={[0, 0.18, 0.18]} scale={[0.06, 0.08, 0.07]} />}
            {detail && look.moustache && (
              <>
                <mesh geometry={UNIT_BOX} material={look.beard ?? mat('black')} position={[0, 0.12, 0.165]} scale={[0.2, 0.035, 0.04]} />
                <mesh geometry={UNIT_BOX} material={look.beard ?? mat('black')} position={[0.11, 0.105, 0.16]} rotation={[0, 0, 0.5]} scale={[0.06, 0.03, 0.035]} />
                <mesh geometry={UNIT_BOX} material={look.beard ?? mat('black')} position={[-0.11, 0.105, 0.16]} rotation={[0, 0, -0.5]} scale={[0.06, 0.03, 0.035]} />
              </>
            )}
            {look.beard && <mesh geometry={UNIT_SPHERE} material={look.beard} position={[0, 0.07, 0.11]} scale={[0.26, 0.2, 0.16]} />}
            {detail &&
              [-0.18, 0.18].map((x) => <mesh key={x} geometry={UNIT_SPHERE} material={skin} position={[x, 0.21, 0]} scale={[0.05, 0.09, 0.06]} />)}
          </group>

          {([
            [-0.25, armL, foreL, false],
            [0.25, armR, foreR, true],
          ] as const).map(([x, armRef, foreRef, right]) => (
            <group key={x} ref={armRef} position={[x, 0.48, 0]}>
              {detail && <mesh geometry={UNIT_SPHERE} material={torso} scale={[0.15, 0.14, 0.15]} />}
              <mesh geometry={UNIT_CYLINDER} material={look.top ?? skin} position={[0, -0.15, 0]} scale={[0.1, 0.3, 0.1]} />
              <group ref={foreRef} position={[0, -0.3, 0]}>
                <mesh geometry={UNIT_CYLINDER} material={skin} position={[0, -0.13, 0]} scale={[0.085, 0.27, 0.085]} />
                {detail && <mesh geometry={UNIT_SPHERE} material={skin} position={[0, -0.29, 0]} scale={[0.1, 0.11, 0.1]} />}
                {right && look.rightHand && <group position={[0, -0.42, 0.02]}>{look.rightHand}</group>}
              </group>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}
