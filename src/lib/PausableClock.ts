/**
 * Game-time clock for timing minigames. `tick()` is called once per animation frame;
 * `now()` interpolates between frames using the wall clock, so input events are judged
 * at their exact moment rather than quantized to frames (fair on slow devices).
 * While paused, time does not advance.
 */
const MAX_TICK = 1;

/**
 * Test-only time scale for minigame clocks (`?debug=1` → `__sidhel.setMinigameTimeScale`).
 * 1 in the game. Lets an automated driver whose every round trip takes seconds still play a
 * real-time rhythm game; all judging logic is unchanged.
 */
export const minigameTimeScale = { value: 1 };

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
    if (!this.paused) this.accumulated += Math.min(MAX_TICK, (w - this.lastWall) / 1000) * minigameTimeScale.value;
    this.lastWall = w;
    return this.accumulated;
  }

  /** Current game time in seconds, including time since the last tick. */
  now(): number {
    if (this.paused) return this.accumulated;
    return this.accumulated + Math.min(MAX_TICK, (this.wall() - this.lastWall) / 1000) * minigameTimeScale.value;
  }

  /**
   * Game time at a past/near wall-clock moment, e.g. an input event's `timeStamp`.
   * Judging input by when it happened (not when the handler ran) keeps timing fair on slow devices.
   */
  at(wallMs: number | undefined): number {
    if (this.paused || wallMs === undefined || !Number.isFinite(wallMs) || wallMs <= 0) return this.now();
    const delta = (wallMs - this.lastWall) / 1000;
    // Accept any timestamp within one hitch-cap of the last frame and not in the future. (It was
    // ±0.5 s: below 2 FPS an on-time tap landing > 0.5 s after the last frame was then judged at
    // handler time, i.e. late. Measured in headless runs at ~1.5 FPS.)
    const ahead = (wallMs - this.wall()) / 1000;
    if (delta > MAX_TICK || delta < -MAX_TICK || ahead > 0.05) return this.now();
    return this.accumulated + delta * minigameTimeScale.value;
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.tick();
    this.paused = paused;
    this.lastWall = this.wall();
  }
}
