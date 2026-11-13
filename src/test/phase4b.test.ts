import { describe, expect, it } from 'vitest';
import { busGain, spatialize } from '../game/audio/AudioManager';
import { NIGHT_LAYERS, nextDelay } from '../game/audio/ambienceScapes';
import { estimateDuration, VoiceDirector, VOICE_RULES, type PlayHandle, type VoicePlayer } from '../game/audio/voice';
import { CHARACTER_NAMES, lineText, voiceFile, voiceLine, voiceLineForText, VOICE_LINES } from '../game/audio/voiceLines';
import { buildCatchSequence, CATCH_DURATION, CATCH_SKIP_AFTER } from '../game/audio/catchSequence';
import { EntryChallenge, entryConfigFor } from '../game/systems/entryChallenge';
import { HOUSE_PROFILES } from '../game/data/houses';
import { digClipPhase, DIG_IMPACT } from '../game/characters/glb/clipSelect';
import { Stamina, energyAfterNight, staminaParams } from '../game/systems/stamina';
import { buyEquipment, buySupply, createProfile, eat, equip, equippedMods, nap, nextHeat, settleRun, startNight, type Profile, type RunSettlement } from '../game/systems/progression';
import { EQUIPMENT, EQUIPMENT_BY_ID, ENERGY_RULES, FOODS, STAMINA_RULES } from '../game/data/economy';
import { canCarry, CARRY_CAPACITY_KG, type InventoryItem } from '../game/systems/inventory';
import { createDefaultDocument, migrateV2, PersistenceService, salvageProfile, SAVE_KEY, SAVE_VERSION } from '../state/persistence';
import { DOG_RULES, planNight, stepDog, type DogState } from '../game/systems/villageLife';
import { FOOTSTEP_NOISE, hearingStrength } from '../game/systems/noise';
import { followOrigin } from '../game/controls/joystickMath';
import { assertTransition, canTransition } from '../game/systems/runPhases';

function memoryStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

// ------------------------------------------------------------------ audio
describe('audio mix and spatial model', () => {
  it('bus gains are independent, mute silences everything', () => {
    const levels = { master: 0.5, ambience: 0.2, sfx: 0.9, voice: 1, muted: false };
    expect(busGain(levels, 'ambience')).toBe(0.2);
    expect(busGain(levels, 'voice')).toBe(1);
    expect(busGain(levels, 'ui')).toBe(0.9); // UI follows the SFX level
    expect(busGain({ ...levels, muted: true }, 'voice')).toBe(0);
    expect(busGain({ ...levels, muted: true }, 'master')).toBe(0);
  });
  it('world sounds fade with distance, pan to the correct side, and dull with distance', () => {
    const l = { x: 0, z: 0, yaw: 0 }; // camera looks toward −z, right is +x
    const near = spatialize(l, { x: 1, z: 0 });
    const far = spatialize(l, { x: 20, z: 0 });
    expect(near.gain).toBeGreaterThan(far.gain);
    expect(spatialize(l, { x: 40, z: 0 }).gain).toBe(0);
    expect(spatialize(l, { x: 6, z: 0 }).pan).toBeGreaterThan(0.5);
    expect(spatialize(l, { x: -6, z: 0 }).pan).toBeLessThan(-0.5);
    expect(Math.abs(spatialize(l, { x: 0, z: -6 }).pan)).toBeLessThan(0.05); // straight ahead
    // Turning the camera 180° swaps the sides.
    expect(spatialize({ ...l, yaw: Math.PI }, { x: 6, z: 0 }).pan).toBeLessThan(-0.5);
    expect(far.cutoff).toBeLessThan(near.cutoff);
  });
  it('ambience layers are sparse and bounded (never fire every frame)', () => {
    for (const layer of NIGHT_LAYERS) {
      expect(nextDelay(layer, 0)).toBeGreaterThanOrEqual(Math.min(layer.min, 0.2));
      expect(nextDelay(layer, 1)).toBeLessThanOrEqual(layer.max + 1e-9);
      expect(nextDelay(layer, 0.5)).toBeGreaterThan(0.2);
    }
    // Distant dogs and owls are rare, crickets frequent: layered, not one flat loop.
    const dog = NIGHT_LAYERS.find((l) => l.id === 'dog-far')!;
    const cricket = NIGHT_LAYERS.find((l) => l.id === 'cricket-near')!;
    expect(dog.min).toBeGreaterThan(cricket.max * 10);
  });
});

// ------------------------------------------------------------------ voice
function fakePlayer(durations: Record<string, number> = {}) {
  const started: string[] = [];
  const stopped: string[] = [];
  const player: VoicePlayer = {
    start(line): PlayHandle {
      started.push(line.id);
      const d = durations[line.id];
      return { duration: d ?? 1, voiced: d !== undefined, stop: () => stopped.push(line.id) };
    },
  };
  return { player, started, stopped };
}

function fakeSubs() {
  let id = 0;
  const shown: { id: number; text: string; speaker: string; ms: number }[] = [];
  const cleared: number[] = [];
  return { sink: { show: (text: string, speaker: string, ms: number) => (shown.push({ id: ++id, text, speaker, ms }), id), clear: (i: number) => cleared.push(i) }, shown, cleared };
}

describe('voice line manifest', () => {
  it('has the brief\'s Bengali lines with character, emotion, priority, cooldown and a file path', () => {
    for (const t of ['আইজকা দেখি কপালে কী আছে!', 'ও মারে! ও বাবারে!', 'আর করমু না!', 'চোর! চোর!', 'ধর ধর, পালাইতেছে!', 'ওই ব্যাডা কই যায়!', 'এই মাল কই পাইছেন?', 'দাম আরেকটু কমান!', 'এইডা তো চেনা চেনা লাগে!']) {
      const l = voiceLineForText(t);
      expect(l, t).toBeTruthy();
      expect(l!.cooldown).toBeGreaterThan(0);
      expect(CHARACTER_NAMES[l!.character]).toBeTruthy();
      expect(voiceFile(l!)).toMatch(new RegExp(`^assets/audio/voice/${l!.character}/${l!.id.replace(/\./g, '\\.')}\\.ogg$`));
    }
    const ids = new Set(VOICE_LINES.map((l) => l.id));
    expect(ids.size).toBe(VOICE_LINES.length);
    expect(VOICE_LINES.length).toBeGreaterThan(80);
  });
  it('rough lines exist only as alternatives; family text is the default', () => {
    const l = voiceLine('villager.catch.a')!;
    expect(l.roughText).toBeTruthy();
    expect(lineText(l, false)).toBe(l.text);
    expect(lineText(l, true)).toBe(l.roughText);
    expect(lineText(voiceLine('villager.chor')!, true)).toBe('চোর! চোর!');
  });
});

describe('VoiceDirector', () => {
  const setup = (durations?: Record<string, number>) => {
    let t = 0;
    const p = fakePlayer(durations);
    const s = fakeSubs();
    const d = new VoiceDirector(p.player, s.sink, () => t);
    return { d, p, s, at: (v: number) => (t = v) };
  };
  it('shows the subtitle when playback starts, for exactly the playback duration', () => {
    const { d, s, at } = setup({ 'villager.chor': 2.4 });
    at(10);
    expect(d.speak('villager.chor')).toBe('played');
    expect(s.shown).toHaveLength(1);
    expect(s.shown[0]!.text).toBe('চোর! চোর!');
    expect(s.shown[0]!.ms).toBeCloseTo(2400 + 250);
    expect(d.log.at(-1)!.voiced).toBe(true);
  });
  it('never overlaps: equal priority waits in the queue, then plays after the gap', () => {
    const { d, p, at } = setup({ 'mojnu.alarm.0': 1, 'villager.dhor': 1 });
    at(0);
    d.speak('mojnu.alarm.0');
    expect(d.speak('villager.dhor')).toBe('queued');
    expect(p.started).toEqual(['mojnu.alarm.0']);
    at(1.0);
    d.update(); // first ends
    at(1.0 + VOICE_RULES.gap + 0.01);
    d.update();
    expect(p.started).toEqual(['mojnu.alarm.0', 'villager.dhor']);
  });
  it('a higher-priority line interrupts (stops audio, clears its subtitle); flavour lines are dropped when busy', () => {
    const { d, p, s, at } = setup();
    at(0);
    d.speak('rahim.snore.0'); // priority 0
    expect(d.speak('mojnu.alarm.0')).toBe('played'); // priority 3
    expect(p.stopped).toEqual(['rahim.snore.0']);
    expect(s.cleared).toEqual([1]);
    expect(d.speak('merchant-hashem.call.0')).toBe('busy'); // priority 0 while busy
  });
  it('respects per-line cooldowns', () => {
    const { d, at } = setup();
    at(0);
    expect(d.speak('thief.night.start')).toBe('played');
    at(2);
    d.update();
    expect(d.speak('thief.night.start')).toBe('cooldown');
    at(10);
    d.update();
    expect(d.speak('thief.night.start')).toBe('played');
  });
  it('queued lines expire instead of playing out of context', () => {
    const { d, p, at } = setup({ 'mojnu.alarm.0': 6 });
    at(0);
    d.speak('mojnu.alarm.0');
    d.speak('villager.dhor');
    at(6.5);
    d.update();
    expect(p.started).toEqual(['mojnu.alarm.0']);
  });
  it('uses the rough variant only when enabled; stopAll silences crowd voices too', () => {
    const { d, p, s, at } = setup();
    at(0);
    d.rough = true;
    d.speak('villager.catch.a');
    expect(s.shown[0]!.text).toBe(voiceLine('villager.catch.a')!.roughText);
    d.crowd('villager.chor');
    d.stopAll();
    expect(p.stopped).toEqual(expect.arrayContaining(['villager.catch.a', 'villager.chor']));
    expect(d.current).toBeNull();
  });
  it('text-only lines get a reading-time duration (no fake voice)', () => {
    expect(estimateDuration('চোর!')).toBeGreaterThanOrEqual(1.3);
    expect(estimateDuration('এ'.repeat(200))).toBeLessThanOrEqual(5.5);
    const { d, at } = setup();
    at(0);
    d.speak('thief.night.start');
    expect(d.log.at(-1)!.voiced).toBe(false);
  });
});

describe('cartoon catch sequence', () => {
  const ctx = { zone: 'village' as const, caughtBy: 'mojnu' as const, dawn: false, rough: false, confiscated: ['chicken' as const], seed: 3 };
  it('is ordered, ends before the scene does, and has the comic beats (no injury sounds)', () => {
    const cues = buildCatchSequence(ctx);
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.at).toBeGreaterThanOrEqual(cues[i - 1]!.at);
    expect(cues.at(-1)!.at).toBeLessThan(CATCH_DURATION);
    const sounds = cues.flatMap((c) => (c.kind === 'sfx' ? [c.sound] : []));
    for (const s of ['slide-whistle', 'dust-poof', 'boing', 'run-steps', 'wah-wah'] as const) expect(sounds).toContain(s);
    expect(CATCH_SKIP_AFTER).toBeLessThan(2);
  });
  it('syncs with the vignette: dust at 0 s and 2.6 s, crowd running in from 0.6 s, the thief\'s cry with the pant', () => {
    const cues = buildCatchSequence(ctx);
    const at = (s: string) => cues.filter((c) => c.kind === 'sfx' && c.sound === s).map((c) => c.at);
    expect(at('dust-poof')).toEqual([0.05, 2.6]);
    expect(at('run-steps')[0]).toBe(0.6);
    const cry = cues.find((c) => c.kind === 'line' && c.lineId === 'thief.caught.full')!;
    expect(Math.abs(cry.at - at('pant')[0]!)).toBeLessThan(0.2);
    // The punchline follows what was confiscated, and every line id exists in the manifest.
    expect(cues.some((c) => c.kind === 'line' && c.lineId === 'villager.punch.chicken')).toBe(true);
    for (const c of cues) if (c.kind === 'line') expect(voiceLine(c.lineId), c.lineId).toBeTruthy();
  });
  it('family vs rough crowd lines', () => {
    const fam = buildCatchSequence(ctx).find((c) => c.kind === 'line' && c.lineId === 'villager.catch.a');
    const rough = buildCatchSequence({ ...ctx, rough: true }).find((c) => c.kind === 'line' && c.lineId === 'villager.catch.a');
    expect(fam && 'text' in fam && fam.text).toBe(voiceLine('villager.catch.a')!.text);
    expect(rough && 'text' in rough && rough.text).toBe(voiceLine('villager.catch.a')!.roughText);
  });
});

// ------------------------------------------------------------------ tool challenge
describe('fictional digging tool challenge', () => {
  const base = HOUSE_PROFILES.rahim.entry;
  const perfectRun = (cfg = base, power = 1) => {
    const c = new EntryChallenge(cfg);
    let taps = 0;
    for (let i = 0; i < 40 && c.status === 'running'; i++) {
      c.advance(c.beatTime(i) - c.time);
      c.tap(c.beatTime(i), power);
      taps++;
    }
    return { c, taps };
  };
  it('equipment scales progress and noise from data; faster tools need fewer swings', () => {
    const kodal = entryConfigFor(base, EQUIPMENT_BY_ID['tin-kodal'].mods);
    expect(kodal.progressPerfect).toBeCloseTo(base.progressPerfect * 1.35);
    expect(kodal.noiseMiss).toBeCloseTo(base.noiseMiss * 1.2);
    expect(perfectRun(kodal).taps).toBeLessThan(perfectRun(base).taps);
    expect(perfectRun(base).c.status).toBe('success');
  });
  it('a tired swing digs less (power) — more swings needed', () => {
    expect(perfectRun(base, 0.5).taps).toBeGreaterThan(perfectRun(base, 1).taps);
  });
  it('resting pauses the beats (no lapses), noise settles, and the next beat comes a full interval after resuming', () => {
    const c = new EntryChallenge(base);
    c.advance(base.firstBeatDelay + 0.05);
    c.tap(c.time - 0.05 + 0.0); // near the first beat
    c.tap(c.time + 0.3); // a miss: adds noise
    const noise = c.noise;
    c.setResting(true);
    expect(c.advance(10)).toEqual([]); // 10 s of rest: nothing lapses
    expect(c.noise).toBeLessThan(noise);
    expect(c.tap(c.time)).toBeNull(); // taps ignored while resting
    c.setResting(false);
    expect(c.timeToNextBeat()).toBeGreaterThanOrEqual(base.beatInterval - 1e-9);
    expect(c.status).toBe('running');
  });
  it('the sharp-eyes food effect widens the timing windows', () => {
    const cfg = entryConfigFor(base, {}, true);
    expect(cfg.goodWindow).toBeCloseTo(base.goodWindow * 1.15);
  });
  it('the Dig swing is phase-locked: the strike frame lands on the beat', () => {
    expect(digClipPhase(0, 1.05)).toBeCloseTo(DIG_IMPACT);
    expect(digClipPhase(1.05 / 2, 1.05)).toBeCloseTo(DIG_IMPACT - 0.5);
    expect(digClipPhase(1.05 * 0.8, 1.05)).toBeCloseTo(DIG_IMPACT - 0.8 + 1);
    for (const s of [0, 0.3, 0.9, 2.2]) {
      const p = digClipPhase(s, 1.05);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });
  it('NPCs hear a heavy tool\'s mistakes further away; the quiet tool is quieter (detection with equipped tools)', () => {
    const heavy = entryConfigFor(base, EQUIPMENT_BY_ID['iron-shabol'].mods);
    const quiet = entryConfigFor(base, EQUIPMENT_BY_ID['soft-khurpi'].mods);
    // The overlay scales the miss noise radius (5 m) by the tool's noise factor.
    const radius = (cfg: typeof base) => 5 * (cfg.noiseHit / base.noiseHit);
    const at = 4.5; // a listener 4.5 m from the wall
    expect(hearingStrength(at, radius(heavy), false)).toBeGreaterThan(hearingStrength(at, radius(base), false));
    expect(hearingStrength(at, radius(quiet), false)).toBe(0);
    // Same sloppy play fails sooner with the heavy tool.
    const sloppy = (cfg: typeof base) => {
      const c = new EntryChallenge(cfg);
      let n = 0;
      while (c.status === 'running' && n < 100) {
        c.advance(0.2);
        c.tap(c.time + 0.001 + cfg.beatInterval / 2 - 0.2);
        n++;
      }
      return n;
    };
    expect(sloppy(heavy)).toBeLessThan(sloppy(quiet));
  });
});

// ------------------------------------------------------------------ stamina & energy
describe('stamina and energy', () => {
  it('low energy shrinks stamina and slows recovery, but never to zero (no automatic fail)', () => {
    const full = staminaParams(100);
    const empty = staminaParams(0);
    expect(empty.max).toBeCloseTo(full.max * STAMINA_RULES.minMaxFrac);
    expect(empty.max).toBeGreaterThan(0);
    expect(empty.regenPerSec).toBeLessThan(full.regenPerSec);
    expect(empty.regenPerSec).toBeGreaterThan(0);
    expect(staminaParams(100, {}, 'big-lungs').max).toBe(full.max + 20);
    expect(staminaParams(100, {}, 'second-wind').regenPerSec).toBeCloseTo(full.regenPerSec * 1.2);
  });
  it('sprinting drains (more with load), locks when empty, and unlocks after recovering', () => {
    const s = new Stamina(staminaParams(100));
    const t = new Stamina(staminaParams(100));
    s.step(1, true, 0);
    t.step(1, true, 1);
    expect(t.value).toBeLessThan(s.value);
    let dry = false;
    for (let i = 0; i < 200 && !dry; i++) dry = s.step(0.05, true);
    expect(dry).toBe(true);
    expect(s.canSprint).toBe(false);
    s.step(0.5, false); // within the regen delay
    expect(s.value).toBe(0);
    for (let i = 0; i < 60; i++) s.step(0.1, false);
    expect(s.canSprint).toBe(true);
    expect(s.sprintSeconds).toBeGreaterThan(5);
  });
  it('the rubber sandals make sprinting cheaper; a dig costs more with a heavy tool', () => {
    expect(staminaParams(100, EQUIPMENT_BY_ID['rubber-chot'].mods).sprintDrainPerSec).toBeCloseTo(STAMINA_RULES.sprintDrainPerSec * 0.75);
    expect(staminaParams(100, EQUIPMENT_BY_ID['iron-shabol'].mods).digCost).toBeGreaterThan(staminaParams(100).digCost);
  });
  it('spend returns a weaker swing when there is not enough stamina', () => {
    const s = new Stamina(staminaParams(0));
    s.value = 3;
    expect(s.spend(6)).toBeCloseTo(0.75);
    expect(s.exhausted).toBe(true);
  });
  it('energy after a night reflects exertion and never goes below the floor', () => {
    expect(energyAfterNight(80, 0, 0)).toBe(80 - ENERGY_RULES.nightBase);
    expect(energyAfterNight(80, 60, 20)).toBeLessThan(energyAfterNight(80, 10, 5));
    expect(energyAfterNight(5, 600, 100)).toBe(ENERGY_RULES.floor);
    expect(energyAfterNight(50, 0, 0, 15)).toBe(50 - ENERGY_RULES.nightBase + 15);
  });
});

// ------------------------------------------------------------------ economy
const rich = (bank = 5000): Profile => ({ ...createProfile(), bank });

describe('food and recovery', () => {
  it('restores energy, costs money, and sets the next-night effect', () => {
    const r = eat(rich(500), 'bhat-mach-dal', 't1');
    expect(r.ok).toBe(true);
    expect(r.profile.bank).toBe(500 - 120);
    expect(r.profile.spentFood).toBe(120);
    expect(r.profile.energy).toBe(Math.min(100, ENERGY_RULES.start + 65));
    expect(r.profile.buff).toBe('big-lungs');
  });
  it('basic recovery never needs money: free meal + nap, each once per day', () => {
    let p: Profile = { ...createProfile(), energy: 20, bank: 0 };
    let r = eat(p, 'panta-bhat', 'a');
    expect(r.ok).toBe(true);
    p = r.profile;
    expect(p.energy).toBe(38);
    expect(eat(p, 'panta-bhat', 'b').ok).toBe(false);
    expect((eat(p, 'panta-bhat', 'b') as { reason: string }).reason).toBe('daily-limit');
    r = nap(p, 'c');
    expect(r.ok).toBe(true);
    expect(r.profile.energy).toBe(58);
    expect((nap(r.profile, 'd') as { reason: string }).reason).toBe('daily-limit');
    // A new day (next night started) allows them again.
    const next = startNight(r.profile).profile;
    expect(eat(next, 'panta-bhat', 'e').ok).toBe(true);
    expect(nap(next, 'f').ok).toBe(true);
  });
  it('insufficient funds: nothing changes', () => {
    const p = rich(10);
    for (const r of [eat(p, 'muri-kola', 'x'), buyEquipment(p, 'tin-kodal', 'y'), buySupply(p, 'gur-chira', 'z')]) {
      expect(r.ok).toBe(false);
      expect((r as { reason: string }).reason).toBe('funds');
      expect(r.profile).toBe(p);
    }
  });
  it('every food has a cost, energy and a reaction line; values are illustrative game values', () => {
    for (const f of FOODS) {
      expect(f.cost).toBeGreaterThanOrEqual(0);
      expect(f.energy).toBeGreaterThan(0);
      expect(voiceLine(f.reactionLine), f.id).toBeTruthy();
    }
    expect(FOODS.some((f) => f.cost === 0)).toBe(true);
  });
});

describe('equipment purchases and upgrades', () => {
  it('buying equips the item, charges once, and records the spend', () => {
    const r = buyEquipment(rich(1000), 'tin-kodal', 'buy-1');
    expect(r.ok).toBe(true);
    expect(r.profile.bank).toBe(100);
    expect(r.profile.owned).toContain('tin-kodal');
    expect(r.profile.equipped.tool).toBe('tin-kodal');
    expect(r.profile.spentUpgrades).toBe(900);
    expect((buyEquipment(r.profile, 'tin-kodal', 'buy-2') as { reason: string }).reason).toBe('owned');
  });
  it('a duplicated transaction (double tap / re-dispatch) is applied exactly once', () => {
    const once = buyEquipment(rich(5000), 'iron-shabol', 'tx-same');
    const twice = buySupply(once.profile, 'gur-chira', 'tx-same');
    expect((twice as { reason: string }).reason).toBe('duplicate');
    expect(twice.profile.bank).toBe(5000 - 1800);
    const a = eat(rich(500), 'muri-kola', 'meal-1');
    const b = eat(a.profile, 'muri-kola', 'meal-1');
    expect(b.ok).toBe(false);
    expect(b.profile.bank).toBe(470);
  });
  it('equip only what you own; switching back is free', () => {
    const p = rich(0);
    expect((equip(p, 'tin-kodal') as { reason: string }).reason).toBe('not-owned');
    const owned = buyEquipment(rich(2000), 'tin-kodal', 't').profile;
    const back = equip(owned, 'bamboo-khunti');
    expect(back.ok && back.profile.equipped.tool).toBe('bamboo-khunti');
    expect(back.profile.bank).toBe(owned.bank);
  });
  it('modifiers combine across slots; the bag changes what fits in it', () => {
    let p = rich(5000);
    p = buyEquipment(p, 'pat-bosta', 'a').profile;
    p = buyEquipment(p, 'cloth-feet', 'b').profile;
    const m = equippedMods(p);
    expect(m.carryKg).toBe(3);
    expect(m.footstepNoise).toBeCloseTo(0.7);
    expect(m.runSpeed).toBeCloseTo(0.94);
    const heavyLoad: InventoryItem[] = [
      { instanceId: 'a', lootId: 'old-radio', sourceHouseId: 'rahim' },
      { instanceId: 'b', lootId: 'brass-pot', sourceHouseId: 'rahim' },
    ];
    expect(canCarry(heavyLoad, 'chicken', CARRY_CAPACITY_KG)).toBe(false); // 3 + 2 + 2 > 6
    expect(canCarry(heavyLoad, 'chicken', CARRY_CAPACITY_KG + m.carryKg)).toBe(true);
  });
  it('no upgrade is strictly better: every non-starter item has a stated trade-off or a cost-only gain', () => {
    for (const e of EQUIPMENT.filter((x) => !x.starter)) {
      expect(e.cost).toBeGreaterThan(0);
      expect(e.tradeoffBn).not.toBe('—');
    }
    // The most expensive tool is the loudest and the most tiring.
    const tools = EQUIPMENT.filter((e) => e.slot === 'tool');
    const priciest = tools.reduce((a, b) => (b.cost > a.cost ? b : a));
    expect(priciest.mods.entryNoise).toBe(Math.max(...tools.map((t) => t.mods.entryNoise ?? 1)));
    expect(priciest.mods.entryStamina).toBe(Math.max(...tools.map((t) => t.mods.entryStamina ?? 1)));
  });
});

describe('money persistence and settlement', () => {
  const settlement = (over: Partial<RunSettlement> = {}): RunSettlement => ({ runId: 'run-1', money: 1450, energyEnd: 52, suppliesLeft: { 'gur-chira': 1 }, detections: 1, chases: 0, caught: false, robbed: true, ...over });
  it('banks a run exactly once (reload / double results cannot duplicate money)', () => {
    const a = settleRun(createProfile(), settlement());
    expect(a.ok).toBe(true);
    expect(a.profile.bank).toBe(1450);
    expect(a.profile.lifetimeEarned).toBe(1450);
    expect(a.profile.energy).toBe(52);
    const b = settleRun(a.profile, settlement());
    expect(b.ok).toBe(false);
    expect(b.profile.bank).toBe(1450);
  });
  it('saves and loads the profile (bank, owned items, energy) through versioned storage', () => {
    const storage = memoryStorage();
    const svc = new PersistenceService(storage);
    let profile = settleRun(createProfile(), settlement()).profile;
    profile = buyEquipment(profile, 'cloth-feet', 't').profile;
    expect(svc.save({ ...createDefaultDocument(), profile })).toBe(true);
    const loaded = new PersistenceService(storage).load();
    expect(loaded.notice).toBe('none');
    expect(loaded.document.version).toBe(SAVE_VERSION);
    expect(loaded.document.profile.bank).toBe(950);
    expect(loaded.document.profile.equipped.footwear).toBe('cloth-feet');
  });
  it('village memory: heat rises with what villagers saw and fades by half each night (capped)', () => {
    expect(nextHeat(0, { detections: 0, chases: 0, caught: false, robbed: false })).toBe(0);
    expect(nextHeat(40, { detections: 0, chases: 0, caught: false, robbed: false })).toBe(20);
    expect(nextHeat(90, { detections: 5, chases: 3, caught: true, robbed: true })).toBe(100);
  });
});

describe('save migrations', () => {
  it('v2 (Phase 3) → v3 keeps settings, nickname and run history; money starts at 0', () => {
    const run = { id: 'r1', seed: 1, endedAtIso: '2026-01-01T00:00:00Z', nickname: 'ক', outcome: 'completed', score: 900, money: 1200, collected: 3, sold: 2, lost: 0, detections: 0, caught: false, line: 'x' };
    const v2 = JSON.stringify({ version: 2, settings: { ...createDefaultDocument().settings, quality: 'high' }, preparationDone: true, nickname: 'বাবলু', runs: [run] });
    const loaded = new PersistenceService(memoryStorage({ [SAVE_KEY]: v2 })).load();
    expect(loaded.notice).toBe('none');
    expect(loaded.document.version).toBe(3);
    expect(loaded.document.settings.quality).toBe('high');
    expect(loaded.document.runs).toHaveLength(1);
    expect(loaded.document.profile).toEqual(createProfile());
    // New settings fields got defaults.
    expect(loaded.document.settings.voiceVolume).toBe(1);
    expect(migrateV2({ version: 2 }).version).toBe(3);
  });
  it('a damaged profile keeps every valid field and never equips an unowned item', () => {
    const damaged = { ...createProfile(), bank: 777, energy: 'lots', owned: ['bamboo-khunti', 'gamcha-jhola', 'barefoot'], equipped: { tool: 'iron-shabol', bag: 'gamcha-jhola', footwear: 'barefoot' } };
    const p = salvageProfile(damaged);
    expect(p.bank).toBe(777);
    expect(p.energy).toBe(createProfile().energy);
    expect(p.equipped.tool).toBe('bamboo-khunti');
    const raw = JSON.stringify({ ...createDefaultDocument(), profile: damaged });
    const loaded = new PersistenceService(memoryStorage({ [SAVE_KEY]: raw })).load();
    expect(loaded.notice).toBe('corrupt-reset');
    expect(loaded.document.profile.bank).toBe(777);
  });
});

describe('replay with retained upgrades (multi-night lifecycle, pure)', () => {
  it('night → bazaar money → safehouse purchases → next night uses them; buffs last one night', () => {
    let p = createProfile();
    let n = startNight(p);
    expect(n.loadout.day).toBe(1);
    p = settleRun(n.profile, { runId: 'n1', money: 2100, energyEnd: 60, suppliesLeft: { 'gur-chira': 0 }, detections: 0, chases: 0, caught: false, robbed: true }).profile;
    p = buyEquipment(p, 'tin-kodal', 'a').profile;
    p = eat(p, 'bhat-dal-dim', 'b').profile;
    p = buySupply(p, 'gur-chira', 'c').profile;
    n = startNight(p);
    expect(n.loadout.day).toBe(2);
    expect(n.loadout.mods.entryProgress).toBeCloseTo(1.35);
    expect(n.loadout.buff).toBe('second-wind');
    expect(n.loadout.supplies['gur-chira']).toBe(1);
    expect(n.profile.buff).toBeNull(); // consumed
    expect(startNight(n.profile).loadout.mods.entryProgress).toBeCloseTo(1.35); // equipment stays
    expect(startNight(n.profile).loadout.buff).toBeNull();
  });
  it('phase graph: results → safehouse → preparation (next night), menu → safehouse (continue)', () => {
    expect(canTransition('results', 'safehouse')).toBe(true);
    expect(canTransition('safehouse', 'preparation')).toBe(true);
    expect(canTransition('menu', 'safehouse')).toBe(true);
    expect(() => assertTransition('safehouse', 'night')).toThrow();
  });
});

// ------------------------------------------------------------------ living village
describe('living village', () => {
  it('night 1 is the familiar baseline (no dog, no events, standard patrol)', () => {
    const p = planNight(123, 1, 0, 'none');
    expect(p.modifier).toBe('normal');
    expect(p.dog).toBe(false);
    expect(p.events).toEqual([]);
    expect(p.patrol).toBe('standard');
    expect(p.sightMult).toBe(1);
  });
  it('later nights vary deterministically by seed and day', () => {
    const a = planNight(42, 3, 10, 'none');
    expect(planNight(42, 3, 10, 'none')).toEqual(a);
    const mods = new Set(Array.from({ length: 40 }, (_, d) => planNight(7, d + 2, 0, 'none').modifier));
    expect(mods.size).toBeGreaterThanOrEqual(3);
    for (let d = 2; d < 30; d++) {
      const p = planNight(99, d, 0, 'none');
      expect(p.dog).toBe(true);
      expect(p.events.length).toBeGreaterThanOrEqual(2);
      // Events are spread across the night and never in the first 30 minutes.
      for (const e of p.events) expect(e.atMinute).toBeGreaterThanOrEqual(90);
      for (let i = 1; i < p.events.length; i++) expect(p.events[i]!.atMinute - p.events[i - 1]!.atMinute).toBeGreaterThanOrEqual(25);
    }
  });
  it('village memory makes the night harder, but capped (never an unfair wall)', () => {
    const calm = planNight(5, 4, 0, 'none');
    const hot = planNight(5, 4, 100, 'caught');
    expect(hot.suspicionMult).toBeGreaterThan(calm.suspicionMult);
    expect(hot.suspicionMult).toBeLessThanOrEqual(1.3);
    expect(hot.rahimWakeMult).toBeLessThanOrEqual(1.25);
    expect(hot.memoryLine).toBe(true);
    expect(calm.memoryLine).toBe(false);
  });
  it('the dog growls first (a warning) and barks only if the disturbance continues', () => {
    let s: { state: DogState; t: number } = { state: 'asleep', t: 0 };
    s = stepDog(s, 0.5, false, 0.1);
    expect(s.state).toBe('growl');
    // Player backs off: no bark.
    let r = stepDog(s, 0, false, DOG_RULES.growlSeconds + 0.01);
    expect(r.state).toBe('settling');
    expect(r.barked).toBe(false);
    // Keeps making noise: bark.
    r = stepDog(s, 0.5, false, DOG_RULES.growlSeconds + 0.01);
    expect(r.barked).toBe(true);
  });
  it('a crouched thief can pass the dog; walking close wakes it', () => {
    const at = 2.6; // passing distance from the dog
    const crouch = hearingStrength(at, FOOTSTEP_NOISE.crouch.radius, false) * FOOTSTEP_NOISE.crouch.severity * 4;
    const walk = hearingStrength(at, FOOTSTEP_NOISE.walk.radius, false) * FOOTSTEP_NOISE.walk.severity * 4;
    expect(stepDog({ state: 'asleep', t: 0 }, crouch, false, 0.1).state).toBe('asleep');
    expect(stepDog({ state: 'asleep', t: 0 }, walk, false, 0.1).state).toBe('growl');
  });
});

// ------------------------------------------------------------------ mobile
describe('touch joystick', () => {
  it('the floating base follows a long drag so reversing responds immediately', () => {
    expect(followOrigin(0, 0, 50, 0, 60)).toEqual({ x: 0, y: 0 });
    const o = followOrigin(0, 0, 200, 0, 60);
    expect(200 - o.x).toBeCloseTo(60 * 1.35);
  });
});
