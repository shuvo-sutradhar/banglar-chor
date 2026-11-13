import { z } from 'zod';

export const QUALITY_LEVELS = ['auto', 'low', 'medium', 'high'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];
export type ResolvedQuality = Exclude<QualityLevel, 'auto'>;

export const settingsSchema = z.object({
  quality: z.enum(QUALITY_LEVELS),
  reducedMotion: z.boolean(),
  /** Multiplier on camera drag speed. */
  cameraSensitivity: z.number().min(0.3).max(2.5),
  invertY: z.boolean(),
  showControlHints: z.boolean(),
  subtitles: z.boolean(),
  // Added in Phase 2 with defaults so v1 saves from Phase 1 still validate.
  volume: z.number().min(0).max(1).default(0.8),
  muted: z.boolean().default(false),
  /** Rough crowd lines in the catch scene (README §9). Off = family-friendly alternatives. */
  roughDialogue: z.boolean().default(false),
  /**
   * Thief visual: the skinned GLB model (with the procedural rig as automatic fallback) or the
   * original procedural rig. Added with the premium pass; defaulted so older saves validate.
   */
  characterModel: z.enum(['model', 'procedural']).default('model'),
});

export type Settings = z.output<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  reducedMotion: false,
  cameraSensitivity: 1,
  invertY: false,
  showControlHints: true,
  subtitles: true,
  volume: 0.8,
  muted: false,
  roughDialogue: false,
  characterModel: 'model',
};

export type QualityProfile = {
  level: ResolvedQuality;
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  fireflies: number;
  fogFar: number;
  stars: number;
};

export const QUALITY_PROFILES: Record<ResolvedQuality, QualityProfile> = {
  low: { level: 'low', dpr: [0.75, 1], shadows: false, shadowMapSize: 512, antialias: false, fireflies: 0, fogFar: 55, stars: 600 },
  medium: { level: 'medium', dpr: [1, 1.5], shadows: true, shadowMapSize: 1024, antialias: true, fireflies: 50, fogFar: 70, stars: 1200 },
  high: { level: 'high', dpr: [1, 2], shadows: true, shadowMapSize: 2048, antialias: true, fireflies: 110, fogFar: 85, stars: 2200 },
};

export type DeviceHints = { coarsePointer: boolean; hardwareConcurrency: number; deviceMemoryGb?: number };

/** `auto` is deliberately conservative on phones (README §16). */
export function resolveQuality(level: QualityLevel, hints: DeviceHints): ResolvedQuality {
  if (level !== 'auto') return level;
  const weak = hints.hardwareConcurrency <= 4 || (hints.deviceMemoryGb !== undefined && hints.deviceMemoryGb <= 3);
  if (hints.coarsePointer) return weak ? 'low' : 'medium';
  return weak ? 'medium' : 'high';
}
