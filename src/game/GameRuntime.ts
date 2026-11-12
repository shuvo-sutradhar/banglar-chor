import { createContext, useContext } from 'react';
import { Vector3, type Object3D } from 'three';
import type { RapierCollider, RapierRigidBody } from '@react-three/rapier';
import { InputController } from './controls/InputController';
import { InteractionRegistry } from './systems/InteractionSystem';
import type { MovementMode } from './physics/motorMath';
import type { CameraPresetId } from './data/tuning';

/**
 * Mutable per-session simulation state shared between 3D systems via refs (never React state).
 * One instance per mounted game; nothing here triggers React renders.
 */
export type PlayerRuntime = {
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
};

export type CameraRuntime = {
  yaw: number;
  pitch: number;
  preset: CameraPresetId;
  /** Ids of sensor zones currently containing the player that request the interior preset. */
  interiorZones: Set<string>;
  /** Distance after occlusion, for debugging/tests. */
  currentDistance: number;
  occluded: boolean;
};

export type GameRuntime = {
  input: InputController;
  interactions: InteractionRegistry;
  player: PlayerRuntime;
  camera: CameraRuntime;
};

export function createGameRuntime(): GameRuntime {
  return {
    input: new InputController(),
    interactions: new InteractionRegistry(),
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
    },
    camera: {
      yaw: 0,
      pitch: 0.32,
      preset: 'exploration',
      interiorZones: new Set(),
      currentDistance: 0,
      occluded: false,
    },
  };
}

export const GameRuntimeContext = createContext<GameRuntime | null>(null);

export function useGameRuntime(): GameRuntime {
  const runtime = useContext(GameRuntimeContext);
  if (!runtime) throw new Error('useGameRuntime must be used inside GameRuntimeContext');
  return runtime;
}
