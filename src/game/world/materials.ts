import {
  CanvasTexture,
  Color,
  MeshLambertMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type ColorRepresentation,
  type Texture,
} from 'three';
import { createRng } from '../../lib/rng';

/**
 * Procedural, hand-painted-style textures drawn on small canvases (zero downloaded assets).
 * Every material is created once and shared; geometry and materials are reused across props.
 * These are prototype assets — see docs/ART_DIRECTION.md for the replacement plan.
 */
export const PALETTE = {
  nightSky: '#152039',
  moonlight: '#a6b9d8',
  clay: '#9c6b49',
  clayDark: '#6e4a33',
  plinth: '#7d5538',
  vegetation: '#456a3d',
  vegetationDark: '#2f4a2c',
  lantern: '#f2ad55',
  straw: '#c49a58',
  strawDark: '#8f6c3a',
  bamboo: '#a8a25e',
  bambooDark: '#6f7a3c',
  wood: '#5a3d28',
  woodDark: '#3b2a1e',
  tin: '#8a979f',
  dirt: '#7a5b3e',
  grass: '#34452b',
  water: '#1d3550',
  plaster: '#c2b08f',
  brick: '#8a4b3a',
  skin: '#8d5a3b',
} as const;

type Painter = (ctx: CanvasRenderingContext2D, size: number) => void;

const textureCache = new Map<string, Texture>();

function makeTexture(key: string, size: number, paint: Painter, repeat: [number, number] = [1, 1]): Texture {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for procedural textures');
  paint(ctx, size);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 2;
  textureCache.set(key, texture);
  return texture;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, seed: number, count: number, colors: string[], maxR: number) {
  const rng = createRng(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rng.pick(colors);
    ctx.globalAlpha = rng.range(0.15, 0.5);
    ctx.beginPath();
    ctx.arc(rng.range(0, size), rng.range(0, size), rng.range(0.5, maxR), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Plastered mud wall: warm base with smeared hand-applied strokes. */
const mudPainter: Painter = (ctx, s) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);
  const rng = createRng(11);
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = rng.next() > 0.5 ? '#e9dccd' : '#d6c3ae';
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = rng.range(2, 6);
    ctx.beginPath();
    const x = rng.range(0, s);
    const y = rng.range(0, s);
    ctx.arc(x, y, rng.range(6, 18), rng.range(0, 3), rng.range(3, 6));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  speckle(ctx, s, 12, 120, ['#c4ad94', '#f4ece3'], 1.6);
};

/** Thatch: dense straw strands with darker bundles. */
const thatchPainter: Painter = (ctx, s) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);
  const rng = createRng(21);
  for (let i = 0; i < 420; i++) {
    const x = rng.range(0, s);
    const y = rng.range(-10, s);
    ctx.strokeStyle = rng.pick(['#f1dfb8', '#d9bf8a', '#b8975f', '#fff4d6']);
    ctx.lineWidth = rng.range(1, 2.4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rng.range(-3, 3), y + rng.range(14, 30));
    ctx.stroke();
  }
  for (let row = 0; row < s; row += s / 6) {
    ctx.fillStyle = 'rgba(90,60,25,0.25)';
    ctx.fillRect(0, row, s, 3);
  }
};

/** Woven bamboo (chatai / bera): alternating over-under strips. */
const weavePainter: Painter = (ctx, s) => {
  const n = 8;
  const cell = s / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const horizontal = (x + y) % 2 === 0;
      ctx.fillStyle = horizontal ? '#f0e2bf' : '#d2bb87';
      ctx.fillRect(x * cell, y * cell, cell, cell);
      ctx.strokeStyle = 'rgba(80,60,30,0.35)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 3; k++) {
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(x * cell, y * cell + (k * cell) / 3);
          ctx.lineTo((x + 1) * cell, y * cell + (k * cell) / 3);
        } else {
          ctx.moveTo(x * cell + (k * cell) / 3, y * cell);
          ctx.lineTo(x * cell + (k * cell) / 3, (y + 1) * cell);
        }
        ctx.stroke();
      }
    }
  }
};

/** Corrugated tin: vertical ridges with rust streaks. */
const tinPainter: Painter = (ctx, s) => {
  const ridges = 16;
  for (let i = 0; i < ridges; i++) {
    const grad = ctx.createLinearGradient((i * s) / ridges, 0, ((i + 1) * s) / ridges, 0);
    grad.addColorStop(0, '#9aa5ab');
    grad.addColorStop(0.5, '#e8eef0');
    grad.addColorStop(1, '#8b969c');
    ctx.fillStyle = grad;
    ctx.fillRect((i * s) / ridges, 0, s / ridges + 1, s);
  }
  const rng = createRng(31);
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = 'rgba(140,70,35,0.35)';
    ctx.fillRect(rng.range(0, s), rng.range(0, s * 0.6), rng.range(2, 5), rng.range(20, 60));
  }
};

/** Check pattern used for the lungi and gamcha. */
function checkPainter(base: string, stripeA: string, stripeB: string): Painter {
  return (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const step = s / 4;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = stripeA;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(i * step, 0, step * 0.28, s);
      ctx.fillRect(0, i * step, s, step * 0.28);
      ctx.fillStyle = stripeB;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(i * step + step * 0.5, 0, step * 0.08, s);
      ctx.fillRect(0, i * step + step * 0.5, s, step * 0.08);
    }
    ctx.globalAlpha = 1;
  };
}

/** Dirt road with ruts and pebbles. */
const dirtPainter: Painter = (ctx, s) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 41, 260, ['#d8c4a8', '#b79d7d', '#efe3d2'], 2.5);
  ctx.strokeStyle = 'rgba(120,95,70,0.35)';
  ctx.lineWidth = 3;
  for (const x of [s * 0.3, s * 0.7]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, s);
    ctx.stroke();
  }
};

/** Grass ground: patchy tufts. */
const grassPainter: Painter = (ctx, s) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 51, 500, ['#c9d6bd', '#e6efdc', '#aebd9f'], 3);
  const rng = createRng(52);
  ctx.strokeStyle = 'rgba(160,185,140,0.6)';
  for (let i = 0; i < 160; i++) {
    const x = rng.range(0, s);
    const y = rng.range(0, s);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rng.range(-2, 2), y - rng.range(3, 7));
    ctx.stroke();
  }
};

type MaterialKey =
  | 'mud'
  | 'mudDark'
  | 'plinth'
  | 'thatch'
  | 'weave'
  | 'tin'
  | 'wood'
  | 'woodDark'
  | 'dirt'
  | 'path'
  | 'grass'
  | 'courtyard'
  | 'plaster'
  | 'brick'
  | 'doorPaint'
  | 'water'
  | 'vertexColor'
  | 'lanternGlow'
  | 'skinOily'
  | 'lungi'
  | 'gamcha'
  | 'gamchaHead'
  | 'clayPot'
  | 'black'
  | 'white'
  | 'iron'
  | 'cloth1'
  | 'cloth2';

const materialCache = new Map<MaterialKey, MeshLambertMaterial | MeshStandardMaterial>();

function lambert(color: ColorRepresentation, map?: Texture): MeshLambertMaterial {
  return new MeshLambertMaterial({ color: new Color(color), map: map ?? null });
}

function build(key: MaterialKey): MeshLambertMaterial | MeshStandardMaterial {
  switch (key) {
    case 'mud':
      return lambert(PALETTE.clay, makeTexture('mud', 128, mudPainter, [2, 1]));
    case 'mudDark':
      return lambert(PALETTE.clayDark, makeTexture('mud', 128, mudPainter, [2, 1]));
    case 'plinth':
      return lambert(PALETTE.plinth, makeTexture('dirt-plinth', 128, dirtPainter, [3, 1]));
    case 'thatch':
      return lambert(PALETTE.straw, makeTexture('thatch', 128, thatchPainter, [3, 2]));
    case 'weave':
      return lambert('#bfa572', makeTexture('weave', 128, weavePainter, [3, 1.5]));
    case 'tin':
      return new MeshStandardMaterial({ color: PALETTE.tin, map: makeTexture('tin', 128, tinPainter, [4, 1]), metalness: 0.55, roughness: 0.45 });
    case 'wood':
      return lambert(PALETTE.wood);
    case 'woodDark':
      return lambert(PALETTE.woodDark);
    case 'dirt':
      return lambert(PALETTE.dirt, makeTexture('dirt', 128, dirtPainter, [1, 10]));
    case 'path':
      return lambert('#6c5138', makeTexture('dirt-path', 128, dirtPainter, [1, 4]));
    case 'grass':
      return lambert(PALETTE.grass, makeTexture('grass', 128, grassPainter, [60, 60]));
    case 'courtyard':
      return lambert('#86664a', makeTexture('courtyard', 128, mudPainter, [3, 3]));
    case 'plaster':
      return lambert(PALETTE.plaster, makeTexture('mud', 128, mudPainter, [2, 1]));
    case 'brick':
      return lambert(PALETTE.brick);
    case 'doorPaint':
      return lambert('#3f6f73');
    case 'water':
      return new MeshStandardMaterial({ color: PALETTE.water, metalness: 0.2, roughness: 0.12 });
    case 'vertexColor': {
      const m = new MeshLambertMaterial({ vertexColors: true });
      return m;
    }
    case 'lanternGlow':
      return new MeshStandardMaterial({ color: '#ffd28a', emissive: PALETTE.lantern, emissiveIntensity: 2.2 });
    case 'skinOily':
      // Cartoon "oiled" shine is purely cosmetic (README §6).
      return new MeshStandardMaterial({ color: PALETTE.skin, roughness: 0.32, metalness: 0.05 });
    case 'lungi':
      return lambert('#ffffff', makeTexture('lungi', 64, checkPainter('#3c4f8a', '#2a7a5a', '#d9c36a'), [3, 2]));
    case 'gamcha':
      return lambert('#ffffff', makeTexture('gamcha', 64, checkPainter('#c23b32', '#f4efe6', '#f4efe6'), [2, 1]));
    case 'gamchaHead':
      return lambert('#ffffff', makeTexture('gamcha-green', 64, checkPainter('#2f7d4b', '#f4efe6', '#f4efe6'), [3, 1]));
    case 'clayPot':
      return lambert('#a8603c');
    case 'black':
      return lambert('#15110e');
    case 'white':
      return lambert('#f6f1e8');
    case 'iron':
      return new MeshStandardMaterial({ color: '#2f5a43', metalness: 0.6, roughness: 0.5 });
    case 'cloth1':
      return lambert('#ffffff', makeTexture('cloth-1', 64, checkPainter('#a45d46', '#e3ba70', '#f6f1e8'), [1, 1]));
    case 'cloth2':
      return lambert('#ffffff', makeTexture('cloth-2', 64, checkPainter('#5b3f8a', '#e7d9f5', '#d9c36a'), [1, 1]));
  }
}

export function mat(key: MaterialKey): MeshLambertMaterial | MeshStandardMaterial {
  let m = materialCache.get(key);
  if (!m) {
    m = build(key);
    materialCache.set(key, m);
  }
  return m;
}

/** Simple Bangla sign painted on a canvas (uses Hind Siliguri when loaded, system Bengali font otherwise). */
export function signTexture(text: string, bg: string, fg: string): Texture {
  return makeTexture(`sign:${text}`, 256, (ctx, s) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = fg;
    ctx.font = `600 ${Math.round(s * 0.2)}px "Hind Siliguri", "Noto Sans Bengali", "Nirmala UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, s / 2, s / 2);
  });
}
