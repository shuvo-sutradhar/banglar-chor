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
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  reducedMotion: false,
  cameraSensitivity: 1,
  invertY: false,
  showControlHints: true,
  subtitles: true,
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
