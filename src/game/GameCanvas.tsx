import { Suspense, useEffect, useState } from 'react';
import { readPerf, resetPerf, simBegin, simEnd } from './perfCounters';
import { minigameTimeScale } from '../lib/PausableClock';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics, useAfterPhysicsStep, useBeforePhysicsStep, useRapier } from '@react-three/rapier';
import { PCFSoftShadowMap, type BufferGeometry, type Material, type Mesh, type Points } from 'three';
import { useAppStore, WORLD_PHASES } from '../state/useAppStore';
import { useRunStore } from '../state/useRunStore';
import { debugEnabled, debugHooks, npcsDisabledForTests } from './debugHooks';
import { thiefVisual } from './characters/glb/thiefAsset';
import { nightBody } from './systems/nightBody';
import { audio } from './audio/AudioManager';
import { voice, voiceAvailability } from './audio/voice';
import { WorldItems } from './world/WorldItems';
import { NightDirector } from './systems/NightDirector';
import { VillageLife } from './systems/VillageLifeDirector';
import { PatrolNpc } from './characters/PatrolNpc';
import { MOJNU_CONFIG } from './characters/npcConfigs';
import { RahimSleeper } from './characters/RahimSleeper';
import { CaughtScene } from './scenes/CaughtScene';
import { PrepCamera, PrepStage } from './scenes/PrepStage';
import { DawnScene } from './scenes/DawnScene';
import { SafehouseCamera, SafehouseStage } from './scenes/SafehouseStage';
import { BazaarScenery } from './world/BazaarScenery';
import { BazaarWorld } from './systems/BazaarDirector';
import { BAZAAR_SPAWN } from './world/bazaarLayout';
import { PLAYER_SPAWN } from './data/tuning';
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

/** Times each physics frame (all before-step systems + Rapier); mounted first inside <Physics>. */
function SimTimer() {
  useBeforePhysicsStep(simBegin);
  useAfterPhysicsStep(simEnd);
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
const frameStepCap: { value: number | null } = { value: null };

function DebugBridge() {
  const runtime = useGameRuntime();
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    if (!debugEnabled()) return;
    const original = clock.getDelta.bind(clock);
    clock.getDelta = () => {
      const d = original();
      return frameStepCap.value === null ? d : Math.min(d, frameStepCap.value);
    };
    const restoreClock = () => {
      clock.getDelta = original;
      frameStepCap.value = null;
      minigameTimeScale.value = 1;
    };
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
        zone: useAppStore.getState().zone,
        market: (() => {
          const r = useRunStore.getState();
          const m = r.run?.market;
          return m
            ? { money: m.money, sold: m.sold.map((s) => ({ id: s.instanceId, lootId: s.lootId, price: s.price, merchant: s.merchantId })), merchants: m.merchants, recognitions: m.recognitions, detections: m.detections, outcome: m.outcome, wanted: r.wanted, rahimRecognition: r.rahimRecognition, activeMerchant: r.activeMerchant, exitPrompt: r.exitPrompt }
            : null;
        })(),
        trade: debugHooks.trade?.() ?? null,
        persuade: debugHooks.persuade?.() ?? null,
        dawn: debugHooks.dawn?.() ?? null,
        thief: { visual: thiefVisual.kind, error: thiefVisual.error, url: thiefVisual.url, loadMs: thiefVisual.loadMs, stats: thiefVisual.stats, anim: debugHooks.anim?.() ?? null },
        lastResult: useAppStore.getState().lastResult,
        savedRuns: useAppStore.getState().runs.length,
        render: { calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures },
        listeners: { noise: runtime.noise.listenerCount, interactions: runtime.interactions.size, npcs: runtime.npcs.size },
        // Phase 4B (read-only): progression, tonight's body/plan, audio and dialogue state.
        profile: (() => {
          const p = useAppStore.getState().profile;
          return { bank: p.bank, energy: p.energy, day: p.day, owned: [...p.owned], equipped: { ...p.equipped }, supplies: { ...p.supplies }, buff: p.buff, heat: p.heat, spentFood: p.spentFood, spentUpgrades: p.spentUpgrades, credited: p.creditedRuns.length };
        })(),
        body: (() => {
          const b = nightBody.current;
          return { stamina: b.stamina.value, staminaMax: b.stamina.params.max, exhausted: b.stamina.exhausted, sprintSeconds: b.stamina.sprintSeconds, digs: b.stamina.digs, energyStart: b.loadout.energy, tool: runtime.player.tool ?? null, clipPhase: runtime.player.clipPhase ?? null, action: runtime.player.action, mods: b.loadout.mods, supplies: { ...b.supplies } };
        })(),
        plan: nightBody.current.plan,
        audio: { ...audio.state, counts: Object.fromEntries(audio.counts) },
        voice: { current: voice.current?.id ?? null, log: voice.log.slice(-12), files: voiceAvailability().files },
      }),
      /** Animation CPU counters (procedural rigs vs the thief's mixer), see perfCounters.ts. */
      perf: () => readPerf(),
      resetPerf: () => resetPerf(),
      setCameraYaw: (yaw: number) => {
        runtime.camera.yaw = yaw;
      },
      /** Debug: visible draw items grouped by material/geometry type (where do draw calls go?). */
      drawBreakdown: () => {
        const counts = new Map<string, number>();
        scene.traverseVisible((o) => {
          const m = o as Mesh;
          if (!m.isMesh && !(o as Points).isPoints) return;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mt of mats) {
            const key = `${o.type}:${mt?.type ?? '?'}:${(m.geometry as BufferGeometry | undefined)?.type ?? '?'}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        });
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
      },
      /** Test-only time skip for long timers (night clock, Rahim arrival). Requires ?debug=1. */
      advanceClock: (sec: number) => {
        runtime.simTime += sec;
      },
      /**
       * Test-only controllable simulation time. Caps the frame delta every system sees (physics
       * included), so at very low headless frame rates one rendered frame advances at most `sec`
       * of game time instead of up to 0.5 s (Rapier's own clamp). Game time then runs slower
       * than wall-clock time but movement per input sample stays small and deterministic.
       * `null` restores normal real-time behaviour. Never used by gameplay.
       */
      setMaxFrameStep: (sec: number | null) => {
        frameStepCap.value = sec;
      },
      /** Test-only: minigame clocks (preparation, entry, persuasion) run at this rate (1 = real time). */
      setMinigameTimeScale: (scale: number) => {
        minigameTimeScale.value = Math.min(1, Math.max(0.05, scale));
      },
      minigameTimeScale: () => minigameTimeScale.value,
    };
    return () => {
      delete w.__sidhel;
      restoreClock();
    };
  }, [runtime, gl, scene, clock]);
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

const SIMULATING = ['night', 'entry', 'interior', 'chase', 'bazaar', 'bargain'];

function World({ quality }: { quality: QualityProfile }) {
  const phase = useAppStore((s) => s.phase);
  const paused = useAppStore((s) => s.paused);
  const sessionId = useAppStore((s) => s.sessionId);
  const zone = useAppStore((s) => s.zone);
  const inWorld = WORLD_PHASES.includes(phase);
  const npcs = !npcsDisabledForTests();

  return (
    <Physics timeStep={1 / 60} paused={paused || !SIMULATING.includes(phase)} updatePriority={-50} gravity={[0, -22, 0]}>
      <SimTimer />
      <SceneReadySignal />
      <DebugPhysicsBridge />
      {/* Only one zone's colliders/meshes exist at a time (no duplicate physics, D-031). */}
      {zone === 'village' ? <VillageScenery /> : <BazaarScenery />}
      {inWorld && (
        <group key={`${sessionId}-${zone}`}>
          <Player spawn={zone === 'bazaar' ? BAZAAR_SPAWN : PLAYER_SPAWN} />
          <ThirdPersonCamera />
          <InteractionDriver />
          {zone === 'village' ? (
            <>
              <ZoneSystem />
              <VillageInteractables />
              <WorldItems />
              <NightDirector />
              <VillageLife />
              {npcs && <PatrolNpc config={MOJNU_CONFIG} />}
              <RahimSleeper />
            </>
          ) : (
            <BazaarWorld />
          )}
          {phase === 'caught' && <CaughtScene />}
        </group>
      )}
      {phase === 'dawn' && <DawnScene />}
      {phase === 'safehouse' && (
        <>
          <SafehouseStage />
          <SafehouseCamera />
        </>
      )}
      {phase === 'preparation' && (
        <>
          <PrepStage />
          <PrepCamera />
        </>
      )}
      {!inWorld && phase !== 'preparation' && phase !== 'dawn' && phase !== 'safehouse' && <MenuCamera />}
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
