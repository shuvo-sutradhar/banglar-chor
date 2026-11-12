import { create } from 'zustand';
import type { MovementMode } from '../game/physics/motorMath';
import type { InteractionKind } from '../game/systems/InteractionSystem';
import type { CameraPresetId } from '../game/data/tuning';

export type HudFocus = { id: string; kind: InteractionKind; labelBn: string } | null;
export type HudCaption = { id: number; text: string; speaker?: string } | null;

/**
 * Coarse HUD state. Simulation writes here ONLY when a value changes
 * (mode switch, zone enter/exit, focus change) — never per frame.
 */
type HudState = {
  movementMode: MovementMode;
  zoneLabel: string | null;
  focus: HudFocus;
  caption: HudCaption;
  cameraPreset: CameraPresetId;
  crouched: boolean;
  touchUi: boolean;

  setMovementMode: (mode: MovementMode) => void;
  setZoneLabel: (label: string | null) => void;
  setFocus: (focus: HudFocus) => void;
  showCaption: (text: string, speaker?: string) => void;
  clearCaption: (id: number) => void;
  setCameraPreset: (preset: CameraPresetId) => void;
  setCrouched: (crouched: boolean) => void;
  setTouchUi: (touch: boolean) => void;
  resetSession: () => void;
};

let captionCounter = 0;

export const useHudStore = create<HudState>()((set, get) => ({
  movementMode: 'idle',
  zoneLabel: null,
  focus: null,
  caption: null,
  cameraPreset: 'exploration',
  crouched: false,
  touchUi: false,

  setMovementMode: (movementMode) => {
    if (get().movementMode !== movementMode) set({ movementMode });
  },
  setZoneLabel: (zoneLabel) => {
    if (get().zoneLabel !== zoneLabel) set({ zoneLabel });
  },
  setFocus: (focus) => {
    if (get().focus?.id !== focus?.id) set({ focus });
  },
  showCaption: (text, speaker) => set({ caption: { id: ++captionCounter, text, speaker } }),
  clearCaption: (id) => {
    if (get().caption?.id === id) set({ caption: null });
  },
  setCameraPreset: (cameraPreset) => {
    if (get().cameraPreset !== cameraPreset) set({ cameraPreset });
  },
  setCrouched: (crouched) => {
    if (get().crouched !== crouched) set({ crouched });
  },
  setTouchUi: (touchUi) => {
    if (get().touchUi !== touchUi) set({ touchUi });
  },
  resetSession: () => set({ movementMode: 'idle', zoneLabel: null, focus: null, caption: null, cameraPreset: 'exploration', crouched: false }),
}));
