import type { MovementMode } from '../../physics/motorMath';
import type { ActionPose } from '../rigTypes';

/** Clip names every character GLB must contain (docs/BLENDER_CHARACTER_SPEC.md §5). */
export const REQUIRED_CLIPS = ['Idle', 'Walk', 'Run'] as const;

/** When a spec clip is missing, the nearest available one is used instead (first match wins). */
export const CLIP_FALLBACKS: Record<string, readonly string[]> = {
  Walk: ['Idle'],
  Run: ['Walk'],
  CrouchIdle: ['Idle'],
  CrouchWalk: ['Sneak', 'Walk'],
  Sneak: ['CrouchWalk', 'Walk'],
  Carry: ['Walk'],
  Crawl: ['CrouchWalk', 'Walk'],
  Interact: ['Pickup', 'Idle'],
  Pickup: ['Interact', 'Idle'],
  PreparationOil: ['Interact', 'Idle'],
  PreparationLungi: ['Interact', 'Idle'],
  PreparationGamcha: ['Celebrate', 'Idle'],
  Suspicious: ['Idle'],
  Frightened: ['ChaseReaction', 'Idle'],
  ChaseReaction: ['Frightened', 'Idle'],
  Caught: ['Frightened', 'Idle'],
  Celebrate: ['Idle'],
};

type ActionClip = { clip: string; loop: boolean };

/** Gameplay action poses → animation clips (one table; the game never names clips elsewhere). */
export const ACTION_CLIPS: Record<ActionPose, ActionClip> = {
  'oil-rub': { clip: 'PreparationOil', loop: true },
  'oil-miss': { clip: 'Frightened', loop: false },
  tuck: { clip: 'PreparationLungi', loop: true },
  'tuck-fail': { clip: 'Frightened', loop: false },
  gamcha: { clip: 'PreparationGamcha', loop: true },
  'gamcha-fail': { clip: 'Frightened', loop: false },
  proud: { clip: 'Celebrate', loop: false },
  dig: { clip: 'Interact', loop: true },
  crawl: { clip: 'Crawl', loop: true },
  pickup: { clip: 'Pickup', loop: false },
  frightened: { clip: 'Frightened', loop: false },
  caught: { clip: 'Caught', loop: true },
  shout: { clip: 'ChaseReaction', loop: false },
  'look-around': { clip: 'Suspicious', loop: true },
  'sit-up': { clip: 'CrouchIdle', loop: true },
  sit: { clip: 'CrouchIdle', loop: true },
  examine: { clip: 'Interact', loop: true },
  wave: { clip: 'Celebrate', loop: false },
};

/** Carried-load ratio from which walking switches to the sack-over-the-shoulder Carry clip. */
export const CARRY_CLIP_THRESHOLD = 0.85;

export type AnimState = { mode: MovementMode; speed: number; action: ActionPose | null; carry: number };
export type ClipChoice = { clip: string; loop: boolean; timeScale: number; fade: number };

/** First available of `name` and its fallbacks (depth-first), else `Idle`. */
export function resolveClip(name: string, available: ReadonlySet<string>, seen: Set<string> = new Set()): string {
  if (available.has(name)) return name;
  seen.add(name);
  for (const alt of CLIP_FALLBACKS[name] ?? []) {
    if (seen.has(alt)) continue;
    const r = resolveClip(alt, available, seen);
    if (available.has(r)) return r;
  }
  return 'Idle';
}

/**
 * Locomotion clips play at actual speed ÷ the clip's authored speed, so feet don't slide
 * (D-011 kept for the GLB path). The clamp avoids frantic or frozen playback at the extremes.
 */
export function syncedTimeScale(speed: number, authored: number | undefined): number {
  if (!authored || authored <= 0) return 1;
  return Math.min(2.2, Math.max(0.35, speed / authored));
}

/** Pure mapping from gameplay state to the clip to play (unit-tested). */
export function chooseClip(s: AnimState, available: ReadonlySet<string>, clipSpeeds: Readonly<Record<string, number>>): ClipChoice {
  if (s.action) {
    const a = ACTION_CLIPS[s.action];
    const clip = resolveClip(a.clip, available);
    const moving = clip === 'Crawl' || clip === 'CrouchWalk' || clip === 'Walk';
    return { clip, loop: a.loop, timeScale: moving && s.action === 'crawl' ? syncedTimeScale(Math.max(s.speed, 0.3), clipSpeeds[clip]) : 1, fade: 0.15 };
  }
  let name: string;
  switch (s.mode) {
    case 'walk':
      name = s.carry >= CARRY_CLIP_THRESHOLD ? 'Carry' : 'Walk';
      break;
    case 'run':
      name = 'Run';
      break;
    case 'crouch-idle':
      name = 'CrouchIdle';
      break;
    case 'crouch-walk':
      name = 'CrouchWalk';
      break;
    case 'airborne':
      name = 'Walk';
      break;
    default:
      name = 'Idle';
  }
  const clip = resolveClip(name, available);
  const moving = s.mode === 'walk' || s.mode === 'run' || s.mode === 'crouch-walk';
  return { clip, loop: true, timeScale: moving ? syncedTimeScale(s.speed, clipSpeeds[clip]) : s.mode === 'airborne' ? 0.4 : 1, fade: 0.2 };
}

/** Phase-preserving switch between two cyclic gaits (walk ↔ run) so the feet don't pop. */
export function isGait(clip: string): boolean {
  return clip === 'Walk' || clip === 'Run' || clip === 'Carry' || clip === 'CrouchWalk' || clip === 'Sneak';
}

export type CharacterMeta = { version: number; clipSpeeds: Record<string, number> };

/** Read `sidhel` metadata from glTF extras (object, or a JSON string as Blender custom props export). */
export function parseMeta(raw: unknown): CharacterMeta | null {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as { version?: unknown; clipSpeeds?: unknown };
  if (!o.clipSpeeds || typeof o.clipSpeeds !== 'object') return null;
  const speeds: Record<string, number> = {};
  for (const [k, n] of Object.entries(o.clipSpeeds as Record<string, unknown>)) if (typeof n === 'number' && n > 0) speeds[k] = n;
  return { version: typeof o.version === 'number' ? o.version : 1, clipSpeeds: speeds };
}

/** A GLB is usable only if it has the locomotion clips (otherwise the procedural rig is used). */
export function missingRequiredClips(available: ReadonlySet<string>): string[] {
  return REQUIRED_CLIPS.filter((c) => !available.has(c));
}
