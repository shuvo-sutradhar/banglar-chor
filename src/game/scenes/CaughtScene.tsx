import { useMemo, useRef } from 'react';
import { OctahedronGeometry, MeshBasicMaterial, type Group, type Mesh } from 'three';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../state/useAppStore';
import { useGameRuntime } from '../GameRuntime';
import { HumanRig } from '../characters/HumanRig';
import { NEIGHBOUR_LOOKS } from '../characters/appearances';
import type { RigDriver } from '../characters/rigTypes';
import { mat } from '../world/materials';
import { UNIT_BOX, UNIT_SPHERE } from '../world/sharedGeometry';
import { insideRahimHouse } from '../data/rahimHouse';

const STAR_GEO = new OctahedronGeometry(0.07, 0);
const STAR_MAT = new MeshBasicMaterial({ color: '#ffe066', fog: false });

/**
 * Comic, non-graphic catch vignette (README §9): neighbours come running with theatrical
 * footwork, a dust cloud puffs up, the thief's sandal flies off and stars orbit his head.
 * Nobody is hurt; it plays in 3D around the actual catch location.
 */
export function CaughtScene() {
  const runtime = useGameRuntime();
  const origin = useMemo(() => runtime.player.position.clone(), [runtime]);
  // Indoors, neighbours would have to run through walls — the homeowner alone does the shouting.
  const indoors = useMemo(() => insideRahimHouse(origin.x, origin.z), [origin]);
  const t = useRef(0);
  const dust = useRef<(Mesh | null)[]>([]);
  const stars = useRef<Group>(null);
  const sandal = useRef<Mesh>(null);
  const neighbours = useRef<(Group | null)[]>([]);
  const drivers = useMemo<RigDriver[]>(() => NEIGHBOUR_LOOKS.map(() => ({ horizontalSpeed: 4, mode: 'run', action: null, actionTime: 0 })), []);
  const starts = useMemo(
    () => [
      { from: [origin.x + 7, origin.z + 3], to: [origin.x + 1.3, origin.z + 0.6] },
      { from: [origin.x - 6, origin.z - 5], to: [origin.x - 1.2, origin.z - 0.7] },
    ],
    [origin],
  );
  const puffs = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * Math.PI * 2, r: 0.4 + (i % 3) * 0.25, h: 0.2 + (i % 2) * 0.3 })), []);

  useFrame((_, rawDt) => {
    if (useAppStore.getState().paused) return;
    const dt = Math.min(rawDt, 0.1);
    t.current += dt;
    const time = t.current;
    const reduced = useAppStore.getState().settings.reducedMotion;

    // Dust cloud: puffs expand and fade in the first ~2.5 s, then a second puff when neighbours arrive.
    puffs.forEach((p, i) => {
      const m = dust.current[i];
      if (!m) return;
      const local = (time % 2.6) / 2.6;
      const s = 0.3 + local * 1.4;
      m.position.set(origin.x + Math.cos(p.a + time * 0.5) * p.r * (1 + local), p.h + local * 0.6, origin.z + Math.sin(p.a + time * 0.5) * p.r * (1 + local));
      m.scale.setScalar(s * 0.5);
      m.visible = time < 5.2;
    });

    // Stars orbit the thief's head.
    if (stars.current) {
      stars.current.position.set(origin.x, origin.y + 1.75, origin.z);
      stars.current.rotation.y = reduced ? 0 : time * 3.2;
      stars.current.visible = time > 0.5;
    }

    // Sandal arcs off and lands.
    if (sandal.current) {
      const k = Math.min(1, time / 0.9);
      sandal.current.position.set(origin.x + k * 1.8, 0.05 + Math.sin(k * Math.PI) * 1.6, origin.z + k * 0.9);
      sandal.current.rotation.set(k * 9, k * 4, 0);
    }

    // Neighbours run in, then gesture and shout.
    starts.forEach((s, i) => {
      const g = neighbours.current[i];
      const d = drivers[i];
      if (!g || !d) return;
      const k = Math.min(1, Math.max(0, (time - 0.6 - i * 0.4) / 1.4));
      const x = s.from[0]! + (s.to[0]! - s.from[0]!) * k;
      const z = s.from[1]! + (s.to[1]! - s.from[1]!) * k;
      g.position.set(x, origin.y, z);
      g.rotation.y = k < 1 ? Math.atan2(s.to[0]! - s.from[0]!, s.to[1]! - s.from[1]!) : Math.atan2(origin.x - x, origin.z - z);
      d.horizontalSpeed = k < 1 ? 4.2 : 0;
      d.mode = k < 1 ? 'run' : 'idle';
      if (k >= 1 && d.action !== 'shout') {
        d.action = 'shout';
        d.actionTime = 0;
      }
    });
  });

  return (
    <>
      {puffs.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            dust.current[i] = m;
          }}
          geometry={UNIT_SPHERE}
          material={mat('dust')}
        />
      ))}
      <group ref={stars}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} geometry={STAR_GEO} material={STAR_MAT} position={[Math.cos((i / 5) * Math.PI * 2) * 0.38, Math.sin(i * 2.1) * 0.05, Math.sin((i / 5) * Math.PI * 2) * 0.38]} />
        ))}
      </group>
      <mesh ref={sandal} geometry={UNIT_BOX} material={mat('black')} scale={[0.12, 0.04, 0.26]} castShadow />
      {!indoors &&
        NEIGHBOUR_LOOKS.map((look, i) => (
        <group
          key={i}
          ref={(g) => {
            neighbours.current[i] = g;
          }}
        >
          <HumanRig driver={drivers[i]!} look={look} />
        </group>
      ))}
    </>
  );
}
