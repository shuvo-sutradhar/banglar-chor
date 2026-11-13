import { useMemo, useRef } from 'react';
import { CircleGeometry, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3, type Mesh } from 'three';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider } from '@react-three/rapier';
import { CAMERA_TRANSPARENT } from '../physics/queries';
import { useRunStore } from '../../state/useRunStore';
import { useGameRuntime } from '../GameRuntime';
import { HOUSES } from './layout';
import { RAHIM_HOLE } from '../data/rahimHouse';
import { mat } from './materials';
import { Block, ClayStove, HippedThatch, Kolshi, Lantern, Structure, VerandaRamp } from './buildingParts';
import { UNIT_BOX, UNIT_CYLINDER } from './sharedGeometry';

/**
 * Rahim Chacha's mud house, now hollow with a real navigable interior (Phase 2).
 * Local frame: front (door, veranda) = +z faces the road; back wall (-z) faces the bamboo
 * at the village edge — where the fictional sidh opening appears.
 *
 * Wall thickness 0.25 m; room interior x ∈ [-2.75, 2.75], z ∈ [-2.0, 2.0]; floor y = 0.3.
 */

const PLANE = new PlaneGeometry(1, 1);
const DISC = new CircleGeometry(0.5, 18);

/** Dark, growing patch on the outside of the back wall while the entry challenge runs. */
function DigMark() {
  const runtime = useGameRuntime();
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const k = runtime.entry.progress / 100;
    m.visible = k > 0.01;
    m.scale.set(0.3 + 1.0 * k, 0.3 + 1.15 * k, 1);
  });
  return <mesh ref={ref} geometry={DISC} material={mat('holeDark')} position={[0, 0.95, -2.255]} rotation={[0, Math.PI, 0]} visible={false} />;
}

const CLODS = 10;
const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();

/**
 * Dirt clods flicked out of the wall base on every good strike (Phase 4B tool feedback):
 * one instanced mesh, simple ballistic motion, local to the house (outside the back wall).
 */
function DigDirt() {
  const runtime = useGameRuntime();
  const mesh = useMemo(() => {
    const m = new InstancedMesh(UNIT_BOX, mat('mudDark'), CLODS);
    m.count = CLODS;
    m.frustumCulled = false;
    return m;
  }, []);
  const sim = useMemo(() => ({ seen: 0, clods: Array.from({ length: CLODS }, () => ({ p: new Vector3(), v: new Vector3(), life: 0, s: 0.05 })) }), []);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const e = runtime.entry;
    if (e.pulse !== sim.seen) {
      sim.seen = e.pulse;
      if (e.lastKind === 'perfect' || e.lastKind === 'good') {
        const n = e.lastKind === 'perfect' ? 6 : 4;
        let spawned = 0;
        for (const c of sim.clods) {
          if (spawned >= n) break;
          if (c.life > 0) continue;
          c.p.set((Math.random() - 0.5) * 0.4, 0.25, -2.4);
          c.v.set((Math.random() - 0.5) * 1.6, 1.4 + Math.random() * 1.2, -0.8 - Math.random() * 0.9);
          c.life = 0.9;
          c.s = 0.04 + Math.random() * 0.05;
          spawned++;
        }
      }
    }
    let any = false;
    sim.clods.forEach((c, i) => {
      if (c.life > 0) {
        c.life -= dt;
        c.v.y -= 9 * dt;
        c.p.addScaledVector(c.v, dt);
        if (c.p.y < 0.03) {
          c.p.y = 0.03;
          c.v.set(0, 0, 0);
        }
        any = true;
      }
      const s = c.life > 0 ? c.s : 0;
      mesh.setMatrixAt(i, _m.compose(_p.copy(c.p), _q.identity(), _s.set(s, s * 0.8, s)));
    });
    mesh.visible = any;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

function HoleRubble() {
  const lumps: [number, number, number, number][] = [
    [-0.5, 0.08, -2.75, 0.22],
    [0.35, 0.06, -2.85, 0.18],
    [0.0, 0.1, -3.0, 0.26],
    [0.6, 0.05, -2.6, 0.14],
  ];
  return (
    <>
      {lumps.map(([x, y, z, s]) => (
        <mesh key={`${x}${z}`} geometry={UNIT_BOX} material={mat('mudDark')} position={[x, y, z]} rotation={[0.3, x, 0.2]} scale={[s, s * 0.7, s]} castShadow />
      ))}
      {/* Ragged rim around the opening */}
      {[
        [-0.7, 0.6, 0.12],
        [0.7, 0.8, -0.15],
        [-0.55, 1.5, 0.3],
        [0.55, 1.45, -0.3],
        [0, 1.6, 0],
      ].map(([x, y, r]) => (
        <mesh key={`${x}${y}`} geometry={UNIT_BOX} material={mat('mudDark')} position={[x as number, y as number, -2.27]} rotation={[0, 0, r as number]} scale={[0.25, 0.18, 0.08]} />
      ))}
    </>
  );
}

function Interior() {
  return (
    <>
      <mesh geometry={PLANE} material={mat('courtyard')} position={[0, 0.305, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[5.5, 4.0, 1]} receiveShadow />
      {/* Ceiling (thatch underside): hides the roof cone; the indoor camera ignores it (cutaway view). */}
      <Block size={[5.6, 0.06, 4.1]} position={[0, 2.58, 0]} material={mat('thatch')} collider shell castShadow={false} />
      {/* Inner door and window shutters */}
      <Block size={[1.0, 1.75, 0.04]} position={[0, 1.18, 1.99]} material={mat('woodDark')} castShadow={false} />
      {[-1.8, 1.8].map((x) => (
        <Block key={x} size={[0.7, 0.6, 0.04]} position={[x, 1.6, 1.99]} material={mat('wood')} castShadow={false} />
      ))}
      {/* চৌকি — wooden cot where Rahim Chacha sleeps */}
      <group position={[1.9, 0.3, -0.9]}>
        <Block size={[1.1, 0.08, 2.0]} position={[0, 0.42, 0]} material={mat('wood')} />
        <Block size={[1.05, 0.06, 1.95]} position={[0, 0.49, 0]} material={mat('cloth2')} castShadow={false} />
        <Block size={[0.5, 0.12, 0.3]} position={[0, 0.58, -0.75]} material={mat('genjiWhite')} castShadow={false} />
        {[
          [-0.48, -0.9],
          [0.48, -0.9],
          [-0.48, 0.9],
          [0.48, 0.9],
        ].map(([x, z]) => (
          <mesh key={`${x}${z}`} geometry={UNIT_BOX} material={mat('woodDark')} position={[x as number, 0.19, z as number]} scale={[0.08, 0.38, 0.08]} />
        ))}
        <CuboidCollider args={[0.55, 0.26, 1.0]} position={[0, 0.26, 0]} name={CAMERA_TRANSPARENT} />
      </group>
      {/* তাক — wall shelf (radio, lantern, clock sit here) */}
      <group position={[-2.55, 1.2, -0.4]}>
        <Block size={[0.38, 0.05, 1.8]} position={[0, 0, 0]} material={mat('wood')} />
        {[-0.75, 0.75].map((z) => (
          <Block key={z} size={[0.3, 0.05, 0.05]} position={[0, -0.08, z]} rotation={[0, 0, -0.6]} material={mat('woodDark')} castShadow={false} />
        ))}
        <CuboidCollider args={[0.19, 0.03, 0.9]} name={CAMERA_TRANSPARENT} />
      </group>
      {/* টিনের ট্রাঙ্ক */}
      <group position={[1.95, 0.3, 1.45]}>
        <Block size={[0.8, 0.5, 0.5]} position={[0, 0.25, 0]} material={mat('doorPaint')} />
        <Block size={[0.82, 0.04, 0.52]} position={[0, 0.48, 0]} material={mat('tin')} castShadow={false} />
        <CuboidCollider args={[0.4, 0.25, 0.25]} position={[0, 0.25, 0]} name={CAMERA_TRANSPARENT} />
      </group>
      {/* মাদুর, ঝাঁকা and a corner kolshi */}
      <mesh geometry={PLANE} material={mat('weave')} position={[-0.9, 0.31, 0.9]} rotation={[-Math.PI / 2, 0, 0.1]} scale={[1.4, 1.0, 1]} receiveShadow />
      <mesh geometry={UNIT_CYLINDER} material={mat('weave')} position={[0.8, 0.5, 1.55]} scale={[0.6, 0.4, 0.6]} rotation={[0, 0, 0.15]} castShadow />
      <Kolshi position={[-2.35, 0.3, -1.7]} />
      {/* Moonlight through the shutters: keeps the room readable once the lantern is taken. */}
      <pointLight color="#8fa3d0" intensity={1.4} distance={6} decay={1.8} position={[0, 2.2, 0.6]} />
    </>
  );
}

/** রহিম চাচার মাটির ঘর — mud walls on a raised plinth, hipped straw roof, real interior. */
export function RahimHouse() {
  const holeOpen = useRunStore((s) => s.run?.holesOpened.includes('rahim') ?? false);
  const H = RAHIM_HOLE;
  const holeH = H.top - H.bottom;
  const sideW = 3 - H.halfWidth;
  const PATCH = useMemo(() => new CircleGeometry(1, 20), []);
  return (
    <Structure placement={HOUSES.rahim}>
      <mesh geometry={PATCH} material={mat('courtyard')} position={[0, 0.012, 4.8]} rotation={[-Math.PI / 2, 0, 0]} scale={[4.6, 3.0, 1]} receiveShadow />
      {/* Raised mud plinth with a front veranda (দাওয়া) you can step onto. */}
      <Block size={[7, 0.3, 6.6]} position={[0, 0.15, 0.5]} material={mat('plinth')} collider />
      <VerandaRamp edgeZ={3.8} width={7} height={0.3} material={mat('plinth')} />

      {/* Hollow walls */}
      <Block size={[6, 2.3, 0.25]} position={[0, 1.45, 2.125]} material={mat('mud')} collider shell />
      <Block size={[0.25, 2.3, 4.25]} position={[-2.875, 1.45, 0]} material={mat('mud')} collider shell />
      <Block size={[0.25, 2.3, 4.25]} position={[2.875, 1.45, 0]} material={mat('mud')} collider shell />
      <Block size={[sideW, 2.3, 0.25]} position={[-(H.halfWidth + sideW / 2), 1.45, -2.125]} material={mat('mud')} collider shell />
      <Block size={[sideW, 2.3, 0.25]} position={[H.halfWidth + sideW / 2, 1.45, -2.125]} material={mat('mud')} collider shell />
      <Block size={[H.halfWidth * 2, 2.6 - H.top, 0.25]} position={[0, (2.6 + H.top) / 2, -2.125]} material={mat('mud')} collider shell />
      {holeOpen ? (
        <HoleRubble />
      ) : (
        <>
          <Block size={[H.halfWidth * 2, holeH, 0.25]} position={[0, H.bottom + holeH / 2, -2.125]} material={mat('mud')} collider shell />
          <DigMark />
      <DigDirt />
        </>
      )}
      {/* Darker lepa band along the outside base */}
      <Block size={[6.04, 0.35, 0.02]} position={[0, 0.48, 2.26]} material={mat('mudDark')} castShadow={false} />
      <Block size={[0.02, 0.35, 4.3]} position={[-3.01, 0.48, 0]} material={mat('mudDark')} castShadow={false} />
      <Block size={[0.02, 0.35, 4.3]} position={[3.01, 0.48, 0]} material={mat('mudDark')} castShadow={false} />

      <Block size={[1.0, 1.75, 0.06]} position={[0, 1.18, 2.27]} material={mat('woodDark')} castShadow={false} />
      <Block size={[1.2, 0.12, 0.1]} position={[0, 2.1, 2.28]} material={mat('wood')} castShadow={false} />
      {[-1.8, 1.8].map((x) => (
        <Block key={x} size={[0.7, 0.6, 0.06]} position={[x, 1.6, 2.27]} material={mat('wood')} castShadow={false} />
      ))}
      <HippedThatch footX={7.8} footZ={6.4} height={2.3} baseY={2.6} />
      <Lantern position={[0.85, 2.15, 2.45]} />
      <Kolshi position={[2.7, 0.3, 2.45]} />
      <Kolshi position={[3.1, 0.3, 2.2]} scale={0.8} />
      <ClayStove position={[-2.9, 0, 4.8]} />
      <CuboidCollider args={[0.36, 0.25, 0.36]} position={[-2.9, 0.25, 4.8]} name={CAMERA_TRANSPARENT} />
      <mesh geometry={PLANE} material={mat('weave')} position={[1.2, 0.02, 5.3]} rotation={[-Math.PI / 2, 0, 0.2]} scale={[1.5, 1.0, 1]} receiveShadow />
      <Interior />
    </Structure>
  );
}
