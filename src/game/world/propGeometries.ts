import { BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, type BufferGeometry } from 'three';
import { createRng } from '../../lib/rng';
import { mergeColoredParts, type ColoredPart } from './geometryUtils';
import { PALETTE } from './materials';

export function bambooClumpGeometry(): BufferGeometry {
  const rng = createRng(101);
  const parts: ColoredPart[] = [];
  const culm = new CylinderGeometry(0.06, 0.08, 1, 5);
  const leaf = new IcosahedronGeometry(1, 0);
  for (let i = 0; i < 9; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const r = rng.range(0.1, 0.6);
    const h = rng.range(5, 7.5);
    const tiltX = rng.range(-0.18, 0.18);
    const tiltZ = rng.range(-0.18, 0.18);
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    parts.push({ geometry: culm, color: rng.next() > 0.4 ? PALETTE.bamboo : PALETTE.bambooDark, position: [x + tiltZ * h * 0.5, h / 2, z - tiltX * h * 0.5], rotation: [tiltX, 0, tiltZ], scale: [1, h, 1] });
    parts.push({ geometry: leaf, color: rng.next() > 0.5 ? PALETTE.vegetation : PALETTE.vegetationDark, position: [x + tiltZ * h, h - 0.3, z - tiltX * h], scale: [1.1, 0.7, 1.1] });
  }
  for (let i = 0; i < 4; i++) {
    parts.push({ geometry: leaf, color: PALETTE.vegetationDark, position: [rng.range(-0.8, 0.8), rng.range(3, 4.5), rng.range(-0.8, 0.8)], scale: [1.3, 0.9, 1.3] });
  }
  return mergeColoredParts(parts);
}

export function palmGeometry(): BufferGeometry {
  const parts: ColoredPart[] = [];
  const seg = new CylinderGeometry(0.16, 0.2, 1.6, 6);
  // Gently curving trunk built from stacked segments.
  for (let i = 0; i < 5; i++) {
    parts.push({ geometry: seg, color: i % 2 ? '#6d5640' : '#5e4936', position: [i * i * 0.04, 0.8 + i * 1.5, 0], rotation: [0, 0, -0.05 * i] });
  }
  const top: [number, number, number] = [1.0, 7.9, 0];
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

export function bushGeometry(): BufferGeometry {
  const blob = new IcosahedronGeometry(0.7, 0);
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
