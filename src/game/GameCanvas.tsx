import { Suspense, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics, useRapier } from '@react-three/rapier';
import { PCFSoftShadowMap, type Material, type Mesh } from 'three';
import { useAppStore, WORLD_PHASES } from '../state/useAppStore';
import { useRunStore } from '../state/useRunStore';
import { debugEnabled, debugHooks, npcsDisabledForTests } from './debugHooks';
import { WorldItems } from './world/WorldItems';
import { NightDirector } from './systems/NightDirector';
import { VillagerNpc } from './characters/VillagerNpc';
import { RahimSleeper } from './characters/RahimSleeper';
import { CaughtScene } from './scenes/CaughtScene';
import { PrepCamera, PrepStage } from './scenes/PrepStage';
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
    if (!debugEnabled()) return;
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
        npcs: [...runtime.npcs.values()].map((n) => ({ id: n.id, x: n.position.x, z: n.position.z, state: n.state, suspicion: n.suspicion, fx: n.facing.x, fz: n.facing.z })),
        run: (() => {
          const r = useRunStore.getState().run;
          return r
            ? { inventory: r.inventory.map((i) => i.lootId), inventoryIds: r.inventory.map((i) => i.instanceId), worldItems: r.worldItems.map((w) => ({ id: w.instanceId, lootId: w.lootId, x: w.position[0], y: w.position[1], z: w.position[2] })), holes: [...r.holesOpened], entered: [...r.houseIdsEntered], outcome: r.outcome, confiscated: r.confiscated.length, detections: r.detections, chases: r.chases, events: r.events.map((e) => e.type) }
            : null;
        })(),
        loadRatio: runtime.player.loadRatio,
        simTime: runtime.simTime,
        script: runtime.player.script !== null,
        cosmetic: { ...runtime.player.cosmetic },
        prep: debugHooks.prep?.() ?? null,
        entry: debugHooks.entry?.() ?? null,
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
      interactionTargets: () => runtime.interactions.size,
      ray: (o: [number, number, number], d: [number, number, number], max: number) => {
        const hit = world.castRay(new rapier.Ray({ x: o[0], y: o[1], z: o[2] }, { x: d[0], y: d[1], z: d[2] }), max, true);
        return hit ? hit.timeOfImpact : null;
      },
    };
    return () => {
      delete w.__sidhelPhysics;
    };
  }, [world, rapier, runtime]);
  return null;
}

const SIMULATING = ['night', 'entry', 'interior', 'chase'];

function World({ quality }: { quality: QualityProfile }) {
  const phase = useAppStore((s) => s.phase);
  const paused = useAppStore((s) => s.paused);
  const sessionId = useAppStore((s) => s.sessionId);
  const inWorld = WORLD_PHASES.includes(phase);
  const npcs = !npcsDisabledForTests();

  return (
    <Physics timeStep={1 / 60} paused={paused || !SIMULATING.includes(phase)} updatePriority={-50} gravity={[0, -22, 0]}>
      <SceneReadySignal />
      <DebugPhysicsBridge />
      <VillageScenery />
      {inWorld && (
        <group key={sessionId}>
          <Player />
          <ThirdPersonCamera />
          <ZoneSystem />
          <InteractionDriver />
          <VillageInteractables />
          <WorldItems />
          <NightDirector />
          {npcs && <VillagerNpc />}
          <RahimSleeper />
          {phase === 'caught' && <CaughtScene />}
        </group>
      )}
      {phase === 'preparation' && (
        <>
          <PrepStage />
          <PrepCamera />
        </>
      )}
      {!inWorld && phase !== 'preparation' && <MenuCamera />}
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
