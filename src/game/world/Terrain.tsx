import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry, CircleGeometry, RingGeometry, PlaneGeometry } from 'three';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { CAMERA_TRANSPARENT } from '../physics/queries';
import { WORLD_BOUNDS } from '../data/tuning';
import { FOOTPATHS, POND, ROAD_POINTS, ROAD_WIDTH, sampleCatmullRom, type XZ } from './layout';
import { mat } from './materials';
import { Block } from './buildingParts';

/** Flat ribbon mesh following a polyline, with UVs running along its length. */
function ribbonGeometry(points: XZ[], width: number, y: number): BufferGeometry {
  const positions = new Float32Array(points.length * 2 * 3);
  const uvs = new Float32Array(points.length * 2 * 2);
  const indices: number[] = [];
  let distance = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as XZ;
    const prev = points[Math.max(0, i - 1)] as XZ;
    const next = points[Math.min(points.length - 1, i + 1)] as XZ;
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    const nx = -tz / len;
    const nz = tx / len;
    if (i > 0) distance += Math.hypot(p.x - prev.x, p.z - prev.z);
    // Slight width wobble so the road reads as worn earth, not CAD geometry.
    const w = (width / 2) * (1 + 0.08 * Math.sin(i * 1.7));
    positions.set([p.x + nx * w, y, p.z + nz * w, p.x - nx * w, y, p.z - nz * w], i * 6);
    uvs.set([0, distance / width, 1, distance / width], i * 4);
    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function Terrain() {
  const geometries = useMemo(() => {
    const road = ribbonGeometry(sampleCatmullRom(ROAD_POINTS, 10), ROAD_WIDTH, 0.02);
    const paths = FOOTPATHS.map((p) => ribbonGeometry(sampleCatmullRom(p, 6), 1.5, 0.016));
    return {
      ground: new PlaneGeometry(240, 240),
      road,
      paths,
      water: new CircleGeometry(POND.radius, 28),
      bank: new RingGeometry(POND.radius - 0.05, POND.radius + 0.9, 28),
    };
  }, []);

  const h = WORLD_BOUNDS.halfSize;

  return (
    <group>
      <mesh geometry={geometries.ground} material={mat('grass')} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
      <mesh geometry={geometries.road} material={mat('dirt')} receiveShadow />
      {geometries.paths.map((g, i) => (
        <mesh key={i} geometry={g} material={mat('path')} receiveShadow />
      ))}

      {/* Pond: bank, water and a darker centre for depth; west side has a small brick ghat. */}
      <group position={[POND.x, 0, POND.z]}>
        <mesh geometry={geometries.bank} material={mat('plinth')} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} receiveShadow />
        <mesh geometry={geometries.water} material={mat('water')} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} />
        {[0, 1, 2].map((i) => (
          <Block key={i} size={[0.6, 0.12, 2.2 - i * 0.2]} position={[-POND.radius - 0.3 + i * 0.55, 0.06 - i * 0.02, 0]} material={mat('brick')} castShadow={false} />
        ))}
      </group>

      <RigidBody type="fixed" colliders={false}>
        {/* Ground slab */}
        <CuboidCollider args={[120, 0.5, 120]} position={[0, -0.5, 0]} />
        {/* Pond water is a safe physical boundary; the camera may pass over it. */}
        <CylinderCollider args={[1, POND.radius - 0.2]} position={[POND.x, 0.5, POND.z]} name={CAMERA_TRANSPARENT} />
        {/* Village edge: invisible walls behind the boundary bamboo line. */}
        <CuboidCollider args={[h, 3, 0.5]} position={[0, 3, -h]} />
        <CuboidCollider args={[h, 3, 0.5]} position={[0, 3, h]} />
        <CuboidCollider args={[0.5, 3, h]} position={[-h, 3, 0]} />
        <CuboidCollider args={[0.5, 3, h]} position={[h, 3, 0]} />
      </RigidBody>
    </group>
  );
}
