// Generates public/assets/models/characters/thief_placeholder.glb.
//
// HONEST LABEL: this is a CODE-GENERATED placeholder, not a Blender or artist-made model. It exists
// so the runtime GLB pipeline (loader, skeleton, AnimationMixer state controller, clip speeds,
// shape key, fallbacks) can be built and tested against a file that follows
// docs/BLENDER_CHARACTER_SPEC.md exactly. A character artist's thief.glb replaces it with no code
// changes. Run: npm run assets:placeholder
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// --- Node polyfills for GLTFExporter (binary output uses FileReader) ---
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
};

const OUT = process.argv[2] ?? 'public/assets/models/characters/thief_placeholder.glb';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const col = (hex) => new THREE.Color(hex);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- skeleton (world rest positions)
// Character faces +Z, +X is his LEFT. Leg lengths match the gait maths below.
const THIGH = 0.42;
const SHIN = 0.41;
const ANKLE_H = 0.07;
const HIP_Y = THIGH + SHIN + ANKLE_H; // 0.90
const BONES = [
  ['root', null, V(0, 0, 0)],
  ['hips', 'root', V(0, HIP_Y + 0.02, 0)],
  ['spine', 'hips', V(0, 1.02, 0)],
  ['chest', 'spine', V(0, 1.18, 0)],
  ['neck', 'chest', V(0, 1.4, 0.0)],
  ['head', 'neck', V(0, 1.47, 0.01)],
  ['shoulder_L', 'chest', V(0.07, 1.35, 0)],
  ['upperarm_L', 'shoulder_L', V(0.2, 1.35, -0.01)],
  ['forearm_L', 'upperarm_L', V(0.225, 1.07, -0.01)],
  ['hand_L', 'forearm_L', V(0.24, 0.82, 0.0)],
  ['shoulder_R', 'chest', V(-0.07, 1.35, 0)],
  ['upperarm_R', 'shoulder_R', V(-0.2, 1.35, -0.01)],
  ['forearm_R', 'upperarm_R', V(-0.225, 1.07, -0.01)],
  ['hand_R', 'forearm_R', V(-0.24, 0.82, 0.0)],
  ['gamcha_tail', 'chest', V(0.08, 1.37, 0.1)],
  ['thigh_L', 'hips', V(0.095, HIP_Y, 0)],
  ['shin_L', 'thigh_L', V(0.095, HIP_Y - THIGH, 0)],
  ['foot_L', 'shin_L', V(0.095, ANKLE_H, 0)],
  ['thigh_R', 'hips', V(-0.095, HIP_Y, 0)],
  ['shin_R', 'thigh_R', V(-0.095, HIP_Y - THIGH, 0)],
  ['foot_R', 'shin_R', V(-0.095, ANKLE_H, 0)],
  ['lungi_front', 'hips', V(0, 0.86, 0.1)],
  ['lungi_back', 'hips', V(0, 0.86, -0.1)],
];
const BONE_INDEX = Object.fromEntries(BONES.map(([n], i) => [n, i]));
const REST = Object.fromEntries(BONES.map(([n, , p]) => [n, p]));

// ---------------------------------------------------------------- mesh builder
class Part {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.si = [];
    this.sw = [];
    this.tuck = [];
    this.idx = [];
  }
  /**
   * Append a geometry (already in world rest space) with per-vertex colour and skin weights.
   * weight(p, i) → [[bone, w], ...]; colour(p, i) → THREE.Color; tuck(p) → tucked position or null.
   */
  add(geometry, { colour, weight, tuck }) {
    const g = geometry.index ? geometry : geometry; // indexed or not, handled below
    g.computeVertexNormals();
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const base = this.pos.length / 3;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      const c = colour(v, i);
      this.col.push(c.r, c.g, c.b);
      const ws = weight(v, i)
        .filter(([, w]) => w > 1e-3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);
      const sum = ws.reduce((s, [, w]) => s + w, 0) || 1;
      for (let k = 0; k < 4; k++) {
        this.si.push(ws[k] ? BONE_INDEX[ws[k][0]] : 0);
        this.sw.push(ws[k] ? ws[k][1] / sum : 0);
      }
      const t = tuck ? tuck(v) : null;
      this.tuck.push(t ? t.x : v.x, t ? t.y : v.y, t ? t.z : v.z);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }
}

const one = (bone) => () => [[bone, 1]];
const solid = (hex) => {
  const c = col(hex);
  return () => c;
};
/** Transform helper: geometry → world rest space. */
function placed(geometry, { at = V(0, 0, 0), scale = V(1, 1, 1), rot = [0, 0, 0] } = {}) {
  const m = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), scale);
  geometry.applyMatrix4(m);
  return geometry;
}

/**
 * A smooth tube through joint centres, with skin weights blended across each joint (so elbows and
 * knees bend as one continuous surface instead of separate primitives).
 */
function limb(points, radii, bones, { radial = 12, perSeg = 6, blend = 0.05, flatten = 1 } = {}) {
  const rings = [];
  const weights = [];
  const segLen = [];
  for (let i = 0; i < points.length - 1; i++) segLen.push(points[i].distanceTo(points[i + 1]));
  let s0 = 0;
  const jointS = [0];
  for (const l of segLen) jointS.push((s0 += l));
  const ref = V(0, 0, 1);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dir = b.clone().sub(a).normalize();
    const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.dot(ref)) > 0.9 ? V(1, 0, 0) : ref).normalize();
    const fwd = new THREE.Vector3().crossVectors(side, dir).normalize();
    for (let k = i === 0 ? 0 : 1; k <= perSeg; k++) {
      const t = k / perSeg;
      const c = a.clone().lerp(b, t);
      const r = radii[i] + (radii[i + 1] - radii[i]) * t;
      const ring = [];
      for (let j = 0; j < radial; j++) {
        const ang = (j / radial) * Math.PI * 2;
        ring.push(c.clone().addScaledVector(side, Math.cos(ang) * r).addScaledVector(fwd, Math.sin(ang) * r * flatten));
      }
      rings.push(ring);
      // weight along the chain: nearest interior joint blends its two bones
      const s = jointS[i] + segLen[i] * t;
      let w = [[bones[i], 1]];
      for (let jn = 1; jn < points.length - 1; jn++) {
        const d = s - jointS[jn];
        if (Math.abs(d) < blend) {
          const f = smooth(-blend, blend, d);
          w = [
            [bones[jn - 1], 1 - f],
            [bones[jn], f],
          ];
        }
      }
      weights.push(w);
    }
  }
  // ringsToGeometry appends the two cap centres after the ring vertices (first ring, then last)
  const perVertex = rings.flatMap((r, i) => r.map(() => weights[i]));
  perVertex.push(weights[0], weights[weights.length - 1]);
  return { geometry: ringsToGeometry(rings, true), weights: perVertex };
}

/** Closed rings → indexed triangle surface (optional end caps). */
function ringsToGeometry(rings, caps) {
  const pos = [];
  const idx = [];
  const radial = rings[0].length;
  for (const r of rings) for (const p of r) pos.push(p.x, p.y, p.z);
  // Orientation: ring order (up or down a limb) decides winding; make faces point outward.
  const c0 = rings[0].reduce((acc, p) => acc.add(p), V(0, 0, 0)).multiplyScalar(1 / radial);
  const ea = rings[0][0];
  const eb = rings[0][1];
  const ec = rings[1][0];
  const nrm = ec.clone().sub(ea).cross(eb.clone().sub(ea));
  const outward = nrm.dot(ea.clone().sub(c0)) >= 0;
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      if (outward) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  if (caps) {
    for (const [ri, first] of [
      [0, true],
      [rings.length - 1, false],
    ]) {
      const flip = first === outward;
      const centre = rings[ri].reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(1 / radial);
      const ci = pos.length / 3;
      pos.push(centre.x, centre.y, centre.z);
      for (let j = 0; j < radial; j++) {
        const a = ri * radial + j;
        const b = ri * radial + ((j + 1) % radial);
        if (flip) idx.push(ci, a, b);
        else idx.push(ci, b, a);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- palette (sRGB)
const SKIN = col('#9a6442');
const SKIN_DARK = col('#7a4b30');
const SKIN_LIGHT = col('#b07a54');
const INDIGO = col('#2e3f78');
const MAROON = col('#7a2633');
const CREAM = col('#e6d8b8');
const RED = col('#b8322b');
const OFFWHITE = col('#efe4cc');
const GREEN = col('#3f8a3a');
const HAIR = col('#1b1410');

const skin = new Part();
const cloth = new Part();
const band = new Part();

// ---- torso: elliptical rings hips → neck, weighted hips/spine/chest/neck by height
{
  const profile = [
    // y, rx, rz, forward offset
    [0.86, 0.145, 0.105, 0.0],
    [0.95, 0.15, 0.11, 0.005],
    [1.03, 0.152, 0.115, 0.012],
    [1.12, 0.165, 0.112, 0.01],
    [1.22, 0.185, 0.115, 0.012],
    [1.3, 0.195, 0.11, 0.005],
    [1.35, 0.17, 0.095, 0.0],
    [1.39, 0.085, 0.07, 0.0],
    [1.42, 0.055, 0.052, 0.005],
  ];
  const radial = 18;
  const rings = profile.map(([y, rx, rz, f]) => {
    const r = [];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      // slightly flatter back, rounder belly
      const z = Math.sin(a) * rz * (Math.sin(a) > 0 ? 1.08 : 0.92);
      r.push(V(Math.cos(a) * rx, y, z + f));
    }
    return r;
  });
  skin.add(ringsToGeometry(rings, true), {
    colour: (p) => (p.y > 1.37 ? SKIN : p.y < 0.98 ? SKIN_DARK : SKIN.clone().lerp(SKIN_LIGHT, smooth(1.1, 1.3, p.y) * 0.5)),
    weight: (p) => {
      const sp = smooth(0.93, 1.03, p.y);
      const ch = smooth(1.1, 1.22, p.y);
      const nk = smooth(1.38, 1.42, p.y);
      const w = [
        ['hips', 1 - sp],
        ['spine', sp * (1 - ch)],
        ['chest', ch * (1 - nk)],
        ['neck', nk],
      ];
      // shoulder caps follow the arms a little
      const sideL = smooth(0.12, 0.19, p.x) * smooth(1.22, 1.33, p.y);
      const sideR = smooth(0.12, 0.19, -p.x) * smooth(1.22, 1.33, p.y);
      if (sideL) w.push(['shoulder_L', sideL * 0.6]);
      if (sideR) w.push(['shoulder_R', sideR * 0.6]);
      return w;
    },
  });
  // deltoids (smooth shoulder balls, blend chest → upper arm)
  for (const s of [1, -1]) {
    const g = placed(new THREE.SphereGeometry(0.056, 10, 8), { at: V(0.182 * s, 1.33, -0.005), scale: V(0.95, 1.0, 0.95) });
    skin.add(g, { colour: () => SKIN, weight: (p) => [['chest', 0.35], [s > 0 ? 'upperarm_L' : 'upperarm_R', 0.65]] });
  }
}

// ---- neck
{
  const { geometry, weights } = limb([V(0, 1.38, 0.0), V(0, 1.5, 0.015)], [0.048, 0.046], ['neck'], { radial: 12, perSeg: 3 });
  skin.add(geometry, { colour: () => SKIN, weight: (p, i) => (p.y > 1.46 ? [['head', 0.6], ['neck', 0.4]] : weights[i] ?? [['neck', 1]]) });
}

// ---- head: rounded skull + jaw, nose, ears, eyes, brows, moustache, hair
{
  const HEAD = V(0, 1.555, 0.015);
  const g = new THREE.SphereGeometry(1, 20, 14);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * 0.104;
    let y = p.getY(i) * 0.125;
    let z = p.getZ(i) * 0.115;
    if (y < -0.02) {
      // longer jaw, pushed forward: the long-faced comic profile
      const k = smooth(-0.02, -0.125, y);
      z += 0.018 * k;
      x *= 1 - 0.22 * k;
      y -= 0.012 * k;
    }
    p.setXYZ(i, x + HEAD.x, y + HEAD.y, z + HEAD.z);
  }
  skin.add(g, { colour: (v) => (v.y < HEAD.y - 0.06 ? SKIN_DARK.clone().lerp(SKIN, 0.4) : SKIN), weight: one('head') });
  // nose: long and a little bulbous
  skin.add(placed(new THREE.SphereGeometry(1, 10, 8), { at: V(0, 1.535, 0.128), scale: V(0.022, 0.036, 0.04), rot: [0.35, 0, 0] }), { colour: () => SKIN_LIGHT, weight: one('head') });
  skin.add(placed(new THREE.SphereGeometry(1, 8, 6), { at: V(0, 1.513, 0.148), scale: V(0.024, 0.02, 0.02) }), { colour: () => SKIN_LIGHT, weight: one('head') });
  // ears stick out
  for (const s of [1, -1])
    skin.add(placed(new THREE.SphereGeometry(1, 8, 6), { at: V(0.104 * s, 1.55, 0.0), scale: V(0.018, 0.038, 0.026), rot: [0, 0.5 * s, 0] }), {
      colour: () => SKIN_LIGHT,
      weight: one('head'),
    });
  // eyes: big whites + pupils glancing sideways (mischief)
  for (const s of [1, -1]) {
    cloth.add(placed(new THREE.SphereGeometry(0.027, 8, 6), { at: V(0.041 * s, 1.575, 0.104), scale: V(1, 1.15, 0.6) }), { colour: solid('#f3ece0'), weight: one('head') });
    cloth.add(placed(new THREE.SphereGeometry(0.0125, 6, 4), { at: V(0.041 * s + 0.006, 1.573, 0.121), scale: V(1, 1.15, 0.5) }), { colour: solid('#1a1410'), weight: one('head') });
    // heavy arched brows, outer ends raised
    cloth.add(placed(new THREE.BoxGeometry(0.056, 0.016, 0.018), { at: V(0.044 * s, 1.616, 0.108), rot: [0.15, 0, -0.32 * s] }), { colour: () => HAIR, weight: one('head') });
  }
  // mouth: sly grin
  cloth.add(placed(new THREE.BoxGeometry(0.055, 0.008, 0.012), { at: V(0.006, 1.468, 0.13), rot: [0, 0, 0.12] }), { colour: solid('#4f2219'), weight: one('head') });
  // the signature moustache: thick, curling up at both tips
  for (const s of [1, -1]) {
    const curve = new THREE.CatmullRomCurve3([V(0.0, 1.492, 0.142), V(0.035 * s, 1.488, 0.135), V(0.062 * s, 1.497, 0.118), V(0.077 * s, 1.517, 0.103), V(0.071 * s, 1.533, 0.1)]);
    const tube = new THREE.TubeGeometry(curve, 10, 0.0095, 5, false);
    cloth.add(tube, { colour: () => HAIR, weight: one('head') });
  }
  // oiled hair cap with a side parting
  const hair = new THREE.SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, 1.45);
  hair.rotateX(-0.32); // tilt back so the cap covers the crown and the back of the head
  const hp = hair.getAttribute('position');
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i) * 0.111;
    const y = hp.getY(i) * 0.13;
    const z = hp.getZ(i) * 0.122;
    hp.setXYZ(i, x + HEAD.x, y + HEAD.y + 0.006, z + HEAD.z - 0.01);
  }
  cloth.add(hair, { colour: (v) => (Math.abs(v.x - 0.03) < 0.006 && v.z > 0.04 ? HAIR.clone().lerp(SKIN, 0.4) : HAIR), weight: one('head') });
}

// ---- arms and big hands
for (const s of [1, -1]) {
  const L = s > 0 ? 'L' : 'R';
  const pts = [REST[`upperarm_${L}`], REST[`forearm_${L}`], REST[`hand_${L}`]];
  const { geometry, weights } = limb(pts, [0.05, 0.04, 0.032], [`upperarm_${L}`, `forearm_${L}`], { radial: 10, perSeg: 5, blend: 0.05 });
  skin.add(geometry, { colour: (p) => (p.y < 0.95 ? SKIN_DARK.clone().lerp(SKIN, 0.5) : SKIN), weight: (p, i) => weights[i] });
  const wrist = REST[`hand_${L}`];
  skin.add(placed(new THREE.SphereGeometry(1, 10, 8), { at: V(wrist.x + 0.004 * s, wrist.y - 0.065, wrist.z + 0.005), scale: V(0.03, 0.062, 0.045) }), { colour: () => SKIN, weight: one(`hand_${L}`) });
  // thumb
  skin.add(placed(new THREE.CapsuleGeometry(0.012, 0.035, 4, 6), { at: V(wrist.x - 0.006 * s, wrist.y - 0.045, wrist.z + 0.04), rot: [0.5, 0, 0.3 * s] }), { colour: () => SKIN, weight: one(`hand_${L}`) });
}

// ---- legs (mostly under the lungi) and long bare feet
for (const s of [1, -1]) {
  const L = s > 0 ? 'L' : 'R';
  const pts = [REST[`thigh_${L}`].clone().setY(HIP_Y + 0.03), REST[`shin_${L}`], REST[`foot_${L}`]];
  const { geometry, weights } = limb(pts, [0.075, 0.052, 0.036], [`thigh_${L}`, `shin_${L}`], { radial: 10, perSeg: 5, blend: 0.06 });
  skin.add(geometry, { colour: () => SKIN_DARK, weight: (p, i) => weights[i] });
  const ank = REST[`foot_${L}`];
  const foot = placed(new THREE.SphereGeometry(1, 10, 7), { at: V(ank.x + 0.005 * s, 0.035, ank.z + 0.06), scale: V(0.048, 0.035, 0.125) });
  // flat sole
  const fp = foot.getAttribute('position');
  for (let i = 0; i < fp.count; i++) if (fp.getY(i) < 0.004) fp.setY(i, 0.004);
  skin.add(foot, { colour: () => SKIN_DARK, weight: one(`foot_${L}`) });
}

// ---- checked lungi: flared skirt, weights blend hips → thighs; LungiTuck shape key hitches it up
{
  const radial = 32;
  const levels = 16;
  const top = 0.97;
  const hem = 0.12;
  const rings = [];
  for (let k = 0; k <= levels; k++) {
    const y = top + (hem - top) * (k / levels);
    const u = k / levels;
    const rx = 0.158 + 0.08 * Math.pow(u, 0.7);
    const rz = 0.124 + 0.085 * Math.pow(u, 0.7);
    const ring = [];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      // a soft front pleat under the knot
      const pleat = Math.max(0, Math.sin(a)) * 0.012 * Math.sin(a * 6) * u;
      ring.push(V(Math.cos(a) * rx, y, Math.sin(a) * rz + pleat));
    }
    rings.push(ring);
  }
  const g = ringsToGeometry(rings, false);
  cloth.add(g, {
    colour: (p) => {
      const a = Math.atan2(p.z, p.x);
      const cu = (a / (Math.PI * 2)) * 16;
      const cv = p.y * 14;
      const line = Math.abs(cu - Math.round(cu)) < 0.12 || Math.abs(cv - Math.round(cv)) < 0.12;
      const cell = (Math.floor(cu) + Math.floor(cv)) & 1;
      const base = cell ? INDIGO : MAROON;
      return line ? base.clone().lerp(CREAM, 0.55) : p.y > 0.93 ? base.clone().lerp(CREAM, 0.15) : base;
    },
    weight: (p) => {
      const f = smooth(0.92, 0.62, p.y); // 0 at the waist → 1 from mid-thigh down
      const side = smooth(-0.2, 0.2, p.x); // +X = left leg; wide blend = cloth spans between the legs
      const w = [
        ['hips', 1 - 0.85 * f],
        ['thigh_L', 0.85 * f * side],
        ['thigh_R', 0.85 * f * (1 - side)],
      ];
      w.push([p.z > 0 ? 'lungi_front' : 'lungi_back', 0.15 * f]);
      return w;
    },
    // tucked (malkochha-ish): the hem rises to just below the knee and pulls in
    tuck: (p) => {
      const u = (top - p.y) / (top - hem);
      const y = top - u * (top - 0.5);
      const pull = 1 - 0.18 * u;
      return V(p.x * pull, y, p.z * pull + (p.z > 0 ? 0.01 * u : 0));
    },
  });
  // waist knot
  cloth.add(placed(new THREE.SphereGeometry(1, 10, 8), { at: V(0.01, 0.94, 0.128), scale: V(0.032, 0.026, 0.02) }), { colour: () => MAROON, weight: one('hips') });
}

// ---- red gamcha around the neck, tail over the chest
{
  const g = placed(new THREE.TorusGeometry(0.075, 0.024, 8, 24), { at: V(0, 1.4, 0.01), rot: [Math.PI / 2 + 0.25, 0, 0], scale: V(1.1, 1, 0.95) });
  const checks = (p) => {
    const a = Math.atan2(p.z, p.x);
    return Math.floor((a / Math.PI) * 6) & 1 ? RED : OFFWHITE.clone().lerp(RED, 0.25);
  };
  cloth.add(g, { colour: checks, weight: () => [['neck', 0.5], ['chest', 0.5]] });
  const tail = placed(new THREE.BoxGeometry(0.075, 0.2, 0.014, 2, 5, 1), { at: V(0.09, 1.3, 0.115), rot: [-0.15, 0, 0.1] });
  cloth.add(tail, {
    colour: (p) => ((Math.floor(p.y * 25) + Math.floor((p.x - 0.05) * 40)) & 1 ? RED : RED.clone().lerp(OFFWHITE, 0.55)),
    weight: (p) => [['gamcha_tail', smooth(1.38, 1.22, p.y)], ['chest', 1 - smooth(1.38, 1.22, p.y)]],
  });
}

// ---- green headband (separate node so the game can toggle it after preparation)
{
  const g = placed(new THREE.TorusGeometry(0.113, 0.014, 6, 28), { at: V(0, 1.6, 0.012), rot: [Math.PI / 2 - 0.12, 0, 0], scale: V(0.96, 1.06, 1) });
  band.add(g, { colour: () => GREEN, weight: one('head') });
  band.add(placed(new THREE.BoxGeometry(0.04, 0.06, 0.012), { at: V(0.02, 1.565, -0.122), rot: [0.3, 0, 0.4] }), { colour: () => GREEN, weight: one('head') });
}

// ---------------------------------------------------------------- assemble
function toGeometry(part, groups) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(part.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(part.col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(part.si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(part.sw, 4));
  g.setIndex(part.idx);
  if (groups) for (const [start, count, m] of groups) g.addGroup(start, count, m);
  return g;
}

// Body = skin + cloth in ONE mesh with two material groups (2 draw calls total for the body).
const merged = new Part();
for (const k of ['pos', 'nrm', 'col', 'si', 'sw', 'tuck']) merged[k] = [...skin[k], ...cloth[k]];
const skinVerts = skin.pos.length / 3;
merged.idx = [...skin.idx, ...cloth.idx.map((i) => i + skinVerts)];
const bodyGeo = toGeometry(merged, [
  [0, skin.idx.length, 0],
  [skin.idx.length, cloth.idx.length, 1],
]);
bodyGeo.morphAttributes.position = [new THREE.Float32BufferAttribute(merged.tuck, 3)];
bodyGeo.morphTargetsRelative = false;
const bandGeo = toGeometry(band);

const skinMat = new THREE.MeshStandardMaterial({ name: 'Thief_Skin', vertexColors: true, roughness: 0.7, metalness: 0 });
const clothMat = new THREE.MeshStandardMaterial({ name: 'Thief_Cloth', vertexColors: true, roughness: 0.9, metalness: 0 });

const boneObjs = {};
for (const [name, parent, p] of BONES) {
  const b = new THREE.Bone();
  b.name = name;
  const pp = parent ? REST[parent] : V(0, 0, 0);
  b.position.copy(p.clone().sub(pp));
  boneObjs[name] = b;
  if (parent) boneObjs[parent].add(b);
}
const thief = new THREE.Group();
thief.name = 'Thief';
thief.add(boneObjs.root);
thief.updateMatrixWorld(true);
const skeleton = new THREE.Skeleton(BONES.map(([n]) => boneObjs[n]));
const body = new THREE.SkinnedMesh(bodyGeo, [skinMat, clothMat]);
body.name = 'Thief_Body';
body.morphTargetDictionary = { LungiTuck: 0 };
body.morphTargetInfluences = [0];
const headband = new THREE.SkinnedMesh(bandGeo, clothMat);
headband.name = 'Headband';
thief.add(body, headband);
body.bind(skeleton);
headband.bind(skeleton);

const CLIP_SPEEDS = { Walk: 1.5, Run: 4.2, CrouchWalk: 0.9, Sneak: 1.1, Carry: 1.5, Crawl: 0.6 };
thief.userData.sidhel = { version: 1, generator: 'code-generated placeholder (scripts/assets/build-placeholder-thief.mjs) — NOT Blender/artist-made', clipSpeeds: CLIP_SPEEDS };

// ---------------------------------------------------------------- animation
// Pose = { bone: [x, y, z] euler radians (local, rest = 0) }, plus hipsY offset (m) and hipsZ.
// Sign conventions (rest bones are axis-aligned): leg/arm forward = -X, knee bend = +X,
// spine lean forward = +X, left-arm raise sideways = +Z (right arm −Z), head turn left = +Y.
const TAU = Math.PI * 2;
const legExtent = (thighX, kneeX) => THIGH * Math.cos(thighX) + SHIN * Math.cos(thighX + kneeX);
/** Ground contact: drop the hips so the lower foot touches the ground (no floating, no sinking). */
function grounded(pose, lift = 0) {
  const hl = (pose.hips?.[0] ?? 0) * 0; // hips pitch rarely used with legs on the ground
  void hl;
  const l = legExtent(pose.thigh_L?.[0] ?? 0, pose.shin_L?.[0] ?? 0);
  const r = legExtent(pose.thigh_R?.[0] ?? 0, pose.shin_R?.[0] ?? 0);
  pose.hipsY = Math.max(l, r) - (THIGH + SHIN) + lift;
  return pose;
}

function gait({ A, K, kneeBase = 0.08, B, elbow, lean, twist = 0.08, base = 0, armBase = 0, armOut = 0.08, flight = 0, footK = 0.85 }) {
  return (p) => {
    const f = p * TAU;
    const tl = base - A * Math.sin(f);
    const tr = base + A * Math.sin(f);
    const kl = kneeBase + K * Math.max(0, Math.cos(f));
    const kr = kneeBase + K * Math.max(0, Math.cos(f + Math.PI));
    const pose = {
      thigh_L: [tl, 0, 0],
      thigh_R: [tr, 0, 0],
      shin_L: [kl, 0, 0],
      shin_R: [kr, 0, 0],
      foot_L: [-(tl + kl) * footK, 0, 0],
      foot_R: [-(tr + kr) * footK, 0, 0],
      hips: [0, twist * Math.sin(f), 0.03 * Math.sin(f) * (A > 0.5 ? 0.5 : 1)],
      spine: [lean * 0.5, 0, 0],
      chest: [lean * 0.5 + 0.02 * Math.cos(2 * f), -twist * 1.6 * Math.sin(f), 0],
      neck: [-lean * 0.4, 0, 0],
      head: [-lean * 0.4, twist * 0.5 * Math.sin(f), 0],
      upperarm_L: [armBase + B * Math.sin(f), 0, armOut],
      upperarm_R: [armBase - B * Math.sin(f), 0, -armOut],
      forearm_L: [-elbow - 0.15 * Math.max(0, Math.sin(f)), 0, 0],
      forearm_R: [-elbow - 0.15 * Math.max(0, -Math.sin(f)), 0, 0],
      lungi_front: [-0.12 * Math.sin(2 * f - 0.6) * A, 0, 0],
      lungi_back: [0.12 * Math.sin(2 * f - 0.6) * A, 0, 0],
      gamcha_tail: [-0.1 - 0.12 * Math.abs(Math.sin(f - 0.5)) * A, 0, 0.05 * Math.sin(f)],
    };
    return grounded(pose, flight * Math.max(0, Math.sin(2 * f)));
  };
}

const CROUCH_BASE = { thighX: -1.05, kneeX: 1.65 };
const CLIPS = {
  Idle: {
    duration: 3,
    loop: true,
    pose: (p) => {
      const b = Math.sin(p * TAU);
      return grounded({
        spine: [0.03 + 0.01 * b, 0, 0],
        chest: [0.02 * b, 0, 0],
        head: [-0.03, 0.12 * Math.sin(p * TAU + 1), 0],
        upperarm_L: [0.02 * b, 0, 0.1],
        upperarm_R: [-0.02 * b, 0, -0.1],
        forearm_L: [-0.2, 0, 0],
        forearm_R: [-0.25, 0, 0],
        thigh_L: [-0.04, 0, 0.02],
        thigh_R: [0.03, 0, -0.02],
        shin_L: [0.08, 0, 0],
        shin_R: [0.05, 0, 0],
        foot_L: [-0.04, 0, 0],
        foot_R: [-0.06, 0, 0],
        hips: [0, 0, 0.02 * b],
        gamcha_tail: [-0.05 - 0.03 * b, 0, 0],
      });
    },
  },
  Walk: { duration: 1.0, loop: true, pose: gait({ A: 0.45, K: 0.85, B: 0.42, elbow: 0.3, lean: 0.06 }) },
  Run: { duration: 0.6, loop: true, pose: gait({ A: 0.82, K: 1.55, kneeBase: 0.2, B: 0.95, elbow: 1.35, lean: 0.26, twist: 0.12, flight: 0.05 }) },
  CrouchIdle: {
    duration: 2.4,
    loop: true,
    pose: (p) => {
      const b = Math.sin(p * TAU);
      return grounded({
        thigh_L: [CROUCH_BASE.thighX, 0, 0.08],
        thigh_R: [CROUCH_BASE.thighX + 0.1, 0, -0.08],
        shin_L: [CROUCH_BASE.kneeX, 0, 0],
        shin_R: [CROUCH_BASE.kneeX - 0.05, 0, 0],
        foot_L: [-0.55, 0, 0],
        foot_R: [-0.6, 0, 0],
        spine: [0.42, 0, 0],
        chest: [0.1 + 0.02 * b, 0, 0],
        neck: [-0.25, 0, 0],
        head: [-0.25, 0.25 * Math.sin(p * TAU * 0.5), 0],
        upperarm_L: [-0.55, 0, 0.15],
        upperarm_R: [-0.55, 0, -0.15],
        forearm_L: [-1.0, 0, 0],
        forearm_R: [-1.0, 0, 0],
        lungi_front: [-0.25, 0, 0],
      });
    },
  },
  CrouchWalk: {
    duration: 1.2,
    loop: true,
    pose: (p) => {
      const pose = gait({ A: 0.3, K: 0.5, kneeBase: CROUCH_BASE.kneeX - 0.15, base: CROUCH_BASE.thighX + 0.15, B: 0.15, elbow: 1.0, lean: 0.55, armBase: -0.5, footK: 0.55 })(p);
      pose.head = [-0.3, 0, 0];
      pose.lungi_front = [-0.25, 0, 0];
      return pose;
    },
  },
  Sneak: {
    duration: 1.4,
    loop: true,
    pose: (p) => {
      // cartoon tiptoe: high knees, hands held up by the chest
      const pose = gait({ A: 0.45, K: 1.2, kneeBase: 0.25, base: -0.2, B: 0.05, elbow: 1.7, lean: 0.18, armBase: -0.95, armOut: 0.25, footK: 0.4 })(p);
      pose.foot_L[0] += 0.35;
      pose.foot_R[0] += 0.35;
      return grounded(pose, 0.04);
    },
  },
  Crawl: {
    duration: 1.2,
    loop: true,
    pose: (p) => {
      const f = p * TAU;
      return {
        hips: [1.2, 0, 0],
        thigh_L: [-1.2 - 0.25 * Math.sin(f), 0, 0.1],
        thigh_R: [-1.2 + 0.25 * Math.sin(f), 0, -0.1],
        shin_L: [1.55, 0, 0],
        shin_R: [1.55, 0, 0],
        foot_L: [0.3, 0, 0],
        foot_R: [0.3, 0, 0],
        spine: [0.05, 0, 0],
        chest: [0.05, 0.1 * Math.sin(f), 0],
        neck: [-0.7, 0, 0],
        head: [-0.5, 0, 0],
        upperarm_L: [-1.25 + 0.25 * Math.sin(f), 0, 0.12],
        upperarm_R: [-1.25 - 0.25 * Math.sin(f), 0, -0.12],
        forearm_L: [-0.15, 0, 0],
        forearm_R: [-0.15, 0, 0],
        hipsY: 0.47 - HIP_Y + 0.02,
      };
    },
  },
  Pickup: {
    duration: 0.6,
    loop: false,
    pose: (p) => {
      const b = Math.sin(Math.PI * Math.min(1, p * 1.1));
      return grounded({
        thigh_L: [-0.7 * b, 0, 0.05],
        thigh_R: [-0.5 * b, 0, -0.05],
        shin_L: [1.2 * b, 0, 0],
        shin_R: [0.9 * b, 0, 0],
        foot_L: [-0.5 * b, 0, 0],
        foot_R: [-0.4 * b, 0, 0],
        spine: [0.55 * b, 0, 0],
        chest: [0.25 * b, 0.15 * b, 0],
        head: [0.1 * b, 0, 0],
        upperarm_R: [-1.1 * b, 0, -0.05],
        forearm_R: [-0.3 * b, 0, 0],
        upperarm_L: [-0.4 * b, 0, 0.2],
        forearm_L: [-1.2 * b, 0, 0],
      });
    },
  },
  Interact: {
    duration: 0.8,
    loop: true,
    pose: (p) => {
      const c = Math.sin(p * TAU);
      return grounded({
        thigh_L: [-1.3, 0, 0.15],
        thigh_R: [-0.2, 0, -0.1],
        shin_L: [1.6, 0, 0],
        shin_R: [1.9, 0, 0],
        foot_L: [-0.3, 0, 0],
        foot_R: [0.2, 0, 0],
        spine: [0.5 + 0.08 * c, 0, 0],
        chest: [0.2, 0, 0],
        head: [-0.2, 0, 0],
        upperarm_L: [-1.2 + 0.55 * c, 0, 0.1],
        upperarm_R: [-1.2 + 0.55 * c, 0, -0.1],
        forearm_L: [-0.6 - 0.3 * c, 0, 0],
        forearm_R: [-0.6 - 0.3 * c, 0, 0],
      });
    },
  },
  Carry: {
    duration: 1.0,
    loop: true,
    pose: (p) => {
      const pose = gait({ A: 0.4, K: 0.8, B: 0.3, elbow: 0.4, lean: 0.2 })(p);
      pose.upperarm_R = [-2.5, 0, -0.35];
      pose.forearm_R = [-1.9, 0, 0];
      return pose;
    },
  },
  PreparationOil: {
    duration: 1.2,
    loop: true,
    pose: (p) => {
      const c = Math.sin(p * TAU);
      return grounded({
        spine: [0.08, 0, 0],
        head: [0.25, 0.3, 0],
        upperarm_R: [-0.8, 0, 0.55 + 0.12 * c],
        forearm_R: [-1.5 - 0.25 * c, 0, 0],
        upperarm_L: [-0.3, 0, 0.35],
        forearm_L: [-0.5, 0, 0],
        chest: [0, 0.15 * c, 0],
        thigh_L: [-0.05, 0, 0.04],
        thigh_R: [0.04, 0, -0.04],
        shin_L: [0.08, 0, 0],
      });
    },
  },
  PreparationLungi: {
    duration: 1.0,
    loop: true,
    pose: (p) => {
      const c = Math.sin(p * TAU);
      return grounded({
        thigh_L: [-0.35, 0, 0.12],
        thigh_R: [-0.35, 0, -0.12],
        shin_L: [0.6, 0, 0],
        shin_R: [0.6, 0, 0],
        foot_L: [-0.25, 0, 0],
        foot_R: [-0.25, 0, 0],
        spine: [0.35, 0, 0],
        head: [0.3, 0, 0],
        upperarm_L: [-0.55 - 0.2 * c, 0, 0.05],
        upperarm_R: [-0.55 - 0.2 * c, 0, -0.05],
        forearm_L: [-1.2 - 0.3 * c, 0, 0],
        forearm_R: [-1.2 - 0.3 * c, 0, 0],
        lungi_front: [-0.3 - 0.15 * c, 0, 0],
      });
    },
  },
  PreparationGamcha: {
    duration: 1.0,
    loop: true,
    pose: (p) => {
      const c = Math.sin(p * TAU);
      return grounded({
        spine: [-0.04, 0, 0],
        head: [0.12, 0, 0],
        upperarm_L: [-2.2, 0, 0.55 + 0.08 * c],
        upperarm_R: [-2.2, 0, -0.55 - 0.08 * c],
        forearm_L: [-1.7 + 0.2 * c, 0, 0],
        forearm_R: [-1.7 - 0.2 * c, 0, 0],
      });
    },
  },
  Suspicious: {
    duration: 2.4,
    loop: true,
    pose: (p) => {
      const s = Math.sin(p * TAU);
      return grounded({
        thigh_L: [-0.3, 0, 0.1],
        thigh_R: [-0.25, 0, -0.1],
        shin_L: [0.55, 0, 0],
        shin_R: [0.5, 0, 0],
        foot_L: [-0.25, 0, 0],
        foot_R: [-0.25, 0, 0],
        spine: [0.25, 0, 0],
        chest: [0, 0.3 * s, 0],
        head: [-0.15, 0.75 * s, 0],
        upperarm_L: [-0.7, 0, 0.2],
        upperarm_R: [-0.7, 0, -0.2],
        forearm_L: [-1.4, 0, 0],
        forearm_R: [-1.4, 0, 0],
      });
    },
  },
  Frightened: {
    duration: 0.8,
    loop: false,
    pose: (p) => {
      const j = Math.sin(Math.PI * Math.min(1, p * 2)) * (1 - p * 0.4);
      const shake = Math.sin(p * TAU * 6) * 0.06 * (1 - p);
      return grounded(
        {
          spine: [-0.3 * j, 0, 0],
          chest: [-0.1, shake, 0],
          head: [-0.2 * j, shake * 2, 0],
          upperarm_L: [-2.0 * j, 0, 0.6 * j],
          upperarm_R: [-2.0 * j, 0, -0.6 * j],
          forearm_L: [-2.0 * j, 0, 0],
          forearm_R: [-2.0 * j, 0, 0],
          thigh_L: [-0.25 * j, 0, 0.1],
          thigh_R: [-0.1 * j, 0, -0.1],
          shin_L: [0.4 * j, 0, 0],
          shin_R: [0.2 * j, 0, 0],
          lungi_front: [-0.2 * j, 0, 0],
        },
        0.12 * Math.sin(Math.PI * Math.min(1, p * 3)),
      );
    },
  },
  ChaseReaction: {
    duration: 0.6,
    loop: false,
    pose: (p) => {
      const look = Math.sin(Math.PI * Math.min(1, p * 1.6));
      return grounded({
        chest: [0, 0.8 * look, 0],
        head: [0, 0.7 * look, 0],
        spine: [0.1, 0.2 * look, 0],
        upperarm_L: [-1.0 * look, 0, 0.5 * look],
        upperarm_R: [-1.4 * look, 0, -0.6 * look],
        forearm_L: [-1.2 * look, 0, 0],
        forearm_R: [-0.6 * look, 0, 0],
        thigh_L: [-0.3 * look, 0, 0],
        shin_L: [0.5 * look, 0, 0],
      });
    },
  },
  Caught: {
    duration: 1.0,
    loop: true,
    pose: (p) => {
      const f = p * TAU;
      return grounded({
        upperarm_L: [-2.85, 0, 0.25 + 0.15 * Math.sin(f * 2)],
        upperarm_R: [-2.85, 0, -0.25 - 0.15 * Math.sin(f * 2 + 1)],
        forearm_L: [-0.4 - 0.3 * Math.sin(f * 2), 0, 0],
        forearm_R: [-0.4 - 0.3 * Math.sin(f * 2 + 1), 0, 0],
        thigh_L: [-0.45 - 0.35 * Math.sin(f), 0, 0.1],
        thigh_R: [-0.45 + 0.35 * Math.sin(f), 0, -0.1],
        shin_L: [0.8 + 0.3 * Math.sin(f), 0, 0],
        shin_R: [0.8 - 0.3 * Math.sin(f), 0, 0],
        spine: [-0.1, 0, 0],
        head: [0.1, 0.3 * Math.sin(f * 2), 0.08 * Math.sin(f)],
      });
    },
  },
  Celebrate: {
    duration: 1.5,
    loop: false,
    pose: (p) => {
      const up = Math.sin(Math.PI * Math.min(1, p * 1.3));
      const pump = Math.max(0, Math.sin(p * TAU * 2));
      return grounded(
        {
          upperarm_R: [-2.9 * up, 0, -0.15],
          forearm_R: [-0.3 - 0.9 * pump * up, 0, 0],
          upperarm_L: [0.1, 0, 0.75 * up],
          forearm_L: [-1.9 * up, 0, 0],
          spine: [-0.12 * up, 0, 0],
          chest: [-0.05, -0.2 * up, 0],
          head: [-0.25 * up, -0.2 * up, 0],
          thigh_L: [-0.1, 0, 0.06],
          thigh_R: [0.05, 0, -0.06],
        },
        0.05 * pump * up,
      );
    },
  },
};

const FPS = 30;
const quat = new THREE.Quaternion();
const eul = new THREE.Euler();
const clips = [];
const animated = BONES.map(([n]) => n).filter((n) => n !== 'root');
for (const [name, def] of Object.entries(CLIPS)) {
  const frames = Math.max(2, Math.round(def.duration * FPS) + 1);
  const times = [];
  const rot = Object.fromEntries(animated.map((n) => [n, []]));
  const hipsPos = [];
  for (let f = 0; f < frames; f++) {
    const u = f / (frames - 1); // 0..1 inclusive: last frame == first for loops
    times.push(u * def.duration);
    const pose = def.pose(def.loop ? u % 1 : u);
    for (const n of animated) {
      const e = pose[n] ?? [0, 0, 0];
      quat.setFromEuler(eul.set(e[0], e[1], e[2], 'XYZ'));
      rot[n].push(quat.x, quat.y, quat.z, quat.w);
    }
    const hp = boneObjs.hips.position;
    hipsPos.push(hp.x, hp.y + (pose.hipsY ?? 0), hp.z + (pose.hipsZ ?? 0));
  }
  const tracks = animated.map((n) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, rot[n]));
  tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hipsPos));
  clips.push(new THREE.AnimationClip(name, def.duration, tracks));
}

// ---------------------------------------------------------------- export
const scene = new THREE.Scene();
scene.add(thief);
const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(scene, { binary: true, animations: clips, onlyVisible: false });
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.from(glb));
const tris = (bodyGeo.index.count + bandGeo.index.count) / 3;
console.log(`wrote ${OUT}: ${(glb.byteLength / 1024).toFixed(1)} KB, ${tris} triangles, ${merged.pos.length / 3 + band.pos.length / 3} vertices, ${BONES.length} bones, ${clips.length} clips`);
