/**
 * The thief's body for the current night: stamina (per-frame, mutable, never React state),
 * starting energy, equipment modifiers, the food buff, supplies carried, and the night plan.
 * Set once when a run starts (useAppStore.startRun); read by the player controller, the entry
 * challenge, NPCs and the HUD (via coarse, throttled store updates).
 */
import { createProfile, equippedMods, type NightLoadout } from './progression';
import { Stamina, energyAfterNight, staminaParams } from './stamina';
import { planNight, type NightPlan } from './villageLife';
import { SUPPLIES, type SupplyId } from '../data/economy';

export type NightBody = {
  loadout: NightLoadout;
  plan: NightPlan;
  stamina: Stamina;
  supplies: Record<SupplyId, number>;
  /** Energy restored by snacks eaten tonight. */
  snackEnergy: number;
  /** Fatigue reaction already played (once per exhaustion). */
  tiredShown: boolean;
};

function defaultLoadout(): NightLoadout {
  const p = createProfile();
  return { energy: p.energy, mods: equippedMods(p), buff: null, supplies: { ...p.supplies }, day: 1, heat: 0, lastIncident: 'none' };
}

function make(loadout: NightLoadout, seed: number): NightBody {
  return {
    loadout,
    plan: planNight(seed, loadout.day, loadout.heat, loadout.lastIncident),
    stamina: new Stamina(staminaParams(loadout.energy, loadout.mods, loadout.buff)),
    supplies: { ...loadout.supplies },
    snackEnergy: 0,
    tiredShown: false,
  };
}

export const nightBody: { current: NightBody } = { current: make(defaultLoadout(), 1) };

export function beginNightBody(loadout: NightLoadout, seed: number): NightBody {
  nightBody.current = make(loadout, seed);
  return nightBody.current;
}

/** Live energy estimate (start − exertion so far + snacks). */
export function currentEnergy(b: NightBody = nightBody.current): number {
  return energyAfterNight(b.loadout.energy, b.stamina.sprintSeconds, b.stamina.digs, b.snackEnergy);
}

/** Eat a carried snack during the night. Returns false when none are left. */
export function eatSnack(id: SupplyId, b: NightBody = nightBody.current): boolean {
  if ((b.supplies[id] ?? 0) <= 0) return false;
  const s = SUPPLIES[id];
  b.supplies = { ...b.supplies, [id]: b.supplies[id] - 1 };
  b.snackEnergy += s.energy;
  b.stamina.refill(s.stamina);
  b.tiredShown = false;
  return true;
}
