import { clamp } from '../../lib/math';

export type XZ = { x: number; z: number };

export type NpcState = 'idle' | 'patrol' | 'suspicious' | 'investigating' | 'alerted' | 'chasing' | 'searching' | 'returning';

export type BarkId = 'who-there' | 'heard' | 'investigate' | 'alarm' | 'lost' | 'give-up';

export type BrainConfig = {
  route: readonly XZ[];
  idleAtWaypoint: number;
  suspiciousAt: number;
  investigateAt: number;
  chaseAt: number;
  calmBelow: number;
  decayPerSec: number;
  decayGrace: number;
  alertedPause: number;
  loseSightAfter: number;
  searchDuration: number;
  investigateLookTime: number;
  reAlertCooldown: number;
  cooldownGainFactor: number;
  catchRadius: number;
  leashRadius: number;
  hearingGain: number;
  arriveRadius: number;
};

export const VILLAGER_BRAIN_DEFAULTS: Omit<BrainConfig, 'route'> = {
  idleAtWaypoint: 2.2,
  suspiciousAt: 30,
  investigateAt: 60,
  chaseAt: 100,
  calmBelow: 15,
  decayPerSec: 14,
  decayGrace: 1.5,
  alertedPause: 0.7,
  loseSightAfter: 6,
  searchDuration: 8,
  investigateLookTime: 3,
  reAlertCooldown: 10,
  cooldownGainFactor: 0.5,
  catchRadius: 1.0,
  leashRadius: 30,
  hearingGain: 45,
  arriveRadius: 0.6,
};

export type Brain = {
  state: NpcState;
  stateTime: number;
  suspicion: number;
  sinceStimulus: number;
  sinceSeen: number;
  lastKnown: XZ | null;
  cooldown: number;
  waypoint: number;
  hurry: boolean;
  searchTarget: XZ | null;
  searchIndex: number;
  returnTarget: XZ | null;
};

export type HeardPercept = { pos: XZ; strength: number; severity: number; alarm: boolean };

export type Percepts = {
  npcPos: XZ;
  /** Suspicion/sec from sight this step; > 0 means the player is currently visible. */
  sightRate: number;
  playerPos: XZ | null;
  distanceToPlayer: number;
  heard: HeardPercept | null;
  /** Player is inside the safe exit region at the village edge: pursuers give up (README §7). */
  targetSafe?: boolean;
};

export type Pace = 'stop' | 'walk' | 'hurry' | 'run';

export type BrainOutput = {
  target: XZ | null;
  pace: Pace;
  lookAt: XZ | null;
  bark: BarkId | null;
  caught: boolean;
  /** Set when the state changed this step. */
  entered: NpcState | null;
};

export function createBrain(): Brain {
  return {
    state: 'patrol',
    stateTime: 0,
    suspicion: 0,
    sinceStimulus: 99,
    sinceSeen: 99,
    lastKnown: null,
    cooldown: 0,
    waypoint: 0,
    hurry: false,
    searchTarget: null,
    searchIndex: 0,
    returnTarget: null,
  };
}

const dist = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z);

function nearestWaypoint(route: readonly XZ[], p: XZ): number {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  route.forEach((w, i) => {
    const d = dist(w, p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function distanceFromRoute(route: readonly XZ[], p: XZ): number {
  return route.reduce((m, w) => Math.min(m, dist(w, p)), Number.POSITIVE_INFINITY);
}

/**
 * One deterministic brain step. Mutates and returns `brain` plus intent for this step.
 * Fairness rules: chase requires actual sight; hearing alone caps below the chase threshold;
 * the alerted pause telegraphs every chase; re-alert cooldown prevents detection loops.
 */
export function stepBrain(brain: Brain, p: Percepts, dt: number, cfg: BrainConfig): BrainOutput {
  const b = brain;
  const out: BrainOutput = { target: null, pace: 'stop', lookAt: null, bark: null, caught: false, entered: null };
  b.stateTime += dt;
  b.cooldown = Math.max(0, b.cooldown - dt);
  const gain = b.cooldown > 0 ? cfg.cooldownGainFactor : 1;
  const sees = p.sightRate > 0 && p.playerPos !== null;
  let perceived = false;

  if (sees && p.playerPos) {
    b.suspicion += p.sightRate * dt * gain;
    b.lastKnown = { ...p.playerPos };
    b.sinceSeen = 0;
    perceived = true;
  } else {
    b.sinceSeen += dt;
  }
  if (p.heard) {
    const add = p.heard.strength * p.heard.severity * cfg.hearingGain * gain;
    b.suspicion += add;
    if (p.heard.alarm) b.suspicion = Math.max(b.suspicion, cfg.investigateAt);
    if (!sees) b.lastKnown = { ...p.heard.pos };
    if (p.heard.alarm || p.heard.severity >= 0.8) b.hurry = true;
    perceived = true;
  }
  b.sinceStimulus = perceived ? 0 : b.sinceStimulus + dt;
  const engaged = b.state === 'alerted' || b.state === 'chasing';
  if (!perceived && !engaged && b.sinceStimulus > cfg.decayGrace) b.suspicion -= cfg.decayPerSec * dt;
  // Hearing alone can never start a chase.
  b.suspicion = clamp(b.suspicion, 0, 100);
  if (!sees && b.suspicion >= cfg.chaseAt && !engaged) b.suspicion = cfg.chaseAt - 1;

  const enter = (s: NpcState, bark: BarkId | null = null) => {
    if (b.state === s) return;
    b.state = s;
    b.stateTime = 0;
    out.entered = s;
    if (bark) out.bark = bark;
  };

  // Global escalation checks.
  if (!engaged && sees && b.suspicion >= cfg.chaseAt) enter('alerted', 'alarm');

  switch (b.state) {
    case 'idle':
    case 'patrol': {
      if (b.suspicion >= cfg.investigateAt) {
        enter('investigating', p.heard && !sees ? 'heard' : 'investigate');
        break;
      }
      if (b.suspicion >= cfg.suspiciousAt) {
        enter('suspicious', 'who-there');
        break;
      }
      const wp = cfg.route[b.waypoint % cfg.route.length] as XZ;
      if (b.state === 'patrol') {
        if (dist(p.npcPos, wp) <= cfg.arriveRadius) enter('idle');
        else {
          out.target = wp;
          out.pace = 'walk';
        }
      } else if (b.stateTime >= cfg.idleAtWaypoint) {
        b.waypoint = (b.waypoint + 1) % cfg.route.length;
        enter('patrol');
      }
      break;
    }
    case 'suspicious': {
      out.lookAt = b.lastKnown;
      if (b.suspicion >= cfg.investigateAt) enter('investigating', 'investigate');
      else if (b.suspicion < cfg.calmBelow) beginReturn(b, cfg, p, enter);
      break;
    }
    case 'investigating': {
      const target = b.lastKnown;
      if (!target) {
        beginReturn(b, cfg, p, enter);
        break;
      }
      if (dist(p.npcPos, target) > cfg.arriveRadius + 0.4 && b.sinceStimulus < cfg.investigateLookTime + 4) {
        out.target = target;
        out.pace = b.hurry ? 'hurry' : 'walk';
        b.stateTime = Math.min(b.stateTime, 0.0001);
      } else {
        out.lookAt = target;
        if (b.stateTime >= cfg.investigateLookTime && b.sinceStimulus > 0.5) {
          b.searchIndex = 0;
          b.searchTarget = null;
          enter('searching', 'lost');
        }
      }
      if (distanceFromRoute(cfg.route, p.npcPos) > cfg.leashRadius) beginReturn(b, cfg, p, enter);
      break;
    }
    case 'alerted': {
      out.lookAt = p.playerPos ?? b.lastKnown;
      b.suspicion = cfg.chaseAt;
      if (b.stateTime >= cfg.alertedPause) enter('chasing');
      break;
    }
    case 'chasing': {
      b.suspicion = cfg.chaseAt;
      out.target = b.lastKnown;
      out.pace = 'run';
      if (sees && p.distanceToPlayer <= cfg.catchRadius) out.caught = true;
      if (p.targetSafe || b.sinceSeen > cfg.loseSightAfter || distanceFromRoute(cfg.route, p.npcPos) > cfg.leashRadius) {
        b.searchIndex = 0;
        b.searchTarget = null;
        b.suspicion = 70;
        enter('searching', 'lost');
      }
      break;
    }
    case 'searching': {
      const center = b.lastKnown ?? p.npcPos;
      if (!b.searchTarget || dist(p.npcPos, b.searchTarget) <= cfg.arriveRadius) {
        const a = b.searchIndex * 2.1;
        b.searchTarget = { x: center.x + Math.cos(a) * 2.5, z: center.z + Math.sin(a) * 2.5 };
        b.searchIndex++;
      }
      out.target = b.searchTarget;
      out.pace = 'walk';
      if (b.stateTime >= cfg.searchDuration) {
        b.cooldown = cfg.reAlertCooldown;
        b.suspicion = Math.min(b.suspicion, 20);
        beginReturn(b, cfg, p, enter);
      }
      break;
    }
    case 'returning': {
      if (b.suspicion >= cfg.investigateAt) {
        enter('investigating', 'investigate');
        break;
      }
      const t = b.returnTarget ?? (cfg.route[nearestWaypoint(cfg.route, p.npcPos)] as XZ);
      b.returnTarget = t;
      if (dist(p.npcPos, t) <= cfg.arriveRadius) {
        b.waypoint = nearestWaypoint(cfg.route, t);
        b.returnTarget = null;
        b.hurry = false;
        enter('patrol');
      } else {
        out.target = t;
        out.pace = 'walk';
      }
      break;
    }
  }
  return out;
}

function beginReturn(b: Brain, cfg: BrainConfig, p: Percepts, enter: (s: NpcState, bark?: BarkId | null) => void) {
  b.hurry = false;
  b.returnTarget = cfg.route[nearestWaypoint(cfg.route, p.npcPos)] as XZ;
  enter('returning', 'give-up');
}

export const NPC_SPEEDS: Record<Pace, number> = { stop: 0, walk: 1.4, hurry: 2.8, run: 5.0 };
