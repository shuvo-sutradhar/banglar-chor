import { useMemo, useRef, type ReactNode } from 'react';
import { CylinderGeometry, type Material, type PointLight } from 'three';
import { UNIT_BOX, UNIT_CYLINDER, UNIT_SPHERE, rampGeometry } from './sharedGeometry';
import { useFrame } from '@react-three/fiber';
import { ConvexHullCollider, CuboidCollider, RigidBody } from '@react-three/rapier';
import { CAMERA_TRANSPARENT, HOUSE_SHELL } from '../physics/queries';
import { mat } from './materials';
import { useAppStore } from '../../state/useAppStore';
import { daylight } from '../effects/daylight';
import type { Placement } from './layout';


type Vec3 = [number, number, number];

/** Static structure root: one fixed rigid body per building, colliders are local children. */
export function Structure({ placement, children }: { placement: Placement; children: ReactNode }) {
  return (
    <RigidBody type="fixed" colliders={false} position={[placement.x, 0, placement.z]} rotation={[0, placement.rotY, 0]}>
      {children}
    </RigidBody>
  );
}

/**
 * A box mesh with an optional matching collider. `thin` colliders block the player
 * but let the camera pass (posts, fences, low walls) to avoid camera popping.
 */
export function Block({
  size,
  position,
  rotation = [0, 0, 0],
  material,
  collider = false,
  thin = false,
  shell = false,
  castShadow = true,
}: {
  size: Vec3;
  position: Vec3;
  rotation?: Vec3;
  material: Material;
  collider?: boolean;
  thin?: boolean;
  /** Wall/ceiling of an enterable house (see HOUSE_SHELL). */
  shell?: boolean;
  castShadow?: boolean;
}) {
  return (
    <>
      <mesh geometry={UNIT_BOX} material={material} position={position} rotation={rotation} scale={size} castShadow={castShadow} receiveShadow />
      {collider && (
        <CuboidCollider
          args={[size[0] / 2, size[1] / 2, size[2] / 2]}
          position={position}
          rotation={rotation}
          name={thin ? CAMERA_TRANSPARENT : shell ? HOUSE_SHELL : undefined}
        />
      )}
    </>
  );
}

export function Post({ position, height, radius = 0.09, material, collider = true }: { position: [number, number]; height: number; radius?: number; material?: Material; collider?: boolean }) {
  return (
    <>
      <mesh geometry={UNIT_CYLINDER} material={material ?? mat('wood')} position={[position[0], height / 2, position[1]]} scale={[radius * 2, height, radius * 2]} castShadow />
      {collider && <CuboidCollider args={[radius, height / 2, radius]} position={[position[0], height / 2, position[1]]} name={CAMERA_TRANSPARENT} />}
    </>
  );
}

/** Two sloped roof panels meeting at a ridge along local X. */
export function GableRoof({ width, span, rise, baseY, material, thickness = 0.08 }: { width: number; span: number; rise: number; baseY: number; material: Material; thickness?: number }) {
  const half = span / 2;
  const slope = Math.hypot(half, rise);
  const angle = Math.atan2(rise, half);
  return (
    <group position={[0, baseY, 0]}>
      <mesh geometry={UNIT_BOX} material={material} position={[0, rise / 2, half / 2]} rotation={[angle, 0, 0]} scale={[width, thickness, slope]} castShadow receiveShadow />
      <mesh geometry={UNIT_BOX} material={material} position={[0, rise / 2, -half / 2]} rotation={[-angle, 0, 0]} scale={[width, thickness, slope]} castShadow receiveShadow />
    </group>
  );
}

/** Hipped thatch roof: a 4-sided cone scaled to the footprint, plus a thick eave skirt. */
export function HippedThatch({ footX, footZ, height, baseY }: { footX: number; footZ: number; height: number; baseY: number }) {
  const geometry = useMemo(() => {
    const g = new CylinderGeometry(0.02, 1, 1, 4, 1);
    g.rotateY(Math.PI / 4);
    return g;
  }, []);
  const s = Math.SQRT2 / 2;
  return (
    <group position={[0, baseY, 0]}>
      <mesh geometry={geometry} material={mat('thatch')} position={[0, height / 2, 0]} scale={[footX * s, height, footZ * s]} castShadow receiveShadow />
      <mesh geometry={UNIT_BOX} material={mat('thatch')} position={[0, 0.04, 0]} scale={[footX * 0.98, 0.18, footZ * 0.98]} castShadow />
    </group>
  );
}

/** Hurricane lantern (হারিকেন) with an optional warm point light and gentle flicker. */
export function Lantern({ position, light = true, intensity = 7, distance = 9 }: { position: Vec3; light?: boolean; intensity?: number; distance?: number }) {
  const lightRef = useRef<PointLight>(null);
  const seed = position[0] * 13.1 + position[2] * 7.7;
  useFrame(({ clock }) => {
    const l = lightRef.current;
    if (!l) return;
    // Lanterns are put out as morning comes.
    const night = 1 - daylight.factor;
    if (useAppStore.getState().settings.reducedMotion) {
      l.intensity = intensity * night;
      return;
    }
    const t = clock.elapsedTime + seed;
    l.intensity = intensity * night * (0.9 + 0.06 * Math.sin(t * 7.3) + 0.04 * Math.sin(t * 13.7));
  });
  return (
    <group position={position}>
      <mesh geometry={UNIT_CYLINDER} material={mat('iron')} position={[0, -0.14, 0]} scale={[0.16, 0.05, 0.16]} />
      <mesh geometry={UNIT_SPHERE} material={mat('lanternGlow')} scale={[0.15, 0.2, 0.15]} />
      <mesh geometry={UNIT_CYLINDER} material={mat('iron')} position={[0, 0.14, 0]} scale={[0.12, 0.06, 0.12]} />
      {light && <pointLight ref={lightRef} color="#f2ad55" intensity={intensity} distance={distance} decay={1.6} position={[0, 0, 0.15]} />}
    </group>
  );
}

/** Clay water pitcher (কলসি). */
export function Kolshi({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh geometry={UNIT_SPHERE} material={mat('clayPot')} position={[0, 0.25, 0]} scale={[0.5, 0.46, 0.5]} castShadow />
      <mesh geometry={UNIT_CYLINDER} material={mat('clayPot')} position={[0, 0.52, 0]} scale={[0.18, 0.14, 0.18]} />
      <mesh geometry={UNIT_CYLINDER} material={mat('clayPot')} position={[0, 0.6, 0]} scale={[0.26, 0.04, 0.26]} />
    </group>
  );
}

/** Mud stove (মাটির চুলা): a ring with three raised lugs. */
export function ClayStove({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh geometry={UNIT_CYLINDER} material={mat('mudDark')} position={[0, 0.16, 0]} scale={[0.7, 0.32, 0.7]} castShadow />
      <mesh geometry={UNIT_CYLINDER} material={mat('black')} position={[0, 0.33, 0]} scale={[0.46, 0.02, 0.46]} />
      {[0, 2.1, 4.2].map((a) => (
        <mesh key={a} geometry={UNIT_BOX} material={mat('mudDark')} position={[Math.cos(a) * 0.3, 0.4, Math.sin(a) * 0.3]} scale={[0.12, 0.14, 0.12]} />
      ))}
    </group>
  );
}

/**
 * Sloped mud edge along a veranda front. Its wedge collider lets the character controller
 * walk up via slope climbing, which is reliable at every speed (Rapier autostep is not;
 * see docs/DECISIONS.md D-010).
 */
export function VerandaRamp({ edgeZ, width, height, run = 0.7, material }: { edgeZ: number; width: number; height: number; run?: number; material: Material }) {
  const w = width / 2;
  const points = useMemo(
    () => new Float32Array([-w, 0, 0, w, 0, 0, -w, height, 0, w, height, 0, -w, 0, run, w, 0, run]),
    [w, height, run],
  );
  return (
    <group position={[0, 0, edgeZ]}>
      <mesh geometry={rampGeometry(width, height, run)} material={material} receiveShadow />
      <ConvexHullCollider args={[points]} />
    </group>
  );
}
