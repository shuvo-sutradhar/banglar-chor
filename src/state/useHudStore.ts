import { create } from 'zustand';
import type { MovementMode } from '../game/physics/motorMath';
import type { InteractionKind } from '../game/systems/InteractionSystem';
import type { CameraPresetId } from '../game/data/tuning';

export type HudFocus = { id: string; kind: InteractionKind; labelBn: string; lootId?: string } | null;
export type HudCaption = { id: number; text: string; speaker?: string; /** Exact display time (voiced lines: synced to playback). */ ms?: number } | null;

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
  /** Stamina 0..1, quantised to 5 % so the HUD re-renders rarely. */
  stamina: number;
  exhausted: boolean;

  setMovementMode: (mode: MovementMode) => void;
  setZoneLabel: (label: string | null) => void;
  setFocus: (focus: HudFocus) => void;
  showCaption: (text: string, speaker?: string, ms?: number) => number;
  clearCaption: (id: number) => void;
  setCameraPreset: (preset: CameraPresetId) => void;
  setCrouched: (crouched: boolean) => void;
  setTouchUi: (touch: boolean) => void;
  setStamina: (ratio: number, exhausted: boolean) => void;
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
  stamina: 1,
  exhausted: false,

  setMovementMode: (movementMode) => {
    if (get().movementMode !== movementMode) set({ movementMode });
  },
  setZoneLabel: (zoneLabel) => {
    if (get().zoneLabel !== zoneLabel) set({ zoneLabel });
  },
  setFocus: (focus) => {
    if (get().focus?.id !== focus?.id) set({ focus });
  },
  showCaption: (text, speaker, ms) => {
    const id = ++captionCounter;
    set({ caption: { id, text, speaker, ms } });
    return id;
  },
  clearCaption: (id) => {
    if (get().caption?.id === id) set({ caption: null });
  },
  setCameraPreset: (cameraPreset) => {
    if (get().cameraPreset !== cameraPreset) set({ cameraPreset });
  },
  setCrouched: (crouched) => {
    if (get().crouched !== crouched) set({ crouched });
  },
  setStamina: (ratio, exhausted) => {
    const q = Math.round(ratio * 20) / 20;
    const s = get();
    if (s.stamina !== q || s.exhausted !== exhausted) set({ stamina: q, exhausted });
  },
  setTouchUi: (touchUi) => {
    if (get().touchUi !== touchUi) set({ touchUi });
  },
  resetSession: () => set({ movementMode: 'idle', zoneLabel: null, focus: null, caption: null, cameraPreset: 'exploration', crouched: false, stamina: 1, exhausted: false }),
}));
