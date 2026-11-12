/**
 * Game-time clock for timing minigames. `tick()` is called once per animation frame;
 * `now()` interpolates between frames using the wall clock, so input events are judged
 * at their exact moment rather than quantized to frames (fair on slow devices).
 * While paused, time does not advance.
 */
const MAX_TICK = 1;

export class PausableClock {
  private accumulated = 0;
  private lastWall: number;
  private paused = false;
  private readonly wall: () => number;

  constructor(wall: () => number = () => performance.now()) {
    this.wall = wall;
    this.lastWall = wall();
  }

  /** Advance to the present. Call every frame. */
  tick(): number {
    const w = this.wall();
    // Cap long hitches (1 s). Tab suspension already pauses the game explicitly; a tighter cap
    // would make game time drift behind real time on slow devices and misjudge on-time inputs.
    if (!this.paused) this.accumulated += Math.min(MAX_TICK, (w - this.lastWall) / 1000);
    this.lastWall = w;
    return this.accumulated;
  }

  /** Current game time in seconds, including time since the last tick. */
  now(): number {
    if (this.paused) return this.accumulated;
    return this.accumulated + Math.min(MAX_TICK, (this.wall() - this.lastWall) / 1000);
  }

  /**
   * Game time at a past/near wall-clock moment, e.g. an input event's `timeStamp`.
   * Judging input by when it happened (not when the handler ran) keeps timing fair on slow devices.
   */
  at(wallMs: number | undefined): number {
    if (this.paused || wallMs === undefined || !Number.isFinite(wallMs) || wallMs <= 0) return this.now();
    const delta = (wallMs - this.lastWall) / 1000;
    if (delta > 0.5 || delta < -0.5) return this.now();
    return this.accumulated + delta;
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.tick();
    this.paused = paused;
    this.lastWall = this.wall();
  }
}
