import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { damp } from '../../lib/math';
import { useAppStore } from '../../state/useAppStore';
import { useGameRuntime } from '../GameRuntime';
import { disableCutout } from '../effects/cameraCutout';
import { PLAYER_SPAWN } from '../data/tuning';
import { ThiefModel } from '../characters/ThiefModel';
import { mat } from '../world/materials';
import { UNIT_BOX, UNIT_CYLINDER, UNIT_SPHERE } from '../world/sharedGeometry';

const [SX, , SZ] = PLAYER_SPAWN;
const LOOK_AT = new Vector3(SX, 1.0, SZ);

/**
 * Preparation ritual stage: the thief at the village entrance by his little lamp, oil bottle on a
 * stool, facing a close-up camera. The rig is driven by `runtime.player` so cosmetic results
 * (oil shine, tucked lungi, headband) carry straight into the night.
 */
export function PrepStage() {
  const runtime = useGameRuntime();
  useEffect(() => {
    const p = runtime.player;
    p.mode = 'idle';
    p.horizontalSpeed = 0;
  }, [runtime]);
  return (
    <group position={[SX, 0, SZ]}>
      <group rotation={[0, 0, 0]}>
        <ThiefModel driver={runtime.player} />
      </group>
      {/* Stool with a bottle of mustard oil (সরিষার তেল) */}
      <group position={[0.75, 0, 0.35]}>
        <mesh geometry={UNIT_CYLINDER} material={mat('wood')} position={[0, 0.25, 0]} scale={[0.36, 0.06, 0.36]} castShadow />
        {[0, 2.1, 4.2].map((a) => (
          <mesh key={a} geometry={UNIT_BOX} material={mat('woodDark')} position={[Math.cos(a) * 0.12, 0.11, Math.sin(a) * 0.12]} scale={[0.04, 0.24, 0.04]} />
        ))}
        <mesh geometry={UNIT_CYLINDER} material={mat('glass')} position={[0, 0.38, 0]} scale={[0.1, 0.2, 0.1]} />
        <mesh geometry={UNIT_CYLINDER} material={mat('gold')} position={[0, 0.35, 0]} scale={[0.085, 0.13, 0.085]} />
        <mesh geometry={UNIT_SPHERE} material={mat('wood')} position={[0, 0.5, 0]} scale={[0.05, 0.05, 0.05]} />
      </group>
      {/* His own little lamp: warm dusk-like key light for the close-up */}
      <group position={[-0.8, 0, 0.5]}>
        <mesh geometry={UNIT_SPHERE} material={mat('lanternGlow')} position={[0, 0.18, 0]} scale={[0.15, 0.2, 0.15]} />
        <pointLight color="#ffb866" intensity={6} distance={6} decay={1.6} position={[0, 0.5, 0.3]} />
      </group>
    </group>
  );
}

/** Close-up camera in front of the thief; drifts slightly closer on the final proud pose. */
export function PrepCamera() {
  const runtime = useGameRuntime();
  const camera = useThree((s) => s.camera);
  const dist = useRef(3.4);
  useFrame((_, rawDt) => {
    if (useAppStore.getState().paused) return;
    const dt = Math.min(rawDt, 0.1);
    const proud = runtime.player.action === 'proud';
    const reduced = useAppStore.getState().settings.reducedMotion;
    disableCutout();
    dist.current = damp(dist.current, proud && !reduced ? 2.7 : 3.3, 2, dt);
    camera.position.x = damp(camera.position.x, SX + 0.4, 4, dt);
    camera.position.y = damp(camera.position.y, 1.45, 4, dt);
    camera.position.z = damp(camera.position.z, SZ + dist.current, 4, dt);
    camera.lookAt(LOOK_AT);
  });
  return null;
}
