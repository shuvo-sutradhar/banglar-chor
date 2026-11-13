import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Object3D, type BufferGeometry } from 'three';
import { useFrame } from '@react-three/fiber';
import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { CAMERA_TRANSPARENT } from '../physics/queries';
import { bambooClumpGeometry, bananaGeometry, bushGeometry, palmGeometry, reedGeometry } from './propGeometries';
import { buildVegetationLayout, type PropInstance } from './vegetationLayout';
import { mat } from './materials';
import { WORLD_BOUNDS } from '../data/tuning';
import { useAppStore } from '../../state/useAppStore';

const dummy = new Object3D();

/** Deterministic per-position hash in [0, 1) — cosmetic only, never gameplay. */
function hash01(p: PropInstance): number {
  const h = Math.sin(p.x * 127.1 + p.z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
const heightJitter = (p: PropInstance) => 0.86 + 0.28 * hash01({ ...p, x: p.z, z: p.x });
/** Split instances into `n` look variants so neighbours differ (bamboo clumps, palms, bushes). */
function byVariant(list: PropInstance[], n: number): PropInstance[][] {
  const out: PropInstance[][] = Array.from({ length: n }, () => []);
  for (const p of list) out[Math.min(n - 1, Math.floor(hash01(p) * n))]!.push(p);
  return out;
}

function InstancedProp({ geometry, instances, castShadow, sway }: { geometry: BufferGeometry; instances: PropInstance[]; castShadow?: boolean; sway?: number }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    instances.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.rotY, 0);
      // Cosmetic height variation (positions/collider radii are untouched).
      dummy.scale.set(p.scale, p.scale * heightJitter(p), p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [instances]);

  // Gentle wind: rotate the whole instanced batch a tiny amount (one uniform-like update, no per-instance work).
  useFrame(({ clock }) => {
    if (!sway || !ref.current || useAppStore.getState().settings.reducedMotion) return;
    const t = clock.elapsedTime;
    ref.current.rotation.z = Math.sin(t * 0.7) * sway;
    ref.current.rotation.x = Math.cos(t * 0.5) * sway * 0.6;
  });

  return <instancedMesh ref={ref} args={[geometry, mat('vertexColor'), instances.length]} castShadow={castShadow} receiveShadow={false} frustumCulled={false} />;
}

export function Vegetation() {
  const layout = useMemo(() => buildVegetationLayout(), []);
  const geometries = useMemo(
    () => ({
      bamboo: [bambooClumpGeometry(0), bambooClumpGeometry(1), bambooClumpGeometry(2)],
      // The boundary ring is a distant backdrop: low-detail leaves keep the triangle count sane.
      bambooFar: [bambooClumpGeometry(3, 0), bambooClumpGeometry(4, 0)],
      palm: [palmGeometry(0), palmGeometry(1)],
      banana: bananaGeometry(),
      bush: [bushGeometry(0), bushGeometry(1)],
      reed: reedGeometry(),
    }),
    [],
  );
  const groups = useMemo(() => {
    const edge = WORLD_BOUNDS.halfSize - 1.5;
    const inner = layout.groves.filter((p) => Math.max(Math.abs(p.x), Math.abs(p.z)) < edge);
    const outer = layout.groves.filter((p) => Math.max(Math.abs(p.x), Math.abs(p.z)) >= edge);
    return { bamboo: byVariant(inner, 3), bambooFar: byVariant(outer, 2), palm: byVariant(layout.palms, 2), bush: byVariant(layout.bushes, 2) };
  }, [layout]);

  return (
    <group>
      {groups.bamboo.map((list, i) => list.length > 0 && <InstancedProp key={`b${i}`} geometry={geometries.bamboo[i]!} instances={list} castShadow sway={0.004} />)}
      {groups.bambooFar.map((list, i) => list.length > 0 && <InstancedProp key={`f${i}`} geometry={geometries.bambooFar[i]!} instances={list} castShadow sway={0.004} />)}
      {groups.palm.map((list, i) => list.length > 0 && <InstancedProp key={`p${i}`} geometry={geometries.palm[i]!} instances={list} castShadow sway={0.003} />)}
      <InstancedProp geometry={geometries.banana} instances={layout.bananas} castShadow />
      {groups.bush.map((list, i) => list.length > 0 && <InstancedProp key={`u${i}`} geometry={geometries.bush[i]!} instances={list} />)}
      <InstancedProp geometry={geometries.reed} instances={layout.reeds} />

      {/* Colliders: bamboo clumps and trunks block the player but not the camera. Bushes and reeds are soft. */}
      <RigidBody type="fixed" colliders={false}>
        {layout.groves.map((p, i) => (
          <CylinderCollider key={`g${i}`} args={[1.5, 0.75 * p.scale]} position={[p.x, 1.5, p.z]} name={CAMERA_TRANSPARENT} />
        ))}
        {layout.palms.map((p, i) => (
          <CylinderCollider key={`p${i}`} args={[1.5, 0.28 * p.scale]} position={[p.x, 1.5, p.z]} name={CAMERA_TRANSPARENT} />
        ))}
        {layout.bananas.map((p, i) => (
          <CylinderCollider key={`b${i}`} args={[1.1, 0.24 * p.scale]} position={[p.x, 1.1, p.z]} name={CAMERA_TRANSPARENT} />
        ))}
      </RigidBody>
    </group>
  );
}
