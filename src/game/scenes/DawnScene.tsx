import { useEffect, useMemo } from 'react';
import { Vector3 } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { damp } from '../../lib/math';
import { useAppStore } from '../../state/useAppStore';
import { useGameRuntime } from '../GameRuntime';
import { ThiefModel } from '../characters/ThiefModel';
import { setAction } from '../characters/rigTypes';
import { daylight } from '../effects/daylight';
import { disableCutout } from '../effects/cameraCutout';

/** Where the thief greets the sunrise: the southern village edge, facing east. */
const SPOT = new Vector3(2.5, 0, 38.5);

/**
 * Dawn transition in 3D: the thief stands at the village edge stretching while the real lights,
 * sky, fog and sun change (driven by `daylight.factor`, animated by the dawn overlay). The camera
 * slowly swings round to frame him against the rising sun.
 */
export function DawnScene() {
  const runtime = useGameRuntime();
  const camera = useThree((s) => s.camera);
  const look = useMemo(() => SPOT.clone().add(new Vector3(0, 1.2, 0)), []);
  const target = useMemo(() => new Vector3(), []);
  useEffect(() => {
    const p = runtime.player;
    p.mode = 'idle';
    p.horizontalSpeed = 0;
    p.carry = Math.max(0.3, p.loadRatio);
    setAction(p, 'sit-up');
    return () => setAction(p, null);
  }, [runtime]);

  useFrame((_, rawDt) => {
    if (useAppStore.getState().paused) return;
    const dt = Math.min(rawDt, 0.1);
    const t = daylight.factor;
    disableCutout();
    if (t > 0.55 && runtime.player.action === 'sit-up') setAction(runtime.player, 'proud');
    const reduced = useAppStore.getState().settings.reducedMotion;
    const a = (reduced ? 0.4 : 0.15 + t * 0.6) * Math.PI;
    target.set(SPOT.x - Math.cos(a) * 4.5, 1.6 + t * 0.4, SPOT.z + Math.sin(a) * 4.5);
    camera.position.x = damp(camera.position.x, target.x, 2, dt);
    camera.position.y = damp(camera.position.y, target.y, 2, dt);
    camera.position.z = damp(camera.position.z, target.z, 2, dt);
    camera.lookAt(look);
  });

  return (
    <group position={SPOT} rotation={[0, Math.PI / 2, 0]}>
      <ThiefModel driver={runtime.player} />
    </group>
  );
}
