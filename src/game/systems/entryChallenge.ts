/**
 * Abstract, fictional "sidh kata" rhythm challenge (README §8). Purely a timing game:
 * pulses arrive on a fixed beat; tapping close to a beat fills Progress, mistakes fill Noise.
 * It depicts no real tool, technique or structural weakness.
 *
 * Deterministic and frame-independent: taps are judged at their exact timestamps.
 */
export type EntryConfig = {
  beatInterval: number;
  firstBeatDelay: number;
  perfectWindow: number;
  goodWindow: number;
  progressPerfect: number;
  progressGood: number;
  /** Noise for a tap that matches no beat. */
  noiseMiss: number;
  /** Noise when a beat passes untapped (idling is not free). */
  noiseLapse: number;
  /** Even good digging makes a little noise. */
  noiseHit: number;
  noiseDecayPerSec: number;
};

export type Judgement = 'perfect' | 'good' | 'miss' | 'lapse';
export type EntryStatus = 'running' | 'success' | 'failed';

export type EntryEvent = { kind: Judgement; at: number; beatIndex: number | null };

/**
 * A beat only counts as missed this long after its window closes, so an input that happened in
 * time but was delivered a frame late (slow device) is still judged on its real timestamp.
 */
export const LAPSE_GRACE = 0.3;

export class EntryChallenge {
  readonly config: EntryConfig;
  time = 0;
  progress = 0;
  noise = 0;
  status: EntryStatus = 'running';
  hits = 0;
  misses = 0;
  lastEvent: EntryEvent | null = null;
  /** Index of the first beat not yet consumed or lapsed. */
  private cursor = 0;

  constructor(config: EntryConfig) {
    this.config = config;
  }

  beatTime(index: number): number {
    return this.config.firstBeatDelay + index * this.config.beatInterval;
  }

  /** Seconds from `at` until the next unconsumed beat (for visuals and tests). */
  timeToNextBeat(at = this.time): number {
    let i = this.cursor;
    while (this.beatTime(i) + this.config.goodWindow < at) i++;
    return this.beatTime(i) - at;
  }

  /** Visual pulse phase 0..1 for the current beat (1 = pulse just spawned, 0 = on the beat). */
  pulsePhase(at = this.time): number {
    const t = this.timeToNextBeat(at);
    return Math.max(0, Math.min(1, t / this.config.beatInterval));
  }

  /** Advance simulated time; returns lapse events for beats that passed untapped. */
  advance(dt: number): EntryEvent[] {
    if (this.status !== 'running' || dt <= 0) return [];
    this.time += dt;
    const events: EntryEvent[] = [];
    while (this.beatTime(this.cursor) + this.config.goodWindow + LAPSE_GRACE < this.time) {
      const ev: EntryEvent = { kind: 'lapse', at: this.beatTime(this.cursor) + this.config.goodWindow, beatIndex: this.cursor };
      this.cursor++;
      this.addNoise(this.config.noiseLapse);
      this.misses++;
      this.lastEvent = ev;
      events.push(ev);
      if (this.status !== 'running') return events;
    }
    this.noise = Math.max(0, this.noise - this.config.noiseDecayPerSec * dt);
    return events;
  }

  /** Judge a tap at game time `at` (its real timestamp; may be slightly before the current time). */
  tap(at: number): EntryEvent | null {
    if (this.status !== 'running') return null;
    if (at > this.time) this.advance(at - this.time);
    if (this.status !== 'running') return null;
    // Skip beats whose window had fully closed before this tap happened.
    while (this.beatTime(this.cursor) + this.config.goodWindow < at - 1e-9) {
      this.cursor++;
      this.misses++;
      this.addNoise(this.config.noiseLapse);
      if (this.status !== 'running') return null;
    }
    const beat = this.beatTime(this.cursor);
    const error = Math.abs(at - beat);
    let ev: EntryEvent;
    if (error <= this.config.perfectWindow) {
      ev = { kind: 'perfect', at, beatIndex: this.cursor };
      this.progress = Math.min(100, this.progress + this.config.progressPerfect);
    } else if (error <= this.config.goodWindow) {
      ev = { kind: 'good', at, beatIndex: this.cursor };
      this.progress = Math.min(100, this.progress + this.config.progressGood);
    } else {
      ev = { kind: 'miss', at, beatIndex: null };
      this.misses++;
      this.addNoise(this.config.noiseMiss);
      this.lastEvent = ev;
      return ev;
    }
    this.cursor++;
    this.hits++;
    this.addNoise(this.config.noiseHit);
    if (this.progress >= 100 && this.status === 'running') this.status = 'success';
    this.lastEvent = ev;
    return ev;
  }

  private addNoise(amount: number): void {
    this.noise = Math.min(100, this.noise + amount);
    if (this.noise >= 100 && this.status === 'running') this.status = 'failed';
  }
}
