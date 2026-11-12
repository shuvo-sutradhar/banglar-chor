import { BufferAttribute, Color, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry, type ColorRepresentation } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type ColoredPart = {
  geometry: BufferGeometry;
  color: ColorRepresentation;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
};

const tmpMatrix = new Matrix4();
const tmpQuat = new Quaternion();
const tmpEuler = new Euler();
const tmpPos = new Vector3();
const tmpScale = new Vector3();

/**
 * Bake several primitives into one vertex-coloured geometry so a whole prop
 * (e.g. a palm tree) renders in a single draw call and can be instanced.
 * Uses non-indexed geometry so differently indexed primitives merge safely.
 */
export function mergeColoredParts(parts: ColoredPart[]): BufferGeometry {
  const prepared = parts.map((part) => {
    let g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    g.deleteAttribute('uv');
    tmpEuler.set(...(part.rotation ?? [0, 0, 0]));
    tmpQuat.setFromEuler(tmpEuler);
    tmpPos.set(...(part.position ?? [0, 0, 0]));
    tmpScale.set(...(part.scale ?? [1, 1, 1]));
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    g = g.applyMatrix4(tmpMatrix);
    const color = new Color(part.color);
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('mergeColoredParts: incompatible geometry attributes');
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  for (const g of prepared) g.dispose();
  return merged;
}
