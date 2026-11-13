import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Fog,
  ShaderMaterial,
  Vector3,
  type AmbientLight,
  type DirectionalLight,
  type Group,
  type HemisphereLight,
  type Object3D,
} from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { createRng } from '../../lib/rng';
import { useAppStore } from '../../state/useAppStore';
import { useGameRuntime } from '../GameRuntime';
import { WORLD_BOUNDS } from '../data/tuning';
import { PALETTE } from '../world/materials';
import type { QualityProfile } from '../../state/settings';
import { daylight, keyLightColorAt, keyLightDirAt, skyColorAt } from './daylight';

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

const HEMI_NIGHT_SKY = new Color('#5a6ea2');
const HEMI_DAY_SKY = new Color('#c4ddf2');
const HEMI_NIGHT_GROUND = new Color('#2c3625');
const HEMI_DAY_GROUND = new Color('#6b5a3a');
const AMB_NIGHT = new Color('#2a3557');
const AMB_DAY = new Color('#fff1dc');

/**
 * Sky + lighting for night AND morning, blended by `daylight.factor` (0 night → 1 morning):
 * hemisphere/ambient fill, one key directional light (moon → rising sun; the only shadow caster,
 * frustum follows the player), moon/sun discs, stars and fireflies that fade with the dawn.
 */
export function NightAtmosphere({ quality }: { quality: QualityProfile }) {
  const runtime = useGameRuntime();
  const keyRef = useRef<DirectionalLight>(null);
  const hemiRef = useRef<HemisphereLight>(null);
  const ambRef = useRef<AmbientLight>(null);
  const targetRef = useRef<Object3D>(null);
  const moonRef = useRef<Group>(null);
  const sunRef = useRef<Group>(null);
  const starsRef = useRef<Group>(null);
  const firefliesRef = useRef<Group>(null);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const tmp = useMemo(() => ({ c: new Color(), dir: new Vector3() }), []);

  useEffect(() => {
    const light = keyRef.current;
    const target = targetRef.current;
    if (light && target) light.target = target;
  }, []);

  useEffect(() => {
    const light = keyRef.current;
    if (!light) return;
    light.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    light.shadow.map?.dispose();
    light.shadow.map = null;
  }, [quality.shadowMapSize]);

  useFrame(() => {
    const t = Math.min(1, Math.max(0, daylight.factor));
    const light = keyRef.current;
    const target = targetRef.current;
    if (!light || !target) return;
    const focus = runtime.player.body ? runtime.player.position : null;
    const fx = focus ? focus.x : 0;
    const fz = focus ? focus.z : 4;
    keyLightDirAt(t, tmp.dir);
    target.position.set(fx, 0, fz);
    light.position.set(fx + tmp.dir.x * 30, tmp.dir.y * 30, fz + tmp.dir.z * 30);
    keyLightColorAt(t, light.color);
    light.intensity = 1.85 + 0.95 * t;
    // Night needs a touch more exposure to stay readable; morning is metered normally.
    gl.toneMappingExposure = 1.12 - 0.12 * t;

    skyColorAt(t, tmp.c);
    if (scene.background instanceof Color) scene.background.copy(tmp.c);
    if (scene.fog instanceof Fog) {
      scene.fog.color.copy(tmp.c);
      scene.fog.near = 14 + 16 * t;
      scene.fog.far = quality.fogFar * (1 + 0.6 * t);
    }
    const hemi = hemiRef.current;
    if (hemi) {
      hemi.color.copy(HEMI_NIGHT_SKY).lerp(HEMI_DAY_SKY, t);
      hemi.groundColor.copy(HEMI_NIGHT_GROUND).lerp(HEMI_DAY_GROUND, t);
      hemi.intensity = 1.35 + 0.15 * t;
    }
    const amb = ambRef.current;
    if (amb) {
      amb.color.copy(AMB_NIGHT).lerp(AMB_DAY, t);
      amb.intensity = 0.42 + 0.08 * t;
    }
    if (moonRef.current) moonRef.current.visible = t < 0.55;
    if (starsRef.current) starsRef.current.visible = t < 0.3;
    if (firefliesRef.current) firefliesRef.current.visible = t < 0.2;
    if (sunRef.current) {
      sunRef.current.visible = t > 0.12;
      sunRef.current.position.set(tmp.dir.x * 150, tmp.dir.y * 150, tmp.dir.z * 150);
    }
  });

  return (
    <>
      <hemisphereLight ref={hemiRef} args={['#4b5f8f', '#1f2a1a', 1.15]} />
      <ambientLight ref={ambRef} color="#2a3557" intensity={0.35} />
      <directionalLight
        ref={keyRef}
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
      <group ref={moonRef} position={[MOON_DIRECTION.x * 150, MOON_DIRECTION.y * 150, MOON_DIRECTION.z * 150]}>
        <mesh>
          <sphereGeometry args={[6, 20, 14]} />
          <meshBasicMaterial color="#eef2ff" fog={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[11, 20, 14]} />
          <meshBasicMaterial color="#a6b9d8" transparent opacity={0.12} fog={false} depthWrite={false} />
        </mesh>
      </group>
      <group ref={sunRef} visible={false}>
        <mesh>
          <sphereGeometry args={[7, 20, 14]} />
          <meshBasicMaterial color="#fff0c8" fog={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[14, 20, 14]} />
          <meshBasicMaterial color="#ffc27a" transparent opacity={0.18} fog={false} depthWrite={false} />
        </mesh>
      </group>
      <group ref={starsRef}>
        <Stars radius={170} depth={30} count={quality.stars} factor={4} saturation={0} fade speed={0.3} />
      </group>
      <group ref={firefliesRef}>{quality.fireflies > 0 && <Fireflies count={quality.fireflies} />}</group>
    </>
  );
}
