/**
 * Sleeping homeowner FSM (README §7 "Homeowner: sleep → wake, shout, summon neighbours").
 * Hearing only — an asleep person cannot see. Pure and deterministic.
 */
export type SleeperState = 'asleep' | 'stirring' | 'awake';

export type SleeperConfig = {
  stirAt: number;
  wakeAt: number;
  settleBelow: number;
  hearingGain: number;
  decayPerSec: number;
  decayGrace: number;
  /** Seconds an awake sleeper gives a thief still inside before grabbing (fair warning). */
  grabAfter: number;
  /** Seconds awake with nobody inside before going back to sleep. */
  backToSleepAfter: number;
};

export const RAHIM_SLEEPER: SleeperConfig = {
  stirAt: 35,
  wakeAt: 100,
  settleBelow: 15,
  hearingGain: 70,
  decayPerSec: 6,
  decayGrace: 2,
  grabAfter: 6,
  backToSleepAfter: 20,
};

export type Sleeper = { state: SleeperState; suspicion: number; sinceHeard: number; awakeTime: number; intruderTime: number };

export type SleeperEvent = 'stir' | 'settle' | 'wake' | 'grab' | 'sleep' | null;

export function createSleeper(): Sleeper {
  return { state: 'asleep', suspicion: 0, sinceHeard: 99, awakeTime: 0, intruderTime: 0 };
}

/** `heard` = strength*severity of the loudest noise this step (0 if none). */
export function stepSleeper(s: Sleeper, heard: number, intruderInside: boolean, dt: number, cfg: SleeperConfig): SleeperEvent {
  if (s.state === 'awake') {
    s.awakeTime += dt;
    if (intruderInside) {
      s.intruderTime += dt;
      if (s.intruderTime >= cfg.grabAfter) return 'grab';
      return null;
    }
    s.intruderTime = 0;
    if (s.awakeTime >= cfg.backToSleepAfter) {
      s.state = 'asleep';
      s.suspicion = 0;
      s.awakeTime = 0;
      return 'sleep';
    }
    return null;
  }
  if (heard > 0) {
    s.suspicion = Math.min(100, s.suspicion + heard * cfg.hearingGain);
    s.sinceHeard = 0;
  } else {
    s.sinceHeard += dt;
    if (s.sinceHeard > cfg.decayGrace) s.suspicion = Math.max(0, s.suspicion - cfg.decayPerSec * dt);
  }
  if (s.suspicion >= cfg.wakeAt) {
    s.state = 'awake';
    s.awakeTime = 0;
    s.intruderTime = 0;
    return 'wake';
  }
  if (s.state === 'asleep' && s.suspicion >= cfg.stirAt) {
    s.state = 'stirring';
    return 'stir';
  }
  if (s.state === 'stirring' && s.suspicion < cfg.settleBelow) {
    s.state = 'asleep';
    return 'settle';
  }
  return null;
}
