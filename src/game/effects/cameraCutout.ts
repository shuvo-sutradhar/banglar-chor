import { Vector3, type Material } from 'three';

/**
 * Camera cutout (a standard third-person technique): world geometry that sits between the camera
 * and the player — or right in front of the lens — dissolves with a screen-space dither instead of
 * filling the view. Lets the camera keep a comfortable distance indoors (walls/roof are cut away
 * around the line of sight) and removes the "giant pole in front of the camera" frames outdoors.
 *
 * One shared set of uniforms; CameraDirector writes them every frame.
 */
export const CUTOUT = {
  /** Point the cut aims at (the camera's look target, ~chest height). */
  target: { value: new Vector3() },
  /** Cylinder radius around the camera→target line (m); 0 disables the line cut. */
  radius: { value: 0 },
  /** Fraction of the camera→target line the cut covers (stops short of the player). */
  end: { value: 0.8 },
  /** Anything closer than this to the camera fades out (m). */
  near: { value: 0.6 },
};

const VERT_DECL = /* glsl */ `#include <common>
varying vec3 vCutWorld;`;
const VERT_BODY = /* glsl */ `#include <project_vertex>
{
  vec4 cutW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    cutW = instanceMatrix * cutW;
  #endif
  vCutWorld = (modelMatrix * cutW).xyz;
}`;
const FRAG_DECL = /* glsl */ `#include <common>
varying vec3 vCutWorld;
uniform vec3 uCutTarget;
uniform float uCutRadius;
uniform float uCutEnd;
uniform float uCutNear;
float cutNoise(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`;
const FRAG_BODY = /* glsl */ `#include <clipping_planes_fragment>
{
  float cutA = 0.0;
  if (uCutRadius > 0.0) {
    vec3 ab = uCutTarget - cameraPosition;
    float len2 = max(dot(ab, ab), 1e-4);
    float t = dot(vCutWorld - cameraPosition, ab) / len2;
    if (t > 0.0 && t < uCutEnd) {
      float d = distance(vCutWorld, cameraPosition + ab * t);
      float r = uCutRadius * min(1.0, 0.45 + t * 4.0);
      cutA = (1.0 - smoothstep(r * 0.55, r, d)) * (1.0 - smoothstep(uCutEnd - 0.12, uCutEnd, t));
    }
  }
  float nd = distance(vCutWorld, cameraPosition);
  cutA = max(cutA, 1.0 - smoothstep(uCutNear * 0.45, uCutNear, nd));
  if (cutA > 0.001 && cutA >= cutNoise(gl_FragCoord.xy)) discard;
}`;

const patched = new WeakSet<Material>();

/** Patch a built-in lit material (Standard/Lambert/Phong/Basic) to honour the camera cutout. */
export function applyCutout<M extends Material>(material: M): M {
  if (patched.has(material)) return material;
  patched.add(material);
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.uCutTarget = CUTOUT.target;
    shader.uniforms.uCutRadius = CUTOUT.radius;
    shader.uniforms.uCutEnd = CUTOUT.end;
    shader.uniforms.uCutNear = CUTOUT.near;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', VERT_DECL).replace('#include <project_vertex>', VERT_BODY);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', FRAG_DECL).replace('#include <clipping_planes_fragment>', FRAG_BODY);
  };
  const prevKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${prevKey()}|cut1`;
  return material;
}

/** Cinematic cameras (menu orbit, preparation close-up, dawn) frame things deliberately: no cut. */
export function disableCutout(): void {
  CUTOUT.radius.value = 0;
  CUTOUT.near.value = 0;
}

/**
 * Line-cut settings per camera preset. Interiors cut a wide channel through walls and roof so the
 * camera can stay outside the tiny room at a readable distance.
 */
export const CUTOUT_PRESETS = {
  default: { radius: 0.55, near: 0.7, stopShort: 0.9 },
  // Indoors the thief often stands right by a wall: cut almost all the way to him.
  interior: { radius: 1.3, near: 0.7, stopShort: 0.45 },
  close: { radius: 0.35, near: 0.45, stopShort: 0.6 },
} as const;
