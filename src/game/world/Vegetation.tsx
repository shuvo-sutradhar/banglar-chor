import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Object3D, type BufferGeometry } from 'three';
import { useFrame } from '@react-three/fiber';
import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { CAMERA_TRANSPARENT } from '../physics/queries';
import { bambooClumpGeometry, bananaGeometry, bushGeometry, palmGeometry, reedGeometry } from './propGeometries';
import { buildVegetationLayout, type PropInstance } from './vegetationLayout';
import { mat } from './materials';
import { useAppStore } from '../../state/useAppStore';

const dummy = new Object3D();

function InstancedProp({ geometry, instances, castShadow, sway }: { geometry: BufferGeometry; instances: PropInstance[]; castShadow?: boolean; sway?: number }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    instances.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.scale.setScalar(p.scale);
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
    () => ({ bamboo: bambooClumpGeometry(), palm: palmGeometry(), banana: bananaGeometry(), bush: bushGeometry(), reed: reedGeometry() }),
    [],
  );

  return (
    <group>
      <InstancedProp geometry={geometries.bamboo} instances={layout.groves} castShadow sway={0.004} />
      <InstancedProp geometry={geometries.palm} instances={layout.palms} castShadow sway={0.003} />
      <InstancedProp geometry={geometries.banana} instances={layout.bananas} castShadow />
      <InstancedProp geometry={geometries.bush} instances={layout.bushes} />
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
