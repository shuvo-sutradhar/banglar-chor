import { describe, expect, it } from 'vitest';
import { LOOT, type LootId } from '../game/data/loot';
import { generateHouseLoot, HOUSE_PROFILES } from '../game/data/houses';
import { EntryChallenge } from '../game/systems/entryChallenge';
import { PreparationRitual, PREP_TUNING } from '../game/systems/preparation';
import { canCarry, crossedLoadCue, dropItem, loadRatio, pickupItem, totalWeight, type ItemsState, type WorldItem } from '../game/systems/inventory';
import { computeNightSummary, createRun, escapeOutcome, nightMinutesAt, resolveNight } from '../game/systems/runLogic';
import { hearingStrength, NoiseBus } from '../game/systems/noise';
import { inViewCone, sightSuspicionRate, VILLAGER_SIGHT } from '../game/ai/perception';
import { createBrain, stepBrain, VILLAGER_BRAIN_DEFAULTS, type BrainConfig, type Percepts } from '../game/ai/npcBrain';
import { segmentClear } from '../game/ai/navGraph';
import { RAHIM_FOOTPRINT, VILLAGE_NAV, VILLAGE_OBSTACLES, VILLAGER_ROUTE, inExitZone } from '../game/ai/villageNav';
import { canTransition } from '../game/systems/runPhases';
import { currentObjective } from '../game/systems/objectives';
import { PausableClock } from '../lib/PausableClock';
import { formatKg, formatTaka, toBnDigits } from '../lib/format';

const toWorld = (_h: string, l: [number, number, number]): [number, number, number] => [l[0], l[1], l[2]];
const world = (id: string, lootId: LootId): WorldItem => ({ instanceId: id, lootId, sourceHouseId: 'rahim', position: [0, 0, 0], dropped: false });

describe('loot data', () => {
  it('has unique ids, positive weights and integer values', () => {
    const ids = Object.keys(LOOT);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of Object.values(LOOT)) {
      expect(def.weight).toBeGreaterThan(0);
      expect(Number.isInteger(def.baseValue)).toBe(true);
      expect(def.nameBn.length).toBeGreaterThan(0);
    }
  });
  it('house loot is deterministic per seed, 5–8 items, unique instance ids', () => {
    const a = generateHouseLoot('rahim', 1234);
    expect(a).toEqual(generateHouseLoot('rahim', 1234));
    for (let seed = 0; seed < 200; seed++) {
      const l = generateHouseLoot('rahim', seed);
      expect(l.length).toBeGreaterThanOrEqual(5);
      expect(l.length).toBeLessThanOrEqual(8);
      expect(new Set(l.map((x) => x.instanceId)).size).toBe(l.length);
    }
    const kinds = new Set(Array.from({ length: 200 }, (_, s) => generateHouseLoot('rahim', s).map((x) => x.lootId)).flat());
    expect(kinds.has('actual-jewelry')).toBe(true); // rare but possible
  });
});

describe('inventory', () => {
  const base: ItemsState = { inventory: [], worldItems: [world('a', 'old-radio'), world('b', 'brass-pot'), world('c', 'dentures'), world('d', 'metal-plate')] };
  it('picks an item up exactly once and tracks weight', () => {
    const r = pickupItem(base, 'a');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.worldItems.find((w) => w.instanceId === 'a')).toBeUndefined();
    expect(totalWeight(r.state.inventory)).toBe(3);
    const again = pickupItem(r.state, 'a');
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('duplicate');
    expect(pickupItem(base, 'zzz')).toEqual({ ok: false, reason: 'missing' });
  });
  it('enforces capacity and allows drop + re-pickup', () => {
    let s = base;
    for (const id of ['a', 'b']) {
      const r = pickupItem(s, id);
      if (!r.ok) throw new Error('pickup failed');
      s = r.state;
    }
    expect(totalWeight(s.inventory)).toBe(5);
    expect(canCarry(s.inventory, 'metal-plate')).toBe(false);
    const full = pickupItem(s, 'd');
    expect(full.ok === false && full.reason === 'over-capacity').toBe(true);
    const tiny = pickupItem(s, 'c');
    expect(tiny.ok).toBe(true);
    const dropped = dropItem(s, 'b', [1, 0, 2]);
    expect(dropped.ok).toBe(true);
    if (!dropped.ok) return;
    expect(totalWeight(dropped.state.inventory)).toBe(3);
    expect(dropped.state.worldItems.find((w) => w.instanceId === 'b')?.dropped).toBe(true);
    expect(dropItem(dropped.state, 'b', [0, 0, 0]).ok).toBe(false);
    expect(pickupItem(dropped.state, 'b').ok).toBe(true);
  });
  it('weights sum without float drift and load cues fire on crossing', () => {
    const items = ['fake-jewelry', 'dentures', 'fake-jewelry'].map((l, i) => ({ instanceId: `x${i}`, lootId: l as LootId, sourceHouseId: 'rahim' as const }));
    expect(totalWeight(items)).toBe(0.5);
    expect(loadRatio([{ instanceId: 'r', lootId: 'old-radio', sourceHouseId: 'rahim' }])).toBe(0.5);
    expect(crossedLoadCue(0.5, 0.7)).toBe(0.6);
    expect(crossedLoadCue(0.5, 1)).toBe(1);
    expect(crossedLoadCue(0.7, 0.8)).toBeNull();
    expect(crossedLoadCue(0.9, 0.5)).toBeNull();
  });
});

describe('run outcome and scoring', () => {
  const seedRun = () => {
    let run = createRun(42, '2026-11-12T00:00:00Z', toWorld);
    const r = pickupItem(run, run.worldItems[0]!.instanceId);
    if (!r.ok) throw new Error('x');
    run = { ...run, ...r.state, houseIdsEntered: ['rahim'] };
    return run;
  };
  it('caught confiscates everything and applies the penalty, once', () => {
    const run = seedRun();
    const caught = resolveNight(run, 'caught', 100);
    expect(caught.inventory).toHaveLength(0);
    expect(caught.confiscated).toHaveLength(1);
    expect(caught.caughtCount).toBe(1);
    const twice = resolveNight(caught, 'escaped-with-loot', 101);
    expect(twice).toBe(caught);
    const s = computeNightSummary(caught);
    expect(s.caughtPenalty).toBe(600);
    expect(s.escapedItems).toHaveLength(0);
    expect(s.score).toBe(0);
  });
  it('escape keeps inventory, score is deterministic integer >= 0', () => {
    const run = seedRun();
    expect(escapeOutcome(run)).toBe('escaped-with-loot');
    const esc = resolveNight(run, 'escaped-with-loot', 50);
    const a = computeNightSummary(esc);
    expect(a).toEqual(computeNightSummary(esc));
    expect(esc.inventory).toHaveLength(1);
    expect(a.cleanEscapeBonus).toBe(500);
    expect(a.stealthBonus).toBe(300);
    expect(Number.isInteger(a.score)).toBe(true);
    const detected = computeNightSummary({ ...esc, detections: 5 });
    expect(detected.stealthBonus).toBe(0);
    expect(detected.score).toBeGreaterThanOrEqual(0);
  });
  it('empty escape is a distinct outcome', () => {
    const run = createRun(1, 'x', toWorld);
    expect(escapeOutcome(run)).toBe('escaped-empty');
    expect(computeNightSummary(resolveNight(run, 'escaped-empty', 1)).score).toBe(50);
  });
  it('night clock runs 1:00 → 4:30 and clamps', () => {
    expect(nightMinutesAt(0)).toBe(60);
    expect(nightMinutesAt(360)).toBe(270);
    expect(nightMinutesAt(9999)).toBe(270);
  });
});

describe('entry challenge (skill-based)', () => {
  const cfg = HOUSE_PROFILES.rahim.entry;
  it('perfect timing succeeds with low noise', () => {
    const c = new EntryChallenge(cfg);
    for (let i = 0; i < 10 && c.status === 'running'; i++) c.tap(c.beatTime(i));
    expect(c.status).toBe('success');
    expect(c.noise).toBeLessThan(30);
  });
  it('mashing between beats fails loudly', () => {
    const c = new EntryChallenge(cfg);
    for (let i = 0; i < 10 && c.status === 'running'; i++) c.tap(c.beatTime(i) + cfg.beatInterval / 2);
    expect(c.status).toBe('failed');
    expect(c.noise).toBe(100);
  });
  it('idling lets beats lapse and raises noise; timing windows are exact', () => {
    const c = new EntryChallenge(cfg);
    const lapses = c.advance(cfg.firstBeatDelay + cfg.beatInterval * 3);
    expect(lapses.length).toBe(3);
    expect(c.noise).toBeGreaterThan(0);
    const d = new EntryChallenge(cfg);
    expect(d.tap(d.beatTime(0) + cfg.perfectWindow - 0.001)?.kind).toBe('perfect');
    expect(d.tap(d.beatTime(1) + cfg.goodWindow - 0.001)?.kind).toBe('good');
    expect(d.tap(d.beatTime(2) - cfg.goodWindow - 0.05)?.kind).toBe('miss');
  });
  it('reports failure even when the failing tap yields no judgement', () => {
    const c = new EntryChallenge({ ...cfg, noiseLapse: 60 });
    c.noise = 50;
    // Tap far after beat 0 closed: the skipped beat's lapse noise ends the attempt.
    const ev = c.tap(c.beatTime(0) + cfg.goodWindow + 0.2);
    expect(ev).toBeNull();
    expect(c.status).toBe('failed');
  });
  it('the same tap sequence always gives the same result', () => {
    const run = () => {
      const c = new EntryChallenge(cfg);
      [1.6, 2.7, 3.71, 4.0, 4.8, 5.85].forEach((t) => c.tap(t));
      return [c.progress, c.noise, c.status];
    };
    expect(run()).toEqual(run());
  });
});

describe('preparation ritual', () => {
  it('skilled play completes all three stages in order', () => {
    const p = new PreparationRitual();
    let t = 0;
    p.begin(t);
    for (let i = 0; i < PREP_TUNING.oil.hitsNeeded; i++) {
      t += p.msUntilOilSweetSpot(t) / 1000;
      expect(['hit', 'complete']).toContain(p.tap(t));
    }
    expect(p.stage).toBe('tuck');
    p.holdStartAt(t);
    t += p.idealTuckHoldMs() / 1000;
    expect(p.release(t)).toBe('complete');
    expect(p.stage).toBe('gamcha');
    t += p.msUntilGamchaUp(t) / 1000;
    expect(p.tap(t)).toBe('complete');
    expect(p.stage).toBe('done');
    expect(p.oil).toBe(1);
    expect(p.headband).toBe(true);
  });
  it('never soft-locks: repeated failure auto-completes each stage', () => {
    const p = new PreparationRitual();
    p.begin(0);
    let t = 0;
    for (let i = 0; i < 20 && p.stage === 'oil'; i++) {
      t += 0.37; // arbitrary taps
      p.tap(t + (Math.abs(p.oilMarker(t) - 0.5) < 0.2 ? 0.7 : 0));
    }
    expect(p.stage).toBe('tuck');
    for (let i = 0; i < 10 && p.stage === 'tuck'; i++) {
      p.holdStartAt(t);
      t += 0.1;
      p.release(t);
    }
    expect(p.stage).toBe('gamcha');
    p.holdStartAt(t); // ignored outside tuck
    expect(p.release(t)).toBe('ignored');
  });
  it('over-holding the tuck auto-releases as too tight', () => {
    const p = new PreparationRitual();
    p.stage = 'tuck';
    p.holdStartAt(0);
    expect(p.update(2)).toBe('too-tight');
  });
});

describe('perception', () => {
  const look = { facingX: 0, facingZ: 1, crouched: false, running: false, exposure: 1, lineOfSight: true };
  it('respects FOV, range and line of sight (no seeing through walls)', () => {
    expect(inViewCone({ dx: 0, dz: 5, ...look }, VILLAGER_SIGHT)).toBe(true);
    expect(inViewCone({ dx: 0, dz: -5, ...look }, VILLAGER_SIGHT)).toBe(false);
    expect(inViewCone({ dx: 0, dz: -1, ...look }, VILLAGER_SIGHT)).toBe(true); // bump radius
    expect(sightSuspicionRate({ dx: 0, dz: 5, ...look, lineOfSight: false }, VILLAGER_SIGHT)).toBe(0);
    expect(sightSuspicionRate({ dx: 0, dz: 20, ...look }, VILLAGER_SIGHT)).toBe(0);
  });
  it('crouching lowers detection; rate is capped for fairness', () => {
    const stand = sightSuspicionRate({ dx: 0, dz: 5, ...look }, VILLAGER_SIGHT);
    const crouch = sightSuspicionRate({ dx: 0, dz: 5, ...look, crouched: true }, VILLAGER_SIGHT);
    expect(crouch).toBeLessThan(stand * 0.6);
    const close = sightSuspicionRate({ dx: 0, dz: 0.5, ...look, running: true, exposure: 1.8 }, VILLAGER_SIGHT);
    expect(close).toBeLessThanOrEqual(VILLAGER_SIGHT.maxRate);
  });
  it('hearing falls off and walls muffle', () => {
    expect(hearingStrength(0, 10, false)).toBe(1);
    expect(hearingStrength(5, 10, false)).toBe(0.5);
    expect(hearingStrength(6, 10, true)).toBe(0);
    expect(hearingStrength(11, 10, false)).toBe(0);
  });
  it('noise bus delivers new events once and unsubscribes cleanly', () => {
    const bus = new NoiseBus();
    let heard = 0;
    const off = bus.subscribe(() => heard++);
    bus.emit({ x: 0, y: 0, z: 0, radius: 5, severity: 1, source: 'drop', byPlayer: true }, 0);
    const first = bus.since(0, 0.1);
    expect(first).toHaveLength(1);
    expect(bus.since(first[0]!.id, 0.2)).toHaveLength(0);
    off();
    off();
    bus.emit({ x: 0, y: 0, z: 0, radius: 5, severity: 1, source: 'drop', byPlayer: true }, 0);
    expect(heard).toBe(1);
    expect(bus.listenerCount).toBe(0);
    expect(bus.since(0, 10)).toHaveLength(0); // expired
  });
});

describe('NPC brain FSM', () => {
  const cfg: BrainConfig = { ...VILLAGER_BRAIN_DEFAULTS, route: [{ x: 0, z: 0 }, { x: 10, z: 0 }] };
  const base = (over: Partial<Percepts> = {}): Percepts => ({ npcPos: { x: 0, z: 0 }, sightRate: 0, playerPos: null, distanceToPlayer: 99, heard: null, ...over });
  const seen = (d = 5): Partial<Percepts> => ({ sightRate: 80, playerPos: { x: 0, z: d }, distanceToPlayer: d });
  const run = (b: ReturnType<typeof createBrain>, p: Partial<Percepts>, seconds: number, dt = 1 / 60) => {
    const states = new Set<string>();
    let caught = false;
    for (let t = 0; t < seconds; t += dt) {
      const o = stepBrain(b, base(p), dt, cfg);
      states.add(b.state);
      caught ||= o.caught;
    }
    return { states, caught };
  };

  it('continuous sight escalates through suspicion to an announced chase, never instantly', () => {
    const b = createBrain();
    const early = run(b, seen(), 1.0);
    expect(early.states.has('chasing')).toBe(false);
    expect(early.states.has('alerted')).toBe(false);
    const later = run(b, seen(), 1.2);
    expect(later.states.has('alerted') || b.state === 'chasing').toBe(true);
    run(b, seen(), 0.8);
    expect(b.state).toBe('chasing');
  });
  it('hearing alone investigates but never chases', () => {
    const b = createBrain();
    const r = run(b, { heard: { pos: { x: 3, z: 3 }, strength: 1, severity: 1, alarm: true } }, 3);
    expect(r.states.has('investigating')).toBe(true);
    expect(r.states.has('chasing')).toBe(false);
    expect(b.suspicion).toBeLessThan(100);
  });
  it('suspicion decays and the NPC returns to routine', () => {
    const b = createBrain();
    run(b, seen(), 0.6);
    expect(b.state).toBe('suspicious');
    run(b, {}, 8);
    expect(['returning', 'patrol', 'idle']).toContain(b.state);
  });
  it('a chase ends: lost sight → searching → returning → patrol, with cooldown', () => {
    const b = createBrain();
    run(b, seen(), 3);
    expect(b.state).toBe('chasing');
    const r = run(b, {}, 6.5);
    expect(r.states.has('searching')).toBe(true);
    const after = run(b, { npcPos: { x: 4, z: 6 } }, 9);
    expect(after.states.has('returning')).toBe(true);
    expect(b.state).toBe('returning');
    expect(b.cooldown).toBeGreaterThan(0);
    run(b, { npcPos: cfg.route[0]! }, 0.1);
    expect(['patrol', 'idle']).toContain(b.state);
  });
  it('gives up the chase when the player reaches the safe exit region', () => {
    const b = createBrain();
    run(b, seen(4), 3);
    expect(b.state).toBe('chasing');
    stepBrain(b, base({ ...seen(4), targetSafe: true }), 1 / 60, cfg);
    expect(b.state).toBe('searching');
  });
  it('catches only when chasing, seeing and within reach', () => {
    const b = createBrain();
    expect(run(b, seen(0.8), 0.5).caught).toBe(false); // not chasing yet
    run(b, seen(3), 3);
    expect(run(b, seen(3), 0.2).caught).toBe(false);
    expect(run(b, seen(0.8), 0.1).caught).toBe(true);
  });
  it('never sticks: with no stimulus an NPC always ends up patrolling', () => {
    for (const start of ['suspicious', 'investigating', 'searching', 'returning'] as const) {
      const b = createBrain();
      b.state = start;
      b.lastKnown = { x: 5, z: 5 };
      b.suspicion = 65;
      for (let t = 0; t < 60; t += 1 / 30) {
        const o = stepBrain(b, base({ npcPos: o_pos }), 1 / 30, cfg);
        if (o.target) {
          // move instantly toward target to simulate locomotion
          o_pos = { ...o.target };
        }
      }
      expect(['patrol', 'idle']).toContain(b.state);
    }
  });
});
let o_pos = { x: 0, z: 0 };

describe('village navigation', () => {
  it('patrol route legs are walkable (no obstacles in the way)', () => {
    for (let i = 0; i < VILLAGER_ROUTE.length; i++) {
      const a = VILLAGER_ROUTE[i]!;
      const b = VILLAGER_ROUTE[(i + 1) % VILLAGER_ROUTE.length]!;
      expect(segmentClear(a, b, VILLAGE_OBSTACLES, 0.45), `leg ${i}`).toBe(true);
    }
  });
  it('finds a path around Rahim\'s house from front to back', () => {
    const from = { x: -6, z: 6 };
    const to = { x: -16, z: 6 };
    expect(VILLAGE_NAV.clear(from, to)).toBe(false);
    const path = VILLAGE_NAV.findPath(from, to);
    expect(path.length).toBeGreaterThan(1);
    expect(path[path.length - 1]).toEqual(to);
    let prev = from;
    for (const p of path) {
      expect(VILLAGE_NAV.clear(prev, p)).toBe(true);
      prev = p;
    }
    void RAHIM_FOOTPRINT;
  });
  it('exit zone is the southern entrance only', () => {
    expect(inExitZone({ x: 1, z: 39 })).toBe(true);
    expect(inExitZone({ x: 1, z: 34 })).toBe(false);
  });
});

describe('phase flow for Phase 2', () => {
  it('start goes through preparation; night can reach entry/interior/chase/caught/resolution', () => {
    expect(canTransition('menu', 'night')).toBe(false);
    expect(canTransition('menu', 'preparation')).toBe(true);
    expect(canTransition('preparation', 'night')).toBe(true);
    expect(canTransition('night', 'entry')).toBe(true);
    expect(canTransition('entry', 'interior')).toBe(true);
    expect(canTransition('interior', 'night')).toBe(true);
    expect(canTransition('night', 'chase')).toBe(true);
    expect(canTransition('chase', 'caught')).toBe(true);
    expect(canTransition('caught', 'night-resolution')).toBe(true);
    expect(canTransition('night-resolution', 'preparation')).toBe(true);
    expect(canTransition('caught', 'bazaar')).toBe(false);
  });
  it('objectives always give a next step', () => {
    const base = { phase: 'night' as const, houseEntered: false, holeOpen: false, carrying: 0, inventoryFull: false, dawnWarning: false, rahimAwake: false };
    expect(currentObjective(base)).toContain('রহিম');
    expect(currentObjective({ ...base, houseEntered: true, carrying: 2 })).toContain('সীমানায়');
    expect(currentObjective({ ...base, phase: 'chase' })).toContain('পালাও');
  });
});

describe('input timing fairness', () => {
  it('judges a late-delivered tap by its real timestamp', () => {
    const cfg2 = HOUSE_PROFILES.rahim.entry;
    const c = new EntryChallenge(cfg2);
    // Frame loop advanced 0.25 s past the beat before the (on-time) tap was processed.
    c.advance(c.beatTime(0) + 0.25);
    expect(c.tap(c.beatTime(0) + 0.01)?.kind).toBe('perfect');
  });
  it('clock maps event timestamps to game time', () => {
    let wall = 1000;
    const clk = new PausableClock(() => wall);
    wall = 2000;
    clk.tick();
    expect(clk.at(1900)).toBeCloseTo(clk.now() - 0.1);
    expect(clk.at(undefined)).toBeCloseTo(clk.now());
  });
});

describe('utilities', () => {
  it('formats Bangla digits, taka and kg', () => {
    expect(toBnDigits(1203)).toBe('১২০৩');
    expect(formatTaka(450)).toBe('৳৪৫০');
    expect(formatKg(0.2)).toBe('০.২ কেজি');
    expect(formatKg(2)).toBe('২ কেজি');
  });
  it('pausable clock does not advance while paused', () => {
    let wall = 0;
    const c = new PausableClock(() => wall);
    wall = 100;
    c.tick();
    expect(c.now()).toBeCloseTo(0.1);
    c.setPaused(true);
    wall = 5000;
    c.tick();
    expect(c.now()).toBeCloseTo(0.1);
    c.setPaused(false);
    wall = 5100;
    expect(c.now()).toBeCloseTo(0.2);
  });
});
