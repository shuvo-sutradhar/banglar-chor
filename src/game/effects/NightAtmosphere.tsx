import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3, type DirectionalLight, type Object3D } from 'three';
import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { createRng } from '../../lib/rng';
import { useAppStore } from '../../state/useAppStore';
import { useGameRuntime } from '../GameRuntime';
import { WORLD_BOUNDS } from '../data/tuning';
import { PALETTE } from '../world/materials';
import type { QualityProfile } from '../../state/settings';

const MOON_DIRECTION = new Vector3(-0.45, 0.8, -0.4).normalize();

/** Fireflies: one Points draw call; motion is computed in the vertex shader (no per-frame CPU work). */
function Fireflies({ count }: { count: number }) {
  const geometry = useMemo(() => {
    const rng = createRng(777);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = rng.range(-WORLD_BOUNDS.halfSize, WORLD_BOUNDS.halfSize);
      positions[i * 3 + 1] = rng.range(0.4, 2.4);
      positions[i * 3 + 2] = rng.range(-WORLD_BOUNDS.halfSize, WORLD_BOUNDS.halfSize);
      seeds[i] = rng.range(0, 100);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    g.setAttribute('seed', new BufferAttribute(seeds, 1));
    return g;
  }, [count]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uColor: { value: new Color('#d9f27a') } },
        vertexShader: /* glsl */ `
          attribute float seed;
          uniform float uTime;
          varying float vGlow;
          void main() {
            vec3 p = position;
            float t = uTime * 0.6 + seed;
            p.x += sin(t * 0.9) * 0.8;
            p.y += sin(t * 1.3) * 0.35;
            p.z += cos(t * 0.7) * 0.8;
            vGlow = 0.5 + 0.5 * sin(t * 3.0 + seed * 2.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (6.0 + 6.0 * vGlow) * (10.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying float vGlow;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d) * vGlow;
            gl_FragColor = vec4(uColor, a);
          }`,
      }),
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dt) => {
    if (useAppStore.getState().paused) return;
    material.uniforms.uTime!.value += Math.min(dt, 0.1);
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

/**
 * Night lighting: sky hemisphere + moon directional light (single shadow caster whose
 * frustum follows the player) + a visible moon disc. Lantern point lights live on houses.
 */
export function NightAtmosphere({ quality }: { quality: QualityProfile }) {
  const runtime = useGameRuntime();
  const moonRef = useRef<DirectionalLight>(null);
  const targetRef = useRef<Object3D>(null);

  useEffect(() => {
    const light = moonRef.current;
    const target = targetRef.current;
    if (light && target) light.target = target;
  }, []);

  useEffect(() => {
    const light = moonRef.current;
    if (!light) return;
    light.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    light.shadow.map?.dispose();
    light.shadow.map = null;
  }, [quality.shadowMapSize]);

  useFrame(() => {
    const light = moonRef.current;
    const target = targetRef.current;
    if (!light || !target) return;
    // Keep the shadow frustum centred on the player (or village centre on the menu).
    const focus = runtime.player.body ? runtime.player.position : null;
    const fx = focus ? focus.x : 0;
    const fz = focus ? focus.z : 4;
    target.position.set(fx, 0, fz);
    light.position.set(fx + MOON_DIRECTION.x * 30, MOON_DIRECTION.y * 30, fz + MOON_DIRECTION.z * 30);
  });
  return (
    <>
      <hemisphereLight args={['#4b5f8f', '#1f2a1a', 1.15]} />
      <ambientLight color="#2a3557" intensity={0.35} />
      <directionalLight
        ref={moonRef}
        color={PALETTE.moonlight}
        intensity={1.5}
        castShadow={quality.shadows}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
      <object3D ref={targetRef} />
      {/* Moon disc + soft halo, placed far along the light direction and excluded from fog. */}
      <group position={[MOON_DIRECTION.x * 150, MOON_DIRECTION.y * 150, MOON_DIRECTION.z * 150]}>
        <mesh>
          <sphereGeometry args={[6, 20, 14]} />
          <meshBasicMaterial color="#eef2ff" fog={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[11, 20, 14]} />
          <meshBasicMaterial color="#a6b9d8" transparent opacity={0.12} fog={false} depthWrite={false} />
        </mesh>
      </group>
      <Stars radius={170} depth={30} count={quality.stars} factor={4} saturation={0} fade speed={0.3} />
      {quality.fireflies > 0 && <Fireflies count={quality.fireflies} />}
    </>
  );
}
