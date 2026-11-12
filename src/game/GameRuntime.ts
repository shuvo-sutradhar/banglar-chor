import { createContext, useContext } from 'react';
import { Vector3, type Object3D } from 'three';
import type { RapierCollider, RapierRigidBody } from '@react-three/rapier';
import { InputController } from './controls/InputController';
import { InteractionRegistry } from './systems/InteractionSystem';
import { NoiseBus } from './systems/noise';
import type { MovementMode } from './physics/motorMath';
import type { CameraPresetId } from './data/tuning';
import type { ActionPose, Cosmetic, RigDriver } from './characters/rigTypes';
import type { NpcState } from './ai/npcBrain';

/**
 * Mutable per-session simulation state shared between 3D systems via refs (never React state).
 * One instance per mounted game; nothing here triggers React renders.
 */
export type ScriptedMove = {
  /** Waypoints the body follows (feet positions); used for the crawl through the sidh. */
  path: [number, number, number][];
  duration: number;
  t: number;
  headingY: number;
  action: ActionPose;
  onDone: () => void;
};

export type PlayerRuntime = RigDriver & {
  body: RapierRigidBody | null;
  collider: RapierCollider | null;
  /** Interpolated visual root; the camera follows this for smooth motion. */
  visual: Object3D | null;
  /** Feet position after the latest physics step. */
  position: Vector3;
  /** Horizontal facing direction (normalized). */
  forward: Vector3;
  horizontalSpeed: number;
  mode: MovementMode;
  grounded: boolean;
  /** Seconds since the session began (pausable). */
  elapsed: number;
  /** 0..1 carried weight / capacity; slows movement and amplifies footsteps. */
  loadRatio: number;
  cosmetic: Cosmetic;
  script: ScriptedMove | null;
  /** Requested heading override (e.g. face the wall while digging). */
  faceHeading: number | null;
};

export type CameraMode = 'follow' | 'minigame' | 'caught' | 'chase';

export type CameraRuntime = {
  yaw: number;
  pitch: number;
  preset: CameraPresetId;
  /** Ids of zones currently containing the player that request the interior preset. */
  interiorZones: Set<string>;
  mode: CameraMode;
  /** Yaw the camera eases toward in minigame/caught modes. */
  focusYaw: number | null;
  currentDistance: number;
  occluded: boolean;
};

export type NpcRuntime = {
  id: string;
  nameBn: string;
  position: Vector3;
  facing: Vector3;
  state: NpcState | 'asleep' | 'stirring' | 'awake';
  suspicion: number;
};

export type EntryRuntime = {
  active: boolean;
  /** 0..100, drives the growing hole decal. */
  progress: number;
  /** Increments on every judged tap; the rig uses it to animate a scoop. */
  pulse: number;
};

export type GameRuntime = {
  input: InputController;
  interactions: InteractionRegistry;
  noise: NoiseBus;
  player: PlayerRuntime;
  camera: CameraRuntime;
  npcs: Map<string, NpcRuntime>;
  entry: EntryRuntime;
  /** Pausable simulation seconds (advanced by physics steps). Used to timestamp noise. */
  simTime: number;
};

export function createCosmetic(): Cosmetic {
  return { oil: 0, tuck: 0, headband: false };
}

export function createGameRuntime(): GameRuntime {
  return {
    input: new InputController(),
    interactions: new InteractionRegistry(),
    noise: new NoiseBus(),
    player: {
      body: null,
      collider: null,
      visual: null,
      position: new Vector3(),
      forward: new Vector3(0, 0, -1),
      horizontalSpeed: 0,
      mode: 'idle',
      grounded: true,
      elapsed: 0,
      loadRatio: 0,
      cosmetic: createCosmetic(),
      script: null,
      faceHeading: null,
      action: null,
      actionTime: 0,
    },
    camera: {
      yaw: 0,
      pitch: 0.32,
      preset: 'exploration',
      interiorZones: new Set(),
      mode: 'follow',
      focusYaw: null,
      currentDistance: 0,
      occluded: false,
    },
    npcs: new Map(),
    entry: { active: false, progress: 0, pulse: 0 },
    simTime: 0,
  };
}

/** Reset per-run mutable state (keeps listeners/registries owned by mounted components). */
export function resetRuntimeForRun(rt: GameRuntime): void {
  rt.player.cosmetic = createCosmetic();
  rt.player.script = null;
  rt.player.faceHeading = null;
  rt.player.action = null;
  rt.player.loadRatio = 0;
  rt.camera.mode = 'follow';
  rt.camera.focusYaw = null;
  rt.camera.interiorZones.clear();
  rt.entry.active = false;
  rt.entry.progress = 0;
  rt.noise.clear();
  rt.simTime = 0;
}

export const GameRuntimeContext = createContext<GameRuntime | null>(null);

export function useGameRuntime(): GameRuntime {
  const runtime = useContext(GameRuntimeContext);
  if (!runtime) throw new Error('useGameRuntime must be used inside GameRuntimeContext');
  return runtime;
}
