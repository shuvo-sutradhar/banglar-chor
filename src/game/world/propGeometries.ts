import { BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, type BufferGeometry } from 'three';
import { createRng } from '../../lib/rng';
import { mergeColoredParts, type ColoredPart } from './geometryUtils';
import { PALETTE } from './materials';

const BAMBOO_GREENS = ['#4f7a3a', '#5d8a41', '#46703a', '#6a9446'];

/**
 * Bamboo clump (বাঁশঝাড়): culms fan outward from a tight base and arch over, with rounded leaf
 * masses drooping off the tips. `variant` changes the seed so neighbouring clumps differ.
 */
export function bambooClumpGeometry(variant = 0, detail: 0 | 1 = 1): BufferGeometry {
  const rng = createRng(101 + variant * 977);
  const parts: ColoredPart[] = [];
  const culm = new CylinderGeometry(0.055, 0.08, 1, 5);
  const leaf = new IcosahedronGeometry(1, detail);
  const n = 8 + Math.floor(rng.range(0, 4));
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const r = rng.range(0.08, 0.45);
    const h = rng.range(4.6, 7.6);
    const lean = 0.06 + r * 0.35 + rng.range(0, 0.1); // outer culms lean further out
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const tiltX = dz * lean;
    const tiltZ = -dx * lean;
    const x = dx * r;
    const z = dz * r;
    const topX = x + dx * Math.sin(lean) * h;
    const topZ = z + dz * Math.sin(lean) * h;
    const topY = Math.cos(lean) * h;
    parts.push({ geometry: culm, color: rng.next() > 0.35 ? PALETTE.bamboo : PALETTE.bambooDark, position: [(x + topX) / 2, topY / 2, (z + topZ) / 2], rotation: [tiltX, 0, tiltZ], scale: [1, h, 1] });
    // drooping leaf spray just past the tip, hanging outward and down
    if (i % 2 === 0 || h > 6.5) {
      const c = BAMBOO_GREENS[Math.floor(rng.range(0, BAMBOO_GREENS.length))]!;
      parts.push({ geometry: leaf, color: c, position: [topX + dx * 0.5, topY - 0.55, topZ + dz * 0.5], scale: [1.05, 0.62, 1.05], rotation: [rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3)] });
    }
  }
  // inner canopy fill so the clump reads as one soft mass, not separate balls
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, Math.PI * 2);
    parts.push({ geometry: leaf, color: i === 0 ? PALETTE.vegetationDark : BAMBOO_GREENS[i]!, position: [Math.cos(a) * 0.7, rng.range(4.2, 5.4), Math.sin(a) * 0.7], scale: [1.5, 0.85, 1.5] });
  }
  return mergeColoredParts(parts);
}

export function palmGeometry(variant = 0): BufferGeometry {
  const parts: ColoredPart[] = [];
  const seg = new CylinderGeometry(0.16, 0.2, 1.6, 6);
  const bend = variant === 1 ? 0.02 : 0.04; // variant 1 stands straighter and taller
  const segs = variant === 1 ? 6 : 5;
  // Gently curving trunk built from stacked segments.
  for (let i = 0; i < segs; i++) {
    parts.push({ geometry: seg, color: i % 2 ? '#6d5640' : '#5e4936', position: [i * i * bend, 0.8 + i * 1.5, 0], rotation: [0, 0, -bend * 1.25 * i] });
  }
  const top: [number, number, number] = [(segs - 1) * (segs - 1) * bend + 0.36, 0.8 + (segs - 1) * 1.5 + 1.1, 0];
  const frond = new ConeGeometry(0.35, 3.2, 4);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push({
      geometry: frond,
      color: i % 2 ? PALETTE.vegetation : '#3b5e35',
      position: [top[0] + Math.cos(a) * 1.3, top[1] - 0.35, top[2] + Math.sin(a) * 1.3],
      rotation: [Math.sin(a) * 1.9, 0, -Math.cos(a) * 1.9],
      scale: [1, 1, 0.25],
    });
  }
  parts.push({ geometry: new IcosahedronGeometry(0.35, 0), color: '#4a3a22', position: top });
  return mergeColoredParts(parts);
}

export function bananaGeometry(): BufferGeometry {
  const parts: ColoredPart[] = [];
  parts.push({ geometry: new CylinderGeometry(0.14, 0.2, 2.2, 6), color: '#5f7a3a', position: [0, 1.1, 0] });
  const leaf = new BoxGeometry(0.55, 0.04, 2.2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    parts.push({
      geometry: leaf,
      color: i % 2 ? '#5d8f3e' : '#4f7d36',
      position: [Math.cos(a) * 0.85, 2.35, Math.sin(a) * 0.85],
      rotation: [0, -a + Math.PI / 2, 0.55],
    });
  }
  return mergeColoredParts(parts);
}

export function bushGeometry(variant = 0): BufferGeometry {
  const blob = new IcosahedronGeometry(0.7, 1);
  if (variant === 1)
    return mergeColoredParts([
      { geometry: blob, color: '#3f6236', position: [0, 0.4, 0], scale: [1.0, 0.65, 1.3] },
      { geometry: blob, color: '#557f3f', position: [0.35, 0.62, -0.3], scale: [0.65, 0.6, 0.65] },
    ]);
  return mergeColoredParts([
    { geometry: blob, color: PALETTE.vegetationDark, position: [0, 0.45, 0], scale: [1.2, 0.8, 1.1] },
    { geometry: blob, color: PALETTE.vegetation, position: [0.5, 0.55, 0.2], scale: [0.8, 0.7, 0.8] },
    { geometry: blob, color: '#3d5d36', position: [-0.4, 0.5, -0.3], scale: [0.7, 0.6, 0.7] },
  ]);
}

export function reedGeometry(): BufferGeometry {
  const blade = new ConeGeometry(0.05, 1.3, 3);
  return mergeColoredParts([
    { geometry: blade, color: '#5c7a3f', position: [0, 0.65, 0] },
    { geometry: blade, color: '#6d8a46', position: [0.12, 0.55, 0.05], rotation: [0.15, 0, -0.2] },
    { geometry: blade, color: '#4f6d38', position: [-0.1, 0.6, -0.06], rotation: [-0.15, 0, 0.2] },
  ]);
}

export function haystackGeometry(): BufferGeometry {
  return mergeColoredParts([
    { geometry: new CylinderGeometry(1.0, 1.15, 1.4, 9), color: PALETTE.straw, position: [0, 0.7, 0] },
    { geometry: new ConeGeometry(1.08, 1.4, 9), color: '#b48a4c', position: [0, 2.1, 0] },
    { geometry: new CylinderGeometry(0.04, 0.04, 0.8, 4), color: PALETTE.woodDark, position: [0, 3.0, 0] },
  ]);
}
