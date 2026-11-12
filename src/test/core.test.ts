import { describe, expect, it } from 'vitest';
import { createRng, hashString } from '../lib/rng';
import { dampAngle, wrapAngle } from '../lib/math';
import { canTransition, assertTransition, PHASE_TRANSITIONS, type GamePhase } from '../game/systems/runPhases';
import { cameraRelativeDirection, resolveMovementMode, targetSpeedFor, stepHorizontalVelocity, loadSpeedMultiplier } from '../game/physics/motorMath';
import { normalizeJoystick, adaptiveJoystickRadius } from '../game/controls/joystickMath';
import { InteractionRegistry, type RegisteredTarget } from '../game/systems/InteractionSystem';
import { PLAYER_TUNING } from '../game/data/tuning';
import { resolveQuality } from '../state/settings';

describe('rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    const seqC = Array.from({ length: 5 }, () => c.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) expect(v >= 0 && v < 1).toBe(true);
  });
  it('int stays in inclusive range', () => {
    const r = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = r.int(2, 4);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(4);
    }
  });
  it('hashString is stable', () => {
    expect(hashString('2026-11-12')).toBe(hashString('2026-11-12'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});

describe('angles', () => {
  it('wraps and damps along the shortest arc', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI);
    const next = dampAngle(3.0, -3.0, 10, 0.016);
    // Shortest arc from 3.0 to -3.0 goes up through PI, not down through 0.
    expect(Math.abs(wrapAngle(next - 3.0))).toBeLessThan(0.3);
    expect(next > 3.0 || next < -3.0).toBe(true);
  });
});

describe('run phases', () => {
  it('allows the documented flow and rejects skips', () => {
    expect(canTransition('menu', 'night')).toBe(true);
    expect(canTransition('night', 'bazaar')).toBe(false);
    expect(canTransition('caught', 'bazaar')).toBe(false);
    expect(() => assertTransition('menu', 'results')).toThrow();
  });
  it('every phase can eventually return to menu (no dead ends)', () => {
    const phases = Object.keys(PHASE_TRANSITIONS) as GamePhase[];
    for (const start of phases) {
      const seen = new Set<GamePhase>([start]);
      const queue: GamePhase[] = [start];
      while (queue.length) {
        const p = queue.shift() as GamePhase;
        for (const n of PHASE_TRANSITIONS[p]) if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
      expect(seen.has('menu') || start === 'menu').toBe(true);
    }
  });
});

describe('player motor math', () => {
  const out = { x: 0, z: 0 };
  it('forward input moves away from the camera', () => {
    // yaw 0: camera sits at +Z looking toward -Z
    cameraRelativeDirection(0, 1, 0, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(-1);
    cameraRelativeDirection(1, 0, 0, out);
    expect(out.x).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(0);
    // yaw 90deg: camera at +X, forward is -X
    cameraRelativeDirection(0, 1, Math.PI / 2, out);
    expect(out.x).toBeCloseTo(-1);
  });
  it('resolves modes', () => {
    expect(resolveMovementMode({ inputMagnitude: 0, sprintHeld: true, crouched: false, grounded: true })).toBe('idle');
    expect(resolveMovementMode({ inputMagnitude: 1, sprintHeld: true, crouched: false, grounded: true })).toBe('run');
    expect(resolveMovementMode({ inputMagnitude: 1, sprintHeld: true, crouched: true, grounded: true })).toBe('crouch-walk');
    expect(resolveMovementMode({ inputMagnitude: 1, sprintHeld: false, crouched: false, grounded: false })).toBe('airborne');
  });
  it('speeds are ordered crouch < walk < run and load slows the player', () => {
    expect(targetSpeedFor('crouch-walk', 1)).toBeLessThan(targetSpeedFor('walk', 1));
    expect(targetSpeedFor('walk', 1)).toBeLessThan(targetSpeedFor('run', 1));
    expect(targetSpeedFor('idle', 1)).toBe(0);
    expect(targetSpeedFor('walk', 1, 1)).toBeCloseTo(PLAYER_TUNING.walkSpeed * (1 - PLAYER_TUNING.fullLoadSpeedPenalty));
    expect(loadSpeedMultiplier(5)).toBe(loadSpeedMultiplier(1));
  });
  it('acceleration is bounded per step and converges', () => {
    const v = { x: 0, z: 0 };
    stepHorizontalVelocity(v, { x: 5, z: 0 }, 1 / 60);
    expect(v.x).toBeCloseTo(PLAYER_TUNING.acceleration / 60);
    for (let i = 0; i < 120; i++) stepHorizontalVelocity(v, { x: 5, z: 0 }, 1 / 60);
    expect(v.x).toBeCloseTo(5);
  });
});

describe('joystick', () => {
  it('applies dead zone and clamps to unit length', () => {
    expect(normalizeJoystick(3, 0, 60, 0.12).magnitude).toBe(0);
    const full = normalizeJoystick(0, -200, 60, 0.12);
    expect(full.y).toBeCloseTo(1);
    expect(full.magnitude).toBeCloseTo(1);
    const half = normalizeJoystick(30, 0, 60, 0.1);
    expect(half.x).toBeGreaterThan(0.4);
    expect(half.x).toBeLessThan(0.5);
  });
  it('adapts radius to viewport within limits', () => {
    expect(adaptiveJoystickRadius(320, 568)).toBe(48);
    expect(adaptiveJoystickRadius(3000, 2000)).toBe(78);
  });
});

describe('interaction registry', () => {
  const make = (id: string, x: number, z: number, onInteract = () => {}): RegisteredTarget => ({
    id, kind: 'inspect', labelBn: id, maxDistance: 3, enabled: true, position: { x, y: 1, z }, onInteract,
  });
  const query = { playerPosition: { x: 0, y: 1, z: 0 }, playerForward: { x: 0, z: -1 } };

  it('prefers targets in front and ignores out-of-range ones', () => {
    const r = new InteractionRegistry();
    r.register(make('front', 0, -2.5));
    r.register(make('behind', 0, 2.0));
    r.register(make('far', 0, -10));
    expect(r.findFocus(query)?.id).toBe('front');
  });
  it('rejects duplicate ids and unregisters cleanly', () => {
    const r = new InteractionRegistry();
    const off = r.register(make('a', 0, -1));
    expect(() => r.register(make('a', 0, -1))).toThrow();
    off();
    expect(r.size).toBe(0);
  });
  it('re-validates range and line of sight before interacting', () => {
    const r = new InteractionRegistry();
    let calls = 0;
    r.register(make('a', 0, -2, () => calls++));
    expect(r.interact('a', { ...query, playerPosition: { x: 0, y: 1, z: 20 } })).toBe(false);
    expect(r.interact('a', query)).toBe(true);
    expect(r.findFocus({ ...query, hasLineOfSight: () => false })).toBeNull();
    expect(calls).toBe(1);
  });
});

describe('quality auto', () => {
  it('is conservative on phones', () => {
    expect(resolveQuality('auto', { coarsePointer: true, hardwareConcurrency: 4 })).toBe('low');
    expect(resolveQuality('auto', { coarsePointer: true, hardwareConcurrency: 8 })).toBe('medium');
    expect(resolveQuality('auto', { coarsePointer: false, hardwareConcurrency: 8 })).toBe('high');
    expect(resolveQuality('low', { coarsePointer: false, hardwareConcurrency: 16 })).toBe('low');
  });
});
