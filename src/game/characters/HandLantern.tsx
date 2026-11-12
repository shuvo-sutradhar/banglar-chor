import { mat } from '../world/materials';
import { UNIT_CYLINDER, UNIT_SPHERE } from '../world/sharedGeometry';

/** Hand-held hurricane lantern with a small warm light: telegraphs where an NPC is and looks. */
export function HandLantern({ light }: { light: boolean }) {
  return (
    <group>
      <mesh geometry={UNIT_CYLINDER} material={mat('iron')} position={[0, 0.02, 0]} scale={[0.02, 0.14, 0.02]} />
      <mesh geometry={UNIT_SPHERE} material={mat('lanternGlow')} position={[0, -0.12, 0]} scale={[0.13, 0.17, 0.13]} />
      <mesh geometry={UNIT_CYLINDER} material={mat('iron')} position={[0, -0.23, 0]} scale={[0.14, 0.04, 0.14]} />
      {light && <pointLight color="#f2ad55" intensity={3.2} distance={7} decay={1.6} position={[0, -0.1, 0.1]} />}
    </group>
  );
}
