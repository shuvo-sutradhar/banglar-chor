import { useMemo, useRef } from 'react';
import { BoxGeometry, CircleGeometry, IcosahedronGeometry, MeshLambertMaterial, PlaneGeometry, type Group } from 'three';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { CAMERA_TRANSPARENT } from '../physics/queries';
import { useAppStore } from '../../state/useAppStore';
import { mergeColoredParts, type ColoredPart } from './geometryUtils';
import { COWSHED, HOUSES, TEA_STALL } from './layout';
import { mat, PALETTE, signTexture } from './materials';
import { applyCutout } from '../effects/cameraCutout';
import { Block, ClayStove, GableRoof, Kolshi, Lantern, Post, Structure, VerandaRamp } from './buildingParts';
import { UNIT_BOX, UNIT_CYLINDER, prismGeometry } from './sharedGeometry';
import { haystackGeometry } from './propGeometries';
import { RahimHouse } from './RahimHouse';
import { STANDALONE_HAYSTACKS } from '../ai/villageNav';

const CIRCLE = new CircleGeometry(1, 20);
const PLANE = new PlaneGeometry(1, 1);

function GroundPatch({ position, scale, material }: { position: [number, number, number]; scale: [number, number]; material: MeshLambertMaterial | ReturnType<typeof mat> }) {
  return <mesh geometry={CIRCLE} material={material} position={position} rotation={[-Math.PI / 2, 0, 0]} scale={[scale[0], scale[1], 1]} receiveShadow />;
}

function fenceGeometry(width: number, depth: number, gate: number) {
  const parts: ColoredPart[] = [];
  const post = new BoxGeometry(0.1, 1.3, 0.1);
  const rail = new BoxGeometry(1, 0.06, 0.05);
  const sides: { from: [number, number]; to: [number, number] }[] = [
    { from: [-width / 2, -depth / 2], to: [width / 2, -depth / 2] },
    { from: [-width / 2, -depth / 2], to: [-width / 2, depth / 2] },
    { from: [width / 2, -depth / 2], to: [width / 2, depth / 2] },
    { from: [-width / 2, depth / 2], to: [-gate / 2, depth / 2] },
    { from: [gate / 2, depth / 2], to: [width / 2, depth / 2] },
  ];
  for (const { from, to } of sides) {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
    const n = Math.max(1, Math.round(len / 0.6));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      parts.push({ geometry: post, color: i % 2 ? PALETTE.bamboo : PALETTE.bambooDark, position: [from[0] + (to[0] - from[0]) * t, 0.65 + (i % 3) * 0.03, from[1] + (to[1] - from[1]) * t] });
    }
    for (const y of [0.4, 0.95]) {
      parts.push({ geometry: rail, color: '#8c8a4c', position: [(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2], rotation: [0, -angle, 0], scale: [len, 1, 1] });
    }
  }
  return mergeColoredParts(parts);
}

/** কুদ্দুস মেম্বারের বাড়ি — bamboo-fenced homestead with a woven-wall house. */
function KuddusHomestead() {
  const W = 12;
  const D = 10;
  const GATE = 2.4;
  const fence = useMemo(() => fenceGeometry(W, D, GATE), []);
  const hay = useMemo(() => haystackGeometry(), []);
  const sideLen = (W - GATE) / 2;
  return (
    <Structure placement={HOUSES.kuddus}>
      <mesh geometry={PLANE} material={mat('courtyard')} position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[W - 0.2, D - 0.2, 1]} receiveShadow />
      <mesh geometry={fence} material={mat('vertexColor')} castShadow />
      {/* Fence colliders: back, left, right, and the two front pieces either side of the gate. */}
      <CuboidCollider args={[W / 2, 0.65, 0.08]} position={[0, 0.65, -D / 2]} name={CAMERA_TRANSPARENT} />
      <CuboidCollider args={[0.08, 0.65, D / 2]} position={[-W / 2, 0.65, 0]} name={CAMERA_TRANSPARENT} />
      <CuboidCollider args={[0.08, 0.65, D / 2]} position={[W / 2, 0.65, 0]} name={CAMERA_TRANSPARENT} />
      <CuboidCollider args={[sideLen / 2, 0.65, 0.08]} position={[-W / 2 + sideLen / 2, 0.65, D / 2]} name={CAMERA_TRANSPARENT} />
      <CuboidCollider args={[sideLen / 2, 0.65, 0.08]} position={[W / 2 - sideLen / 2, 0.65, D / 2]} name={CAMERA_TRANSPARENT} />
      {/* Gate posts */}
      <Post position={[-GATE / 2 - 0.05, D / 2]} height={1.8} radius={0.08} material={mat('wood')} />
      <Post position={[GATE / 2 + 0.05, D / 2]} height={1.8} radius={0.08} material={mat('wood')} />

      <group position={[0, 0, -1.9]}>
        <Block size={[6.4, 0.25, 5.6]} position={[0, 0.125, 0.4]} material={mat('plinth')} collider />
        <VerandaRamp edgeZ={3.2} width={6.4} height={0.25} run={0.6} material={mat('plinth')} />
        <Block size={[5.6, 2.2, 3.8]} position={[0, 1.35, 0]} material={mat('weave')} collider />
        {[-2.8, 2.8].map((x) => (
          <mesh key={x} geometry={prismGeometry(3.8, 1.45, 0.08)} material={mat('weave')} position={[x, 2.45, 0]} rotation={[0, Math.PI / 2, 0]} castShadow />
        ))}
        <GableRoof width={6.8} span={5.2} rise={1.55} baseY={2.42} material={mat('thatch')} thickness={0.16} />
        <Block size={[1.0, 1.7, 0.06]} position={[0, 1.1, 1.93]} material={mat('woodDark')} castShadow={false} />
        <Lantern position={[0.9, 2.05, 2.1]} />
      </group>

      <mesh geometry={hay} material={mat('vertexColor')} position={[-4.1, 0, 2.6]} castShadow />
      <CylinderCollider args={[1.1, 1.1]} position={[-4.1, 1.1, 2.6]} name={CAMERA_TRANSPARENT} />
      <ClayStove position={[3.8, 0, 2.6]} />
      <CuboidCollider args={[0.36, 0.25, 0.36]} position={[3.8, 0.25, 2.6]} name={CAMERA_TRANSPARENT} />
      <Kolshi position={[3.4, 0, 0.9]} />
      {/* Bamboo machan (মাচা) */}
      <group position={[-4.2, 0, -1.2]}>
        <Block size={[1.0, 0.08, 2.0]} position={[0, 0.55, 0]} material={mat('weave')} collider thin />
        {[
          [-0.45, -0.9],
          [0.45, -0.9],
          [-0.45, 0.9],
          [0.45, 0.9],
        ].map(([x, z]) => (
          <mesh key={`${x}${z}`} geometry={UNIT_CYLINDER} material={mat('wood')} position={[x as number, 0.27, z as number]} scale={[0.08, 0.54, 0.08]} />
        ))}
      </group>
    </Structure>
  );
}

function SwayingCloth({ position, material, phase }: { position: [number, number, number]; material: ReturnType<typeof mat>; phase: number }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || useAppStore.getState().settings.reducedMotion) return;
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 1.3 + phase) * 0.12;
  });
  return (
    <group ref={ref} position={position}>
      <mesh geometry={UNIT_BOX} material={material} position={[0, -0.5, 0]} scale={[0.85, 1.0, 0.02]} castShadow />
    </group>
  );
}

/** মোড়ল বাড়ির টিনের ঘর — plastered brick-base house with corrugated tin roof and a yard. */
function MorolHouse() {
  return (
    <Structure placement={HOUSES.morol}>
      <GroundPatch position={[0, 0.012, 5.2]} scale={[4.2, 1.8]} material={mat('courtyard')} />
      <Block size={[7.4, 0.35, 7]} position={[0, 0.175, 0.5]} material={mat('plinth')} collider />
      <VerandaRamp edgeZ={4.0} width={7.4} height={0.35} run={0.8} material={mat('plinth')} />
      <Block size={[6.2, 2.5, 4.6]} position={[0, 1.6, 0]} material={mat('plaster')} collider />
      <Block size={[6.24, 0.6, 4.64]} position={[0, 0.65, 0]} material={mat('brick')} castShadow={false} />
      {[-3.1, 3.1].map((x) => (
        <mesh key={x} geometry={prismGeometry(4.6, 1.3, 0.06)} material={mat('plaster')} position={[x, 2.85, 0]} rotation={[0, Math.PI / 2, 0]} castShadow />
      ))}
      <GableRoof width={7.3} span={5.8} rise={1.35} baseY={2.82} material={mat('tin')} />
      <Block size={[1.1, 1.9, 0.06]} position={[0, 1.3, 2.33]} material={mat('doorPaint')} castShadow={false} />
      {[-1.9, 1.9].map((x) => (
        <group key={x}>
          <Block size={[0.9, 0.8, 0.05]} position={[x, 1.75, 2.32]} material={mat('woodDark')} castShadow={false} />
          {[-0.28, 0, 0.28].map((dx) => (
            <Block key={dx} size={[0.04, 0.8, 0.04]} position={[x + dx, 1.75, 2.36]} material={mat('doorPaint')} castShadow={false} />
          ))}
        </group>
      ))}
      <Lantern position={[0.95, 2.35, 2.5]} />
      {/* Low brick yard walls */}
      <Block size={[0.3, 0.9, 3.4]} position={[-4.3, 0.45, 4.6]} material={mat('brick')} collider thin />
      <Block size={[0.3, 0.9, 3.4]} position={[4.3, 0.45, 4.6]} material={mat('brick')} collider thin />
      {/* Clothesline with a drying lungi and gamcha */}
      <Post position={[-3.4, 5.6]} height={2.0} radius={0.05} />
      <Post position={[3.4, 5.6]} height={2.0} radius={0.05} />
      <Block size={[6.8, 0.02, 0.02]} position={[0, 1.95, 5.6]} material={mat('black')} castShadow={false} />
      <SwayingCloth position={[-1.2, 1.95, 5.6]} material={mat('cloth1')} phase={0} />
      <SwayingCloth position={[0.9, 1.95, 5.6]} material={mat('cloth2')} phase={1.7} />
      {/* Tubewell (চাপকল) */}
      <group position={[2.4, 0, 4.85]}>
        <Block size={[1.2, 0.1, 1.2]} position={[0, 0.05, 0]} material={mat('plaster')} castShadow={false} />
        <mesh geometry={UNIT_CYLINDER} material={mat('iron')} position={[0, 0.6, 0]} scale={[0.18, 1.0, 0.18]} castShadow />
        <Block size={[0.08, 0.08, 0.35]} position={[0, 0.85, 0.2]} material={mat('iron')} />
        <Block size={[0.06, 0.06, 0.8]} position={[0, 1.15, -0.3]} rotation={[0.35, 0, 0]} material={mat('iron')} />
        <CuboidCollider args={[0.25, 0.6, 0.25]} position={[0, 0.6, 0]} name={CAMERA_TRANSPARENT} />
      </group>
      {/* Wooden bench */}
      <group position={[-2.4, 0, 4.75]}>
        <Block size={[1.6, 0.08, 0.45]} position={[0, 0.45, 0]} material={mat('wood')} />
        {[-0.65, 0.65].map((x) => (
          <Block key={x} size={[0.08, 0.42, 0.4]} position={[x, 0.21, 0]} material={mat('woodDark')} />
        ))}
        <CuboidCollider args={[0.8, 0.25, 0.24]} position={[0, 0.25, 0]} name={CAMERA_TRANSPARENT} />
      </group>
    </Structure>
  );
}

/** গোয়ালঘর — open-fronted cowshed you can walk into (tests the interior camera preset). */
function Cowshed() {
  const hayBlob = useMemo(() => new IcosahedronGeometry(1, 0), []);
  return (
    <Structure placement={COWSHED}>
      <mesh geometry={PLANE} material={mat('path')} position={[0, 0.013, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[5, 4.2, 1]} receiveShadow />
      <Block size={[5, 2.0, 0.1]} position={[0, 1.0, -2.1]} material={mat('weave')} collider />
      <Block size={[0.1, 2.0, 4.2]} position={[-2.5, 1.0, 0]} material={mat('weave')} collider />
      <Block size={[0.1, 2.0, 4.2]} position={[2.5, 1.0, 0]} material={mat('weave')} collider />
      <Post position={[-2.45, 2.05]} height={2.45} radius={0.08} />
      <Post position={[2.45, 2.05]} height={2.45} radius={0.08} />
      <Block size={[5.8, 0.16, 5.0]} position={[0, 2.55, 0.15]} rotation={[0.16, 0, 0]} material={mat('thatch')} />
      <mesh geometry={hayBlob} material={mat('thatch')} position={[-1.4, 0.35, -1.3]} scale={[0.9, 0.45, 0.65]} castShadow />
      <CuboidCollider args={[0.75, 0.35, 0.55]} position={[-1.4, 0.35, -1.3]} name={CAMERA_TRANSPARENT} />
      {/* Clay feeding trough (চাড়ি) */}
      <mesh geometry={UNIT_CYLINDER} material={mat('clayPot')} position={[1.3, 0.25, -1.5]} scale={[0.9, 0.5, 0.9]} castShadow />
      <mesh geometry={UNIT_CYLINDER} material={mat('black')} position={[1.3, 0.51, -1.5]} scale={[0.72, 0.02, 0.72]} />
      <CuboidCollider args={[0.45, 0.25, 0.45]} position={[1.3, 0.25, -1.5]} name={CAMERA_TRANSPARENT} />
      <Lantern position={[0, 2.15, -1.9]} intensity={4} distance={6} />
    </Structure>
  );
}

/** বন্ধ চায়ের দোকান — a shuttered roadside tea stall with a bench. */
function TeaStall() {
  const signMaterial = useMemo(() => applyCutout(new MeshLambertMaterial({ map: signTexture('চায়ের দোকান', '#e3ba70', '#3b2a1e') })), []);
  return (
    <Structure placement={TEA_STALL}>
      <Block size={[2.6, 2.1, 1.8]} position={[0, 1.05, 0]} material={mat('wood')} collider />
      <Block size={[2.4, 1.5, 0.05]} position={[0, 1.15, 0.92]} material={mat('woodDark')} castShadow={false} />
      <Block size={[3.2, 0.06, 2.8]} position={[0, 2.25, 0.35]} rotation={[0.12, 0, 0]} material={mat('tin')} />
      <mesh geometry={UNIT_BOX} material={signMaterial} position={[0, 2.62, 0.75]} scale={[1.9, 0.48, 0.05]} />
      <group position={[0, 0, 1.75]}>
        <Block size={[2.0, 0.08, 0.4]} position={[0, 0.42, 0]} material={mat('wood')} />
        {[-0.85, 0.85].map((x) => (
          <Block key={x} size={[0.08, 0.4, 0.36]} position={[x, 0.2, 0]} material={mat('woodDark')} />
        ))}
        <CuboidCollider args={[1.0, 0.24, 0.22]} position={[0, 0.24, 0]} name={CAMERA_TRANSPARENT} />
        {/* A forgotten kettle */}
        <mesh geometry={UNIT_CYLINDER} material={mat('iron')} position={[0.6, 0.56, 0]} scale={[0.2, 0.2, 0.2]} />
      </group>
    </Structure>
  );
}


function Haystacks() {
  const hay = useMemo(() => haystackGeometry(), []);
  return (
    <RigidBody type="fixed" colliders={false}>
      {STANDALONE_HAYSTACKS.map(([x, z]) => (
        <group key={`${x},${z}`}>
          <mesh geometry={hay} material={mat('vertexColor')} position={[x, 0, z]} castShadow />
          <CylinderCollider args={[1.1, 1.12]} position={[x, 1.1, z]} name={CAMERA_TRANSPARENT} />
        </group>
      ))}
    </RigidBody>
  );
}

export function Buildings() {
  return (
    <>
      <RahimHouse />
      <KuddusHomestead />
      <MorolHouse />
      <Cowshed />
      <TeaStall />
      <Haystacks />
    </>
  );
}
