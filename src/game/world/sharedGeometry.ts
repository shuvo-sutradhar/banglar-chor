import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Shape, SphereGeometry } from 'three';

/** Unit primitives shared by every prop (scaled per mesh) to minimise geometry count. */
export const UNIT_BOX = new BoxGeometry(1, 1, 1);
export const UNIT_CYLINDER = new CylinderGeometry(0.5, 0.5, 1, 10);
export const UNIT_SPHERE = new SphereGeometry(0.5, 10, 8);

const prismCache = new Map<string, ExtrudeGeometry>();

/** Triangular prism for gable ends / gable roofs. Base width along X, apex up, extruded along Z (centred). */
export function prismGeometry(width: number, height: number, depth: number): ExtrudeGeometry {
  const key = `${width}:${height}:${depth}`;
  let g = prismCache.get(key);
  if (!g) {
    const shape = new Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, height);
    shape.closePath();
    g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    prismCache.set(key, g);
  }
  return g;
}

const rampCache = new Map<string, ExtrudeGeometry>();

/**
 * Right-angle wedge: full `height` at local z = 0, sloping to the ground at z = +run,
 * spanning `width` along X (centred). Used for veranda edges.
 */
export function rampGeometry(width: number, height: number, run: number): ExtrudeGeometry {
  const key = `${width}:${height}:${run}`;
  let g = rampCache.get(key);
  if (!g) {
    const shape = new Shape();
    shape.moveTo(0, 0);
    shape.lineTo(run, 0);
    shape.lineTo(0, height);
    shape.closePath();
    g = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    g.translate(0, 0, -width / 2);
    g.rotateY(-Math.PI / 2);
    rampCache.set(key, g);
  }
  return g;
}
