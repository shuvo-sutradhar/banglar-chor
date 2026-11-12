import { Suspense, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics, useRapier } from '@react-three/rapier';
import { PCFSoftShadowMap, type Material, type Mesh } from 'three';
import { useAppStore } from '../state/useAppStore';
import { useHudStore } from '../state/useHudStore';
import type { QualityProfile } from '../state/settings';
import { useQualityProfile } from './quality';
import { GameRuntimeContext, useGameRuntime, type GameRuntime } from './GameRuntime';
import { MenuCamera, ThirdPersonCamera } from './camera/CameraDirector';
import { Player } from './characters/Player';
import { NightAtmosphere } from './effects/NightAtmosphere';
import { InteractionDriver } from './systems/InteractionDriver';
import { ZoneSystem } from './systems/ZoneSystem';
import { VillageInteractables, VillageScenery } from './world/Village';
import { PALETTE } from './world/materials';

/** Applies shadow toggles live without remounting the Canvas (quality changes keep the session). */
function QualityApplier({ quality }: { quality: QualityProfile }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (gl.shadowMap.enabled === quality.shadows) return;
    gl.shadowMap.enabled = quality.shadows;
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[];
      for (const m of mats) m.needsUpdate = true;
    });
    invalidate();
  }, [gl, scene, quality.shadows, invalidate]);
  return null;
}

function SceneReadySignal() {
  const setSceneReady = useAppStore((s) => s.setSceneReady);
  useEffect(() => {
    setSceneReady(true);
  }, [setSceneReady]);
  return null;
}

/** Debug hook for automated smoke tests: exposes read-only simulation state when `?debug=1` (or in dev). */
function DebugBridge() {
  const runtime = useGameRuntime();
  useEffect(() => {
    const enabled = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
    if (!enabled) return;
    const w = window as unknown as { __sidhel?: unknown };
    w.__sidhel = {
      snapshot: () => ({
        player: runtime.player.body
          ? { x: runtime.player.position.x, y: runtime.player.position.y, z: runtime.player.position.z, mode: runtime.player.mode, grounded: runtime.player.grounded, speed: runtime.player.horizontalSpeed }
          : null,
        camera: { yaw: runtime.camera.yaw, pitch: runtime.camera.pitch, preset: runtime.camera.preset, distance: runtime.camera.currentDistance, occluded: runtime.camera.occluded },
        crouched: runtime.input.crouched,
        app: { phase: useAppStore.getState().phase, paused: useAppStore.getState().paused },
        hud: { zone: useHudStore.getState().zoneLabel, focus: useHudStore.getState().focus?.id ?? null, caption: useHudStore.getState().caption?.text ?? null, mode: useHudStore.getState().movementMode },
      }),
      setCameraYaw: (yaw: number) => {
        runtime.camera.yaw = yaw;
      },
    };
    return () => {
      delete w.__sidhel;
    };
  }, [runtime]);
  return null;
}

/** Debug-only raycast probe (enabled with `?debug=1`) used by smoke tests to verify scene queries. */
function DebugPhysicsBridge() {
  const { world, rapier } = useRapier();
  const runtime = useGameRuntime();
  useEffect(() => {
    const enabled = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
    if (!enabled) return;
    const w = window as unknown as { __sidhelPhysics?: unknown };
    w.__sidhelPhysics = {
      colliders: () => world.colliders.len(),
      flags: () => ({ excludeSensors: rapier.QueryFilterFlags.EXCLUDE_SENSORS }),
      interactionTargets: () => runtime.interactions.size,
      ray: (o: [number, number, number], d: [number, number, number], max: number, flags?: number, groups?: number) => {
        const variant = groups ?? 0;
        const ray = new rapier.Ray({ x: o[0], y: o[1], z: o[2] }, { x: d[0], y: d[1], z: d[2] });
        const hit =
          variant === 1
            ? world.castRay(ray, max, true, flags, undefined, undefined, runtime.player.body ?? undefined)
            : variant === 2
              ? world.castRay(ray, max, true, flags, undefined, undefined, undefined, () => true)
              : variant === 3
                ? world.castRay(ray, max, true, flags, undefined, undefined, undefined, (c) => (c.collisionGroups() >>> 16) !== 0)
                : world.castRay(ray, max, true, flags);
        return hit ? hit.timeOfImpact : null;
      },
    };
    return () => {
      delete w.__sidhelPhysics;
    };
  }, [world, rapier, runtime]);
  return null;
}

function World({ quality }: { quality: QualityProfile }) {
  const phase = useAppStore((s) => s.phase);
  const paused = useAppStore((s) => s.paused);
  const sessionId = useAppStore((s) => s.sessionId);
  const inWorld = phase === 'night';

  return (
    <Physics timeStep={1 / 60} paused={paused || !inWorld} updatePriority={-50} gravity={[0, -22, 0]}>
      <SceneReadySignal />
      <DebugPhysicsBridge />
      <VillageScenery />
      {inWorld ? (
        <group key={sessionId}>
          <Player />
          <ThirdPersonCamera />
          <ZoneSystem />
          <InteractionDriver />
          <VillageInteractables />
        </group>
      ) : (
        <MenuCamera />
      )}
      <NightAtmosphere quality={quality} />
    </Physics>
  );
}

export function GameCanvas({ runtime }: { runtime: GameRuntime }) {
  const quality = useQualityProfile();
  const paused = useAppStore((s) => s.paused);
  const setContextLost = useAppStore((s) => s.setContextLost);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasEl) return;
    return runtime.input.attachPointerLook(canvasEl);
  }, [canvasEl, runtime]);

  useEffect(() => {
    if (!canvasEl) return;
    const onLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onRestored = () => setContextLost(false);
    canvasEl.addEventListener('webglcontextlost', onLost);
    canvasEl.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvasEl.removeEventListener('webglcontextlost', onLost);
      canvasEl.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [canvasEl, setContextLost]);

  return (
    <Canvas
      className="game-canvas"
      shadows={{ enabled: quality.shadows, type: PCFSoftShadowMap }}
      dpr={quality.dpr}
      gl={{ antialias: quality.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      camera={{ fov: 55, near: 0.1, far: 260, position: [20, 12, 30] }}
      frameloop={paused ? 'demand' : 'always'}
      onCreated={({ gl }) => setCanvasEl(gl.domElement)}
    >
      <GameRuntimeContext.Provider value={runtime}>
        <color attach="background" args={[PALETTE.nightSky]} />
        <fog attach="fog" args={[PALETTE.nightSky, 14, quality.fogFar]} />
        <QualityApplier quality={quality} />
        <DebugBridge />
        <Suspense fallback={null}>
          <World quality={quality} />
        </Suspense>
      </GameRuntimeContext.Provider>
    </Canvas>
  );
}
