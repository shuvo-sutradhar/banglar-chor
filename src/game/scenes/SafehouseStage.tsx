import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { damp } from '../../lib/math';
import { useAppStore } from '../../state/useAppStore';
import { useGameRuntime } from '../GameRuntime';
import { disableCutout } from '../effects/cameraCutout';
import { daylight } from '../effects/daylight';
import { ThiefModel } from '../characters/ThiefModel';
import { mat } from '../world/materials';
import { UNIT_BOX, UNIT_CYLINDER, UNIT_SPHERE } from '../world/sharedGeometry';
import { PLAYER_SPAWN } from '../data/tuning';
import { safehouseAction } from './safehouseState';

/** The thief's own yard at the village edge (just outside the entrance where every night starts). */
const [SX, , SZ0] = PLAYER_SPAWN;
const SZ = SZ0 + 3.2;
const LOOK_AT = new Vector3(SX, 0.95, SZ);


/**
 * Safehouse by day (Phase 4B): a compact set — rope cot, clay stove with a rice pot, his jute
 * sack, and the thief acting out each choice (eating, napping, showing off a tool). The rig is
 * the same `runtime.player` driver, so the equipped tool is the real Blender prop in his hand.
 */
export function SafehouseStage() {
  const runtime = useGameRuntime();
  useEffect(() => {
    const p = runtime.player;
    p.mode = 'idle';
    p.horizontalSpeed = 0;
    p.cosmetic = { oil: 0, tuck: 0, headband: false };
    p.tool = null;
    p.clipPhase = null;
    p.tired = false;
    const before = daylight.factor;
    daylight.factor = 0.85;
    safehouseAction.kind = 'idle';
    return () => {
      daylight.factor = before;
      p.action = null;
      p.tool = null;
    };
  }, [runtime]);

  useFrame(() => {
    const p = runtime.player;
    const now = performance.now();
    if (safehouseAction.kind !== 'idle' && now > safehouseAction.until) safehouseAction.kind = 'idle';
    const k = safehouseAction.kind;
    const action = k === 'eat' ? 'eat' : k === 'nap' ? 'sit' : k === 'show-tool' ? 'examine' : k === 'proud' ? 'proud' : k === 'broke' ? 'frightened' : null;
    if (p.action !== action) {
      p.action = action;
      p.actionTime = 0;
    }
    // He hitches the lungi up to squat and eat (the long lungi would clip through the knees).
    const tuck = k === 'eat' || k === 'nap' ? 1 : 0;
    if (p.cosmetic.tuck !== tuck) p.cosmetic.tuck = tuck;
    p.tool = k === 'show-tool' ? useAppStore.getState().profile.equipped.tool : null;
  });

  return (
    <group position={[SX, 0, SZ]}>
      <ThiefModel driver={runtime.player} />
      {/* Rope cot (চারপায়া) */}
      <group position={[-1.5, 0, -0.4]} rotation={[0, 0.3, 0]}>
        <mesh geometry={UNIT_BOX} material={mat('wood')} position={[0, 0.42, 0]} scale={[0.95, 0.06, 1.9]} castShadow receiveShadow />
        {[
          [-0.42, -0.9],
          [0.42, -0.9],
          [-0.42, 0.9],
          [0.42, 0.9],
        ].map(([x, z]) => (
          <mesh key={`${x}${z}`} geometry={UNIT_BOX} material={mat('woodDark')} position={[x!, 0.2, z!]} scale={[0.07, 0.42, 0.07]} />
        ))}
        <mesh geometry={UNIT_BOX} material={mat('gamcha')} position={[0, 0.47, -0.65]} scale={[0.6, 0.06, 0.35]} />
      </group>
      {/* Clay stove (চুলা) with a rice pot */}
      <group position={[1.3, 0, -0.6]}>
        <mesh geometry={UNIT_CYLINDER} material={mat('mudDark')} position={[0, 0.16, 0]} scale={[0.55, 0.32, 0.55]} castShadow />
        <mesh geometry={UNIT_SPHERE} material={mat('clayPot')} position={[0, 0.42, 0]} scale={[0.3, 0.24, 0.3]} castShadow />
      </group>
      {/* His sack and a water pot */}
      <mesh geometry={UNIT_SPHERE} material={mat('weave')} position={[1.25, 0.25, 0.7]} scale={[0.5, 0.5, 0.45]} castShadow />
      <mesh geometry={UNIT_SPHERE} material={mat('clayPot')} position={[-0.9, 0.2, 0.9]} scale={[0.3, 0.36, 0.3]} castShadow />
    </group>
  );
}

/** Wide, warm daytime framing of the yard. */
export function SafehouseCamera() {
  const camera = useThree((s) => s.camera);
  const dist = useRef(5);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    disableCutout();
    const close = safehouseAction.kind === 'eat' || safehouseAction.kind === 'show-tool';
    dist.current = damp(dist.current, close ? 3.4 : 4.4, 2, dt);
    camera.position.x = damp(camera.position.x, SX + 1.1, 3, dt);
    camera.position.y = damp(camera.position.y, 1.7, 3, dt);
    camera.position.z = damp(camera.position.z, SZ + dist.current, 3, dt);
    camera.lookAt(LOOK_AT);
  });
  return null;
}
