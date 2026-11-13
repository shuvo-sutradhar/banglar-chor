/**
 * Comic preparation ritual (README §6): purely cosmetic fantasy — oil shine, lungi tuck,
 * gamcha headband. Three short timing stages; each always completes eventually (no soft lock).
 */
/** Seconds an over-held tuck waits for a late key-up before releasing itself (see `update`). */
export const TUCK_RELEASE_GRACE = 0.35;

export type PrepStage = 'oil' | 'tuck' | 'gamcha' | 'done';
export type PrepResult = 'hit' | 'miss' | 'complete' | 'auto-complete' | 'too-loose' | 'too-tight' | 'ignored';

export const PREP_TUNING = {
  oil: { hitsNeeded: 3, maxMisses: 5, speed: 2.2, zoneHalfWidth: 0.1 },
  tuck: { fillPerSec: 0.6, zoneMin: 0.62, zoneMax: 0.82, maxFails: 3 },
  gamcha: { radPerSec: 2.6, tolerance: 0.38, maxFails: 3 },
} as const;

export class PreparationRitual {
  stage: PrepStage = 'oil';
  oilHits = 0;
  oilMisses = 0;
  tuckFails = 0;
  gamchaFails = 0;
  /** Cosmetic outputs 0..1 consumed by the 3D character. */
  oil = 0;
  tuck = 0;
  headband = false;
  private holdStart: number | null = null;
  private stageStart = 0;

  /** Oil stage: marker ping-pongs across a bar, 0..1, centred sweet spot at 0.5. */
  oilMarker(t: number): number {
    return 0.5 + 0.5 * Math.sin((t - this.stageStart) * PREP_TUNING.oil.speed);
  }

  /** Milliseconds until the oil marker next crosses the sweet-spot centre (for tests/hints). */
  msUntilOilSweetSpot(t: number): number {
    const s = PREP_TUNING.oil.speed;
    const local = t - this.stageStart;
    const k = Math.floor((local * s) / Math.PI) + 1;
    return ((k * Math.PI) / s - local) * 1000;
  }

  /** Tuck stage gauge while holding (0..1+). */
  tuckGauge(t: number): number {
    return this.holdStart === null ? 0 : (t - this.holdStart) * PREP_TUNING.tuck.fillPerSec;
  }

  /** Ideal hold duration for tests/hints. */
  idealTuckHoldMs(): number {
    const { zoneMin, zoneMax, fillPerSec } = PREP_TUNING.tuck;
    return (((zoneMin + zoneMax) / 2) / fillPerSec) * 1000;
  }

  /** Gamcha stage: arrow angle (radians, 0 = pointing up). */
  gamchaAngle(t: number): number {
    return ((t - this.stageStart) * PREP_TUNING.gamcha.radPerSec) % (Math.PI * 2);
  }

  msUntilGamchaUp(t: number): number {
    const a = this.gamchaAngle(t);
    return ((Math.PI * 2 - a) / PREP_TUNING.gamcha.radPerSec) * 1000;
  }

  begin(t: number): void {
    this.stageStart = t;
  }

  /** Tap for oil and gamcha stages. */
  tap(t: number): PrepResult {
    if (this.stage === 'oil') {
      const inZone = Math.abs(this.oilMarker(t) - 0.5) <= PREP_TUNING.oil.zoneHalfWidth;
      if (inZone) {
        this.oilHits++;
        this.oil = this.oilHits / PREP_TUNING.oil.hitsNeeded;
        if (this.oilHits >= PREP_TUNING.oil.hitsNeeded) return this.advanceStage(t, 'complete');
        return 'hit';
      }
      this.oilMisses++;
      if (this.oilMisses >= PREP_TUNING.oil.maxMisses) {
        this.oil = Math.max(this.oil, 0.6);
        return this.advanceStage(t, 'auto-complete');
      }
      return 'miss';
    }
    if (this.stage === 'gamcha') {
      const a = this.gamchaAngle(t);
      const off = Math.min(a, Math.PI * 2 - a);
      if (off <= PREP_TUNING.gamcha.tolerance) {
        this.headband = true;
        return this.advanceStage(t, 'complete');
      }
      this.gamchaFails++;
      if (this.gamchaFails >= PREP_TUNING.gamcha.maxFails) {
        this.headband = true;
        return this.advanceStage(t, 'auto-complete');
      }
      return 'miss';
    }
    return 'ignored';
  }

  holdStartAt(t: number): void {
    if (this.stage === 'tuck' && this.holdStart === null) this.holdStart = t;
  }

  /** Release for the tuck stage. Over-holding auto-releases as too tight (see `update`). */
  release(t: number): PrepResult {
    if (this.stage !== 'tuck' || this.holdStart === null) return 'ignored';
    const g = this.tuckGauge(t);
    this.holdStart = null;
    const { zoneMin, zoneMax, maxFails } = PREP_TUNING.tuck;
    if (g >= zoneMin && g <= zoneMax) {
      this.tuck = 1;
      return this.advanceStage(t, 'complete');
    }
    this.tuckFails++;
    if (this.tuckFails >= maxFails) {
      this.tuck = 0.8;
      return this.advanceStage(t, 'auto-complete');
    }
    return g > zoneMax ? 'too-tight' : 'too-loose';
  }

  /**
   * Call per frame: an over-held tuck releases itself. The auto-release waits a short grace
   * after the gauge fills, so a key-up that happened in time but is delivered after a long frame
   * (slow device) is still judged on its own timestamp; the auto-release is judged at the moment
   * the gauge filled, so the grace never helps an over-hold.
   */
  update(t: number): PrepResult | null {
    if (this.stage !== 'tuck' || this.holdStart === null) return null;
    const fullAt = this.holdStart + 1 / PREP_TUNING.tuck.fillPerSec;
    if (t >= fullAt + TUCK_RELEASE_GRACE) return this.release(fullAt);
    return null;
  }

  private advanceStage(t: number, result: PrepResult): PrepResult {
    this.stage = this.stage === 'oil' ? 'tuck' : this.stage === 'tuck' ? 'gamcha' : 'done';
    this.stageStart = t;
    return result;
  }
}
