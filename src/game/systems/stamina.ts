/**
 * Current stamina (short-term: sprinting, digging) vs. overall energy (persistent, 0–100).
 * Energy scales stamina's ceiling and recovery; it never fails a run on its own
 * (docs/ECONOMY_AND_PROGRESSION.md §2). Pure and frame-rate independent (unit-tested).
 */
import { ENERGY_RULES, STAMINA_RULES, type EquipMods, type FoodEffectId } from '../data/economy';

export type StaminaParams = { max: number; regenPerSec: number; sprintDrainPerSec: number; digCost: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function staminaParams(energy: number, mods: EquipMods = {}, buff: FoodEffectId | null = null): StaminaParams {
  const e = clamp(energy, 0, 100) / 100;
  const S = STAMINA_RULES;
  const max = S.max * (S.minMaxFrac + (1 - S.minMaxFrac) * e) + (buff === 'big-lungs' ? 20 : 0);
  const regen = S.regenPerSec * (S.minRegenFrac + (1 - S.minRegenFrac) * e) * (buff === 'second-wind' ? 1.2 : 1);
  return { max, regenPerSec: regen, sprintDrainPerSec: S.sprintDrainPerSec * (mods.sprintCost ?? 1), digCost: S.digCost * (mods.entryStamina ?? 1) };
}

/** While chased, sprinting costs this fraction of the normal drain (fear-driven legs). */
export const ADRENALINE = { floor: 0.6, chaseDrain: 0.5 } as const;

export class Stamina {
  value: number;
  /** True after running dry until recovered to `recoverAt` (sprint locked meanwhile). */
  exhausted = false;
  /** Seconds since stamina was last spent (regen waits `regenDelay`). */
  private sinceSpend = 99;
  /** Exertion counters for the night's energy bill. */
  sprintSeconds = 0;
  digs = 0;
  params: StaminaParams;

  constructor(params: StaminaParams) {
    this.params = params;
    this.value = params.max;
  }

  get ratio(): number {
    return this.params.max > 0 ? this.value / this.params.max : 0;
  }

  /** Can the player sprint right now? */
  get canSprint(): boolean {
    return !this.exhausted && this.value > 0;
  }

  /**
   * Advance `dt` seconds. `sprinting` drains (more with load); otherwise regenerates after a short
   * delay (`resting` = deliberately catching breath, faster). Returns true on the frame it runs dry.
   */
  step(dt: number, sprinting: boolean, load = 0, resting = false, chased = false): boolean {
    if (dt <= 0) return false;
    let ranDry = false;
    if (sprinting && this.canSprint) {
      this.value -= this.params.sprintDrainPerSec * (1 + STAMINA_RULES.loadDrain * clamp(load, 0, 1)) * (chased ? ADRENALINE.chaseDrain : 1) * dt;
      this.sprintSeconds += dt;
      this.sinceSpend = 0;
      if (this.value <= 0) {
        this.value = 0;
        this.exhausted = true;
        ranDry = true;
      }
    } else {
      this.sinceSpend += dt;
      if (this.sinceSpend >= STAMINA_RULES.regenDelay || resting) {
        this.value = Math.min(this.params.max, this.value + this.params.regenPerSec * (resting ? STAMINA_RULES.restBoost : 1) * dt);
      }
    }
    if (this.exhausted && this.value >= STAMINA_RULES.recoverAt) this.exhausted = false;
    return ranDry;
  }

  /** Spend for an action (a dig). Returns the fatigue factor 0.5..1 (tired digs are weaker). */
  spend(amount: number): number {
    const before = this.value;
    this.value = Math.max(0, this.value - amount);
    this.sinceSpend = 0;
    if (this.value <= 0) this.exhausted = true;
    return before >= amount ? 1 : 0.5 + 0.5 * (before / Math.max(amount, 1e-6));
  }

  /**
   * Adrenaline at the start of a chase (GAME_DESIGN §4 guarantee: an unloaded escape is always
   * possible): stamina jumps to at least 60 % and the exhaustion lock clears. Once per chase.
   */
  adrenaline(): void {
    this.value = Math.max(this.value, this.params.max * ADRENALINE.floor);
    this.exhausted = false;
  }

  /** Instant refill (a supply snack). */
  refill(amount: number): void {
    this.value = Math.min(this.params.max, this.value + amount);
    if (this.value >= STAMINA_RULES.recoverAt) this.exhausted = false;
  }
}

/** Energy at the end of the night from the exertion it took (never below the floor). */
export function energyAfterNight(start: number, sprintSeconds: number, digs: number, snacks = 0): number {
  const R = ENERGY_RULES;
  const spent = R.nightBase + sprintSeconds * R.sprintPerSec + digs * R.digPerTap;
  return clamp(Math.round(start - spent + snacks), R.floor, 100);
}
