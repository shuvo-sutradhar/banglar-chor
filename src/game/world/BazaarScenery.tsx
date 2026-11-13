import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CircleGeometry, CylinderGeometry, IcosahedronGeometry, InstancedMesh, MeshLambertMaterial, Object3D, PlaneGeometry, RingGeometry, type BufferGeometry, type Group } from 'three';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { createRng } from '../../lib/rng';
import { useAppStore } from '../../state/useAppStore';
import { CAMERA_TRANSPARENT } from '../physics/queries';
import { mergeColoredParts, type ColoredPart } from './geometryUtils';
import { mat, PALETTE, signTexture } from './materials';
import { applyCutout } from '../effects/cameraCutout';
import { Block, Kolshi, Post, Structure } from './buildingParts';
import { UNIT_BOX, UNIT_CYLINDER, UNIT_SPHERE } from './sharedGeometry';
import { palmGeometry, bambooClumpGeometry } from './propGeometries';
import { BAZAAR_BOUNDS, GATE_HALF_WIDTH, STALLS, TEA_BENCHES, TREE, type StallDef } from './bazaarLayout';

const PLANE = new PlaneGeometry(1, 1);
const DISC = new CircleGeometry(1, 28);

/** Goods displayed on each stall's counter (procedural prototype props). */
function Goods({ kind, w }: { kind: StallDef['goods']; w: number }) {
  const y = 0.88;
  const xs = (n: number) => Array.from({ length: n }, (_, i) => -w / 2 + 0.5 + (i * (w - 1)) / Math.max(1, n - 1));
  switch (kind) {
    case 'metal':
      return (
        <>
          {xs(4).map((x, i) => (
            <mesh key={x} geometry={UNIT_SPHERE} material={mat(i % 2 ? 'brass' : 'bronze')} position={[x, y + 0.12, 0.05]} scale={[0.3, 0.24, 0.3]} />
          ))}
          {[0, 1, 2].map((i) => (
            <mesh key={i} geometry={UNIT_CYLINDER} material={mat('bronze')} position={[1.2, y + 0.02 + i * 0.035, -0.3]} scale={[0.42, 0.03, 0.42]} />
          ))}
          <Kolshi position={[-w / 2 - 0.4, 0, 0.6]} />
          <Kolshi position={[w / 2 + 0.4, 0, 0.6]} scale={0.85} />
        </>
      );
    case 'electronics':
      return (
        <>
          {xs(3).map((x) => (
            <group key={x} position={[x, y, 0]}>
              <mesh geometry={UNIT_BOX} material={mat('radioWood')} position={[0, 0.13, 0]} scale={[0.42, 0.26, 0.18]} />
              <mesh geometry={UNIT_CYLINDER} material={mat('black')} position={[-0.08, 0.14, 0.092]} rotation={[Math.PI / 2, 0, 0]} scale={[0.16, 0.01, 0.16]} />
            </group>
          ))}
          <mesh geometry={UNIT_BOX} material={mat('black')} position={[0.4, y + 0.3, -0.35]} scale={[0.7, 0.55, 0.45]} />
          <mesh geometry={UNIT_BOX} material={mat('glass')} position={[0.4, y + 0.32, -0.12]} scale={[0.55, 0.4, 0.02]} />
          {[-0.9, -0.55].map((x) => (
            <mesh key={x} geometry={UNIT_CYLINDER} material={mat('doorPaint')} position={[x, y + 0.11, -0.3]} rotation={[Math.PI / 2, 0, 0]} scale={[0.2, 0.08, 0.2]} />
          ))}
        </>
      );
    case 'general':
      return (
        <>
          {xs(3).map((x, i) => (
            <group key={x} position={[x, y, 0]}>
              <mesh geometry={UNIT_CYLINDER} material={mat('weave')} position={[0, 0.1, 0]} scale={[0.5, 0.2, 0.5]} />
              {[0, 1, 2, 3].map((k) => (
                <mesh key={k} geometry={UNIT_SPHERE} material={mat(i === 1 ? 'vegYellow' : 'egg')} position={[Math.cos(k * 1.6) * 0.12, 0.22, Math.sin(k * 1.6) * 0.12]} scale={[0.09, 0.11, 0.09]} />
              ))}
            </group>
          ))}
          {['clothYellow', 'clothTeal', 'cloth1'].map((m, i) => (
            <mesh key={m} geometry={UNIT_CYLINDER} material={mat(m as 'clothYellow')} position={[-0.8 + i * 0.6, y + 0.1, -0.4]} rotation={[0, 0, Math.PI / 2]} scale={[0.18, 0.5, 0.18]} />
          ))}
        </>
      );
    case 'tea':
      return (
        <>
          <mesh geometry={UNIT_CYLINDER} material={mat('mudDark')} position={[-0.9, y + 0.15, -0.2]} scale={[0.5, 0.3, 0.5]} />
          <mesh geometry={UNIT_SPHERE} material={mat('iron')} position={[-0.9, y + 0.42, -0.2]} scale={[0.32, 0.28, 0.32]} />
          {xs(5).map((x) => (
            <mesh key={x} geometry={UNIT_CYLINDER} material={mat('glass')} position={[x * 0.6 + 0.4, y + 0.06, 0.15]} scale={[0.08, 0.12, 0.08]} />
          ))}
          {[0.6, 1.1].map((x) => (
            <mesh key={x} geometry={UNIT_CYLINDER} material={mat('glass')} position={[x, y + 0.2, -0.3]} scale={[0.25, 0.4, 0.25]} />
          ))}
        </>
      );
    case 'veg':
      return (
        <>
          {(['vegRed', 'vegOrange', 'vegGreen', 'vegYellow'] as const).map((m, i) => (
            <group key={m} position={[-w / 2 + 0.6 + i * 1.0, y, 0]}>
              <mesh geometry={UNIT_CYLINDER} material={mat('weave')} position={[0, 0.08, 0]} scale={[0.6, 0.16, 0.6]} />
              {Array.from({ length: 6 }, (_, k) => (
                <mesh key={k} geometry={UNIT_SPHERE} material={mat(m)} position={[Math.cos(k) * 0.16, 0.2 + (k % 2) * 0.05, Math.sin(k) * 0.16]} scale={m === 'vegOrange' ? [0.22, 0.18, 0.22] : [0.12, 0.12, 0.12]} />
              ))}
            </group>
          ))}
        </>
      );
    case 'pots':
      return (
        <>
          {xs(4).map((x, i) => (
            <group key={x}>
              <mesh geometry={UNIT_SPHERE} material={mat(i % 2 ? 'clayPot' : 'clayLight')} position={[x, y + 0.16, 0]} scale={[0.34, 0.3, 0.34]} />
              <mesh geometry={UNIT_CYLINDER} material={mat('clayPot')} position={[x, y + 0.34, 0]} scale={[0.16, 0.08, 0.16]} />
            </group>
          ))}
          {[-0.8, 0, 0.8].map((x) => (
            <Kolshi key={x} position={[x, 0, 1.0]} scale={0.9} />
          ))}
        </>
      );
  }
}

/** Bamboo stall: four posts, counter, back screen, half side walls, roof and a Bangla signboard. */
function Stall({ s }: { s: StallDef }) {
  const signMat = useMemo(() => applyCutout(new MeshLambertMaterial({ map: signTexture(s.signBn, s.signBg, '#3b2a1e') })), [s.signBn, s.signBg]);
  const roofMat = s.roof === 'tin' ? mat('tin') : s.roof === 'thatch' ? mat('thatch') : s.clothColor === '#456a3d' ? mat('clothGreen') : mat('clothRed');
  const { width: w, depth: d } = s;
  return (
    <Structure placement={{ x: s.x, z: s.z, rotY: s.rotY }}>
      <mesh geometry={PLANE} material={mat('weave')} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[w, d, 1]} receiveShadow />
      {[
        [-w / 2, d / 2],
        [w / 2, d / 2],
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
      ].map(([x, z]) => (
        <Post key={`${x}${z}`} position={[x!, z!]} height={2.6} radius={0.07} material={mat('wood')} />
      ))}
      {/* Counter */}
      <Block size={[w - 0.2, 0.85, 0.6]} position={[0, 0.425, d / 2 - 0.35]} material={mat('wood')} collider />
      <group position={[0, 0, d / 2 - 0.35]}>
        <Goods kind={s.goods} w={w - 0.6} />
      </group>
      {/* Back screen + half side walls (woven bamboo) */}
      <Block size={[w, 2.1, 0.06]} position={[0, 1.05, -d / 2]} material={mat('weave')} collider />
      <Block size={[0.06, 1.0, d - 0.7]} position={[-w / 2, 0.5, -0.35]} material={mat('weave')} collider thin />
      <Block size={[0.06, 1.0, d - 0.7]} position={[w / 2, 0.5, -0.35]} material={mat('weave')} collider thin />
      {/* Roof sloping towards the front */}
      <Block size={[w + 0.7, s.roof === 'thatch' ? 0.16 : 0.05, d + 1.0]} position={[0, 2.62, 0.15]} rotation={[0.16, 0, 0]} material={roofMat} />
      {/* Signboard */}
      <mesh geometry={UNIT_BOX} material={signMat} position={[0, 2.95, d / 2 + 0.25]} scale={[Math.min(w, 3.4), 0.6, 0.05]} />
    </Structure>
  );
}

/** Big banyan (বটগাছ) on a brick platform at the heart of the haat. */
function Banyan() {
  const canopy = useMemo(() => {
    const rng = createRng(4242);
    const blob = new IcosahedronGeometry(1, 0);
    const parts: ColoredPart[] = [];
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(0.5, 5.2);
      parts.push({ geometry: blob, color: i % 3 ? '#3f6b37' : '#4d7d3f', position: [Math.cos(a) * r, rng.range(5.4, 7.6), Math.sin(a) * r], scale: [rng.range(2, 2.8), rng.range(1.3, 1.9), rng.range(2, 2.8)] });
    }
    const root = new CylinderGeometry(0.04, 0.06, 1, 4);
    for (let i = 0; i < 9; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(2.6, 4.8);
      parts.push({ geometry: root, color: '#6b5640', position: [Math.cos(a) * r, 2.7, Math.sin(a) * r], scale: [1, 5.4, 1] });
    }
    return mergeColoredParts(parts);
  }, []);
  const sway = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!sway.current || useAppStore.getState().settings.reducedMotion) return;
    sway.current.rotation.z = Math.sin(clock.elapsedTime * 0.5) * 0.008;
  });
  return (
    <group position={[TREE.x, 0, TREE.z]}>
      <mesh geometry={UNIT_CYLINDER} material={mat('brick')} position={[0, TREE.platformH / 2, 0]} scale={[TREE.platformR * 2, TREE.platformH, TREE.platformR * 2]} receiveShadow castShadow />
      <mesh geometry={UNIT_CYLINDER} material={mat('plinth')} position={[0, TREE.platformH + 0.01, 0]} scale={[TREE.platformR * 2 - 0.1, 0.02, TREE.platformR * 2 - 0.1]} />
      <mesh geometry={UNIT_CYLINDER} material={mat('bark')} position={[0, 2.6, 0]} scale={[TREE.trunkR * 2, 5.2, TREE.trunkR * 2]} castShadow />
      <group ref={sway}>
        <mesh geometry={canopy} material={mat('vertexColor')} castShadow />
      </group>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[TREE.platformH / 2, TREE.platformR]} position={[0, TREE.platformH / 2, 0]} />
        <CylinderCollider args={[2.6, TREE.trunkR]} position={[0, 2.6, 0]} />
      </RigidBody>
    </group>
  );
}

function fenceGeometry(): BufferGeometry {
  const { halfX: hx, halfZ: hz } = BAZAAR_BOUNDS;
  const g = GATE_HALF_WIDTH;
  const post = new BoxGeometry(0.1, 1.2, 0.1);
  const rail = new BoxGeometry(1, 0.06, 0.05);
  const parts: ColoredPart[] = [];
  const segs: [number, number, number, number][] = [
    [-hx, -hz, -g, -hz],
    [g, -hz, hx, -hz],
    [-hx, hz, -g, hz],
    [g, hz, hx, hz],
    [-hx, -hz, -hx, hz],
    [hx, -hz, hx, hz],
  ];
  for (const [x1, z1, x2, z2] of segs) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.round(len / 0.8));
    for (let i = 0; i <= n; i++) parts.push({ geometry: post, color: i % 2 ? PALETTE.bamboo : PALETTE.bambooDark, position: [x1 + ((x2 - x1) * i) / n, 0.6, z1 + ((z2 - z1) * i) / n] });
    for (const y of [0.4, 0.9]) parts.push({ geometry: rail, color: '#8c8a4c', position: [(x1 + x2) / 2, y, (z1 + z2) / 2], rotation: [0, -Math.atan2(z2 - z1, x2 - x1), 0], scale: [len, 1, 1] });
  }
  return mergeColoredParts(parts);
}

function Gate({ z, label }: { z: number; label: string }) {
  const signMat = useMemo(() => applyCutout(new MeshLambertMaterial({ map: signTexture(label, '#e3ba70', '#3b2a1e') })), [label]);
  return (
    <group position={[0, 0, z]}>
      <mesh geometry={UNIT_CYLINDER} material={mat('wood')} position={[-GATE_HALF_WIDTH - 0.2, 1.6, 0]} scale={[0.22, 3.2, 0.22]} castShadow />
      <mesh geometry={UNIT_CYLINDER} material={mat('wood')} position={[GATE_HALF_WIDTH + 0.2, 1.6, 0]} scale={[0.22, 3.2, 0.22]} castShadow />
      <mesh geometry={UNIT_BOX} material={mat('wood')} position={[0, 3.2, 0]} scale={[GATE_HALF_WIDTH * 2 + 0.8, 0.18, 0.2]} />
      <mesh geometry={UNIT_BOX} material={signMat} position={[0, 2.75, 0.06]} scale={[2.6, 0.62, 0.05]} />
      <mesh geometry={UNIT_BOX} material={signMat} position={[0, 2.75, -0.06]} rotation={[0, Math.PI, 0]} scale={[2.6, 0.62, 0.05]} />
    </group>
  );
}

const dummy = new Object3D();

function Instanced({ geometry, items }: { geometry: BufferGeometry; items: { x: number; z: number; r: number; s: number }[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.r, 0);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geometry, mat('vertexColor'), items.length]} castShadow frustumCulled={false} />;
}

/** The whole static bazaar (ground, fence, gates, tree, stalls, benches, backdrop). */
export const BazaarScenery = memo(function BazaarScenery() {
  const { halfX: hx, halfZ: hz } = BAZAAR_BOUNDS;
  const geo = useMemo(() => ({ fence: fenceGeometry(), palm: palmGeometry(), bamboo: bambooClumpGeometry(1, 0), ring: new RingGeometry(TREE.platformR + 1.2, TREE.platformR + 3.4, 40) }), []);
  const backdrop = useMemo(() => {
    const rng = createRng(909);
    const palms: { x: number; z: number; r: number; s: number }[] = [];
    const bamboo: { x: number; z: number; r: number; s: number }[] = [];
    for (let i = 0; i < 26; i++) {
      const side = i % 4;
      const t = rng.range(-1, 1);
      const off = rng.range(2.5, 7);
      const p = side === 0 ? { x: t * hx, z: -hz - off } : side === 1 ? { x: t * hx, z: hz + off } : side === 2 ? { x: -hx - off, z: t * hz } : { x: hx + off, z: t * hz };
      if (Math.abs(p.x) < GATE_HALF_WIDTH + 3 && Math.abs(p.z) > hz) continue; // keep the gate approaches open
      (i % 3 === 0 ? palms : bamboo).push({ ...p, r: rng.range(0, 6.28), s: rng.range(0.9, 1.25) });
    }
    return { palms, bamboo };
  }, [hx, hz]);

  return (
    <group>
      {/* Ground: grass beyond, packed earth inside the haat, worn ring path round the banyan */}
      <mesh geometry={PLANE} material={mat('grass')} rotation={[-Math.PI / 2, 0, 0]} scale={[200, 200, 1]} receiveShadow />
      <mesh geometry={DISC} material={mat('dirt')} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} scale={[hx + 1, hz + 1, 1]} receiveShadow />
      <mesh geometry={geo.ring} material={mat('path')} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} receiveShadow />
      <mesh geometry={PLANE} material={mat('path')} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]} scale={[3.4, hz * 2 + 6, 1]} receiveShadow />
      <mesh geometry={geo.fence} material={mat('vertexColor')} castShadow />
      <Gate z={hz} label="হাটে স্বাগতম" />
      <Gate z={-hz} label="বের হওয়ার পথ" />
      <Banyan />
      {STALLS.map((s) => (
        <Stall key={s.id} s={s} />
      ))}
      {TEA_BENCHES.map((b) => (
        <group key={`${b.x},${b.z}`} position={[b.x, 0, b.z]} rotation={[0, b.rotY, 0]}>
          <Block size={[1.9, 0.08, 0.42]} position={[0, 0.45, 0]} material={mat('wood')} />
          {[-0.8, 0.8].map((x) => (
            <Block key={x} size={[0.08, 0.42, 0.38]} position={[x, 0.21, 0]} material={mat('woodDark')} castShadow={false} />
          ))}
        </group>
      ))}
      <Instanced geometry={geo.palm} items={backdrop.palms} />
      <Instanced geometry={geo.bamboo} items={backdrop.bamboo} />

      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[100, 0.5, 100]} position={[0, -0.5, 0]} />
        {/* Fence colliders (gaps at both gates), thin so the camera can pass */}
        <CuboidCollider args={[(hx - GATE_HALF_WIDTH) / 2, 0.8, 0.1]} position={[-(hx + GATE_HALF_WIDTH) / 2, 0.8, -hz]} name={CAMERA_TRANSPARENT} />
        <CuboidCollider args={[(hx - GATE_HALF_WIDTH) / 2, 0.8, 0.1]} position={[(hx + GATE_HALF_WIDTH) / 2, 0.8, -hz]} name={CAMERA_TRANSPARENT} />
        <CuboidCollider args={[(hx - GATE_HALF_WIDTH) / 2, 0.8, 0.1]} position={[-(hx + GATE_HALF_WIDTH) / 2, 0.8, hz]} name={CAMERA_TRANSPARENT} />
        <CuboidCollider args={[(hx - GATE_HALF_WIDTH) / 2, 0.8, 0.1]} position={[(hx + GATE_HALF_WIDTH) / 2, 0.8, hz]} name={CAMERA_TRANSPARENT} />
        <CuboidCollider args={[0.1, 0.8, hz]} position={[-hx, 0.8, 0]} name={CAMERA_TRANSPARENT} />
        <CuboidCollider args={[0.1, 0.8, hz]} position={[hx, 0.8, 0]} name={CAMERA_TRANSPARENT} />
        {/* Beyond the gates: invisible stops a few metres out (the haat is the playable area) */}
        <CuboidCollider args={[GATE_HALF_WIDTH + 1, 2, 0.3]} position={[0, 2, -hz - 3.2]} />
        <CuboidCollider args={[GATE_HALF_WIDTH + 1, 2, 0.3]} position={[0, 2, hz + 3.2]} />
        <CuboidCollider args={[0.3, 2, 1.6]} position={[-GATE_HALF_WIDTH - 1, 2, -hz - 1.6]} />
        <CuboidCollider args={[0.3, 2, 1.6]} position={[GATE_HALF_WIDTH + 1, 2, -hz - 1.6]} />
        <CuboidCollider args={[0.3, 2, 1.6]} position={[-GATE_HALF_WIDTH - 1, 2, hz + 1.6]} />
        <CuboidCollider args={[0.3, 2, 1.6]} position={[GATE_HALF_WIDTH + 1, 2, hz + 1.6]} />
        {TEA_BENCHES.map((b) => (
          <CuboidCollider key={`${b.x},${b.z}`} args={[0.22, 0.25, 0.95]} position={[b.x, 0.25, b.z]} name={CAMERA_TRANSPARENT} />
        ))}
      </RigidBody>
    </group>
  );
});
