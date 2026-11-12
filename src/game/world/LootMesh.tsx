import { useRef } from 'react';
import type { Group } from 'three';
import { useFrame } from '@react-three/fiber';
import type { LootId } from '../data/loot';
import { useAppStore } from '../../state/useAppStore';
import { mat } from './materials';
import { UNIT_BOX, UNIT_CYLINDER, UNIT_SPHERE } from './sharedGeometry';

/** Small procedural models for every loot item (prototype art; ART_DIRECTION A3). Origin = base. */
export function LootMesh({ lootId, inWorld = true }: { lootId: LootId; inWorld?: boolean }) {
  switch (lootId) {
    case 'brass-pot':
      return (
        <group>
          <mesh geometry={UNIT_SPHERE} material={mat('brass')} position={[0, 0.14, 0]} scale={[0.28, 0.24, 0.28]} castShadow />
          <mesh geometry={UNIT_CYLINDER} material={mat('brass')} position={[0, 0.3, 0]} scale={[0.1, 0.1, 0.1]} />
          <mesh geometry={UNIT_CYLINDER} material={mat('brass')} position={[0.15, 0.2, 0]} rotation={[0, 0, -0.9]} scale={[0.04, 0.2, 0.04]} />
          <mesh geometry={UNIT_CYLINDER} material={mat('brass')} position={[0, 0.36, 0]} scale={[0.16, 0.02, 0.16]} />
        </group>
      );
    case 'lantern':
      return (
        <group>
          <mesh geometry={UNIT_CYLINDER} material={mat('iron')} position={[0, 0.03, 0]} scale={[0.18, 0.06, 0.18]} />
          <mesh geometry={UNIT_SPHERE} material={mat('lanternGlow')} position={[0, 0.17, 0]} scale={[0.15, 0.2, 0.15]} />
          <mesh geometry={UNIT_CYLINDER} material={mat('iron')} position={[0, 0.31, 0]} scale={[0.13, 0.06, 0.13]} />
          {inWorld && <pointLight color="#f2ad55" intensity={2.4} distance={5} decay={1.7} position={[0, 0.2, 0.25]} />}
        </group>
      );
    case 'old-radio':
      return (
        <group>
          <mesh geometry={UNIT_BOX} material={mat('radioWood')} position={[0, 0.13, 0]} scale={[0.42, 0.26, 0.18]} castShadow />
          <mesh geometry={UNIT_CYLINDER} material={mat('black')} position={[-0.08, 0.14, 0.092]} rotation={[Math.PI / 2, 0, 0]} scale={[0.16, 0.01, 0.16]} />
          <mesh geometry={UNIT_CYLINDER} material={mat('gold')} position={[0.13, 0.16, 0.095]} rotation={[Math.PI / 2, 0, 0]} scale={[0.05, 0.02, 0.05]} />
          <mesh geometry={UNIT_CYLINDER} material={mat('iron')} position={[0.15, 0.4, 0]} rotation={[0, 0, -0.3]} scale={[0.012, 0.32, 0.012]} />
        </group>
      );
    case 'metal-plate':
      return (
        <group>
          <mesh geometry={UNIT_CYLINDER} material={mat('bronze')} position={[0, 0.02, 0]} scale={[0.42, 0.03, 0.42]} castShadow />
          <mesh geometry={UNIT_CYLINDER} material={mat('bronze')} position={[0, 0.035, 0]} scale={[0.34, 0.01, 0.34]} />
        </group>
      );
    case 'alarm-clock':
      return (
        <group>
          <mesh geometry={UNIT_CYLINDER} material={mat('doorPaint')} position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.2, 0.08, 0.2]} castShadow />
          <mesh geometry={UNIT_CYLINDER} material={mat('white')} position={[0, 0.12, 0.042]} rotation={[Math.PI / 2, 0, 0]} scale={[0.16, 0.01, 0.16]} />
          {[-0.07, 0.07].map((x) => (
            <mesh key={x} geometry={UNIT_SPHERE} material={mat('brass')} position={[x, 0.23, 0]} scale={[0.07, 0.05, 0.07]} />
          ))}
        </group>
      );
    case 'fake-jewelry':
    case 'actual-jewelry':
      return (
        <group>
          {Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * Math.PI * 1.6 - 0.3;
            return <mesh key={i} geometry={UNIT_SPHERE} material={mat('gold')} position={[Math.cos(a) * 0.12, 0.025, Math.sin(a) * 0.09]} scale={[0.045, 0.035, 0.045]} />;
          })}
          {lootId === 'actual-jewelry' && <mesh geometry={UNIT_SPHERE} material={mat('ruby')} position={[0, 0.03, -0.1]} scale={[0.06, 0.05, 0.06]} />}
        </group>
      );
    case 'broken-torch':
      return (
        <group rotation={[0, 0, Math.PI / 2]} position={[0.1, 0.05, 0]}>
          <mesh geometry={UNIT_CYLINDER} material={mat('iron')} scale={[0.08, 0.26, 0.08]} castShadow />
          <mesh geometry={UNIT_CYLINDER} material={mat('glass')} position={[0, 0.15, 0]} scale={[0.11, 0.05, 0.11]} />
        </group>
      );
    case 'dentures':
      return (
        <group>
          <mesh geometry={UNIT_CYLINDER} material={mat('glass')} position={[0, 0.1, 0]} scale={[0.14, 0.2, 0.14]} />
          <mesh geometry={UNIT_SPHERE} material={mat('gum')} position={[0, 0.09, 0]} scale={[0.1, 0.04, 0.08]} />
          <mesh geometry={UNIT_SPHERE} material={mat('white')} position={[0, 0.11, 0.01]} scale={[0.09, 0.03, 0.07]} />
        </group>
      );
    case 'chicken':
      return <Chicken />;
  }
}

/** Dozing hen with a gentle breathing bob. */
function Chicken() {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || useAppStore.getState().paused) return;
    ref.current.scale.y = 1 + Math.sin(clock.elapsedTime * 3) * 0.03;
  });
  return (
    <group ref={ref}>
      <mesh geometry={UNIT_SPHERE} material={mat('henWhite')} position={[0, 0.16, 0]} scale={[0.28, 0.24, 0.36]} castShadow />
      <mesh geometry={UNIT_SPHERE} material={mat('henWhite')} position={[0, 0.32, 0.15]} scale={[0.13, 0.14, 0.13]} />
      <mesh geometry={UNIT_BOX} material={mat('comb')} position={[0, 0.41, 0.15]} scale={[0.03, 0.06, 0.08]} />
      <mesh geometry={UNIT_BOX} material={mat('brass')} position={[0, 0.31, 0.23]} scale={[0.04, 0.03, 0.06]} />
      <mesh geometry={UNIT_BOX} material={mat('henWhite')} position={[0, 0.24, -0.2]} rotation={[-0.6, 0, 0]} scale={[0.14, 0.14, 0.04]} />
    </group>
  );
}
