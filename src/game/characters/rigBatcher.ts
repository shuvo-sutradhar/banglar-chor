/**
 * Draw-call batching for the procedural HumanRig (Phase 4C, D-064).
 *
 * A HumanRig is 25–40 small meshes under a hierarchy of animated groups. After mount, this turns
 * them into a few SkinnedMeshes WITHOUT changing how the rig animates or looks:
 * - the rig's own Groups are the skeleton "bones" (Skeleton only reads `matrixWorld`), so every
 *   existing pose/gait code keeps working unchanged;
 * - every part is rigidly skinned (weight 1) to its parent group, in the pose at bind time;
 * - all plain-colour Lambert parts merge into ONE mesh with the colour baked into vertex colours
 *   (identical shading: Lambert × white × vertex colour, same fog/lighting);
 * - each textured Lambert material (lungi/gamcha checks) becomes one skinned mesh;
 * - anything else (lantern glow, glass, oiled skin, transparent) and anything under a group
 *   marked `userData.noBatch` (toggled headband/sack, hand props with lights) stays as it was.
 * Original meshes are hidden, not removed (React still owns them). `dispose()` restores them.
 */
import {
  BufferAttribute,
  Color,
  Matrix4,
  MeshLambertMaterial,
  Skeleton,
  SkinnedMesh,
  Sphere,
  Vector3,
  type BufferGeometry,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Shared by every batched rig (never disposed): Lambert driven by vertex colours. */
const VERTEX_LAMBERT = new MeshLambertMaterial({ vertexColors: true });

export type BatchStats = { parts: number; batchedParts: number; drawsBefore: number; drawsAfter: number };

/** Live batched rigs (debug snapshot: how many draws the batching saves right now). */
export const liveRigBatches = new Set<BatchStats>();

const _w = new Vector3();
/** Pose-update LOD: is this rig farther than `far` metres from the camera? */
export function rigFarFromCamera(root: Object3D, camera: Vector3, far = 22): boolean {
  root.getWorldPosition(_w);
  return _w.distanceToSquared(camera) > far * far;
}

export function batchingDisabled(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    return q.has('debug') && q.has('nobatch');
  } catch {
    return false;
  }
}

type Bucket = { material: Material; parts: { mesh: Mesh; bone: number }[]; plain: boolean; castShadow: boolean };

function plainLambert(m: Material): m is MeshLambertMaterial {
  const l = m as MeshLambertMaterial;
  return l.isMeshLambertMaterial === true && !l.map && !l.transparent && !l.vertexColors && !l.emissiveMap && l.emissive.getHex() === 0;
}

function texturedLambert(m: Material): boolean {
  const l = m as MeshLambertMaterial;
  return l.isMeshLambertMaterial === true && !!l.map && !l.transparent && !l.vertexColors;
}

function underNoBatch(o: Object3D, root: Object3D): boolean {
  for (let p: Object3D | null = o; p && p !== root; p = p.parent) if (p.userData.noBatch) return true;
  return false;
}

/** Batch a mounted rig. Returns stats and a disposer (restores the original meshes). */
export function batchRig(root: Object3D): { stats: BatchStats; dispose: () => void } {
  root.updateWorldMatrix(true, true);
  const bones: Object3D[] = [root];
  const boneIndex = new Map<Object3D, number>([[root, 0]]);
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if (o === root) return;
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    else if (!boneIndex.has(o)) {
      boneIndex.set(o, bones.length);
      bones.push(o);
    }
  });

  const buckets = new Map<string, Bucket>();
  for (const mesh of meshes) {
    const material = mesh.material as Material;
    if (Array.isArray(mesh.material) || !mesh.visible || underNoBatch(mesh, root) || (mesh as unknown as SkinnedMesh).isSkinnedMesh) {
      continue;
    }
    const plain = plainLambert(material);
    if (!plain && !texturedLambert(material)) {
      continue;
    }
    const key = plain ? 'plain' : material.uuid;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { material: plain ? VERTEX_LAMBERT : material, parts: [], plain, castShadow: false }));
    b.parts.push({ mesh, bone: boneIndex.get(mesh.parent!) ?? 0 });
    if (mesh.castShadow) b.castShadow = true;
  }

  const rootInv = new Matrix4().copy(root.matrixWorld).invert();
  const m = new Matrix4();
  const color = new Color();
  const created: SkinnedMesh[] = [];
  const hidden: Mesh[] = [];
  const skeleton = new Skeleton(bones as never[]);
  for (const b of buckets.values()) {
    const geos: BufferGeometry[] = [];
    for (const { mesh, bone } of b.parts) {
      const g = mesh.geometry.clone();
      g.applyMatrix4(m.multiplyMatrices(rootInv, mesh.matrixWorld));
      const n = g.attributes.position!.count;
      if (b.plain) {
        g.deleteAttribute('uv');
        color.copy((mesh.material as MeshLambertMaterial).color);
        const c = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
        g.setAttribute('color', new BufferAttribute(c, 3));
      }
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        si[i * 4] = bone;
        sw[i * 4] = 1;
      }
      g.setAttribute('skinIndex', new BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new BufferAttribute(sw, 4));
      geos.push(g.index ? g : g);
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const sm = new SkinnedMesh(merged, b.material);
    sm.castShadow = b.castShadow;
    sm.name = b.plain ? 'rig-batch:plain' : `rig-batch:${b.material.name || 'textured'}`;
    // Generous fixed bounds around the body (poses move parts; never recomputed from bind pose).
    sm.boundingSphere = new Sphere(new Vector3(0, 0.9, 0), 1.5);
    root.add(sm);
    sm.updateMatrixWorld(true);
    sm.bind(skeleton, sm.matrixWorld);
    created.push(sm);
    for (const { mesh } of b.parts) {
      mesh.visible = false;
      hidden.push(mesh);
    }
  }
  skeleton.calculateInverses();
  const drawsBefore = meshes.filter((x) => x.visible || hidden.includes(x)).length;
  const stats: BatchStats = { parts: meshes.length, batchedParts: hidden.length, drawsBefore, drawsAfter: drawsBefore - hidden.length + created.length };
  return {
    stats,
    dispose: () => {
      for (const sm of created) {
        root.remove(sm);
        sm.geometry.dispose();
      }
      for (const h of hidden) h.visible = true;
    },
  };
}
