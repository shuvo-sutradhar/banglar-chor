import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../state/useAppStore';
import { useHudStore } from '../../state/useHudStore';
import { useGameRuntime } from '../GameRuntime';
import { resolveZones } from '../world/layout';

const INTERVAL = 0.1;

/**
 * Trigger regions as pure oriented-box tests at 10 Hz (see DECISIONS D-005).
 * Drives the HUD location label and the interior camera preset.
 */
export function ZoneSystem() {
  const runtime = useGameRuntime();
  const timer = useRef(0);

  useEffect(() => {
    const zones = runtime.camera.interiorZones;
    return () => zones.clear();
  }, [runtime]);

  useFrame((_, dt) => {
    if (useAppStore.getState().paused || !runtime.player.body) return;
    timer.current += dt;
    if (timer.current < INTERVAL) return;
    timer.current = 0;
    const p = runtime.player.position;
    const { label, interior } = resolveZones({ x: p.x, z: p.z });
    const zones = runtime.camera.interiorZones;
    if (interior) zones.add('interior');
    else zones.clear();
    useHudStore.getState().setZoneLabel(label?.labelBn ?? null);
  });

  return null;
}
