import { useMemo } from 'react';
import { useAppStore } from '../state/useAppStore';
import { QUALITY_PROFILES, resolveQuality, type QualityProfile } from '../state/settings';

export function getDeviceHints() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    hardwareConcurrency: nav.hardwareConcurrency ?? 4,
    deviceMemoryGb: nav.deviceMemory,
  };
}

export function useQualityProfile(): QualityProfile {
  const level = useAppStore((s) => s.settings.quality);
  return useMemo(() => QUALITY_PROFILES[resolveQuality(level, getDeviceHints())], [level]);
}
