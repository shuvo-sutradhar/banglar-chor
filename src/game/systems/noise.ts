/**
 * World noise events (README §7: "Noise is not random damage"). Emitters publish events with a
 * position, audible radius and severity; listeners (NPCs) poll new events each step and apply
 * their own hearing rules (distance, occlusion). Pure data structure, no rendering.
 */
export type NoiseSource = 'footstep' | 'entry' | 'entry-fail' | 'item' | 'drop' | 'alarm' | 'pickup';

export type NoiseEvent = {
  id: number;
  at: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  /** 0..1 — how alarming the sound is. */
  severity: number;
  source: NoiseSource;
  /** Caused by the player (footsteps, items). Alarms from NPCs are not. */
  byPlayer: boolean;
};

export type NoiseInput = Omit<NoiseEvent, 'id' | 'at'>;

export class NoiseBus {
  private events: NoiseEvent[] = [];
  private nextId = 1;
  private readonly listeners = new Set<(e: NoiseEvent) => void>();
  /** Events older than this (seconds) are forgotten. */
  readonly retention = 2;

  emit(input: NoiseInput, now: number): NoiseEvent {
    const e: NoiseEvent = { ...input, id: this.nextId++, at: now };
    this.events.push(e);
    if (this.events.length > 64) this.events.splice(0, this.events.length - 64);
    for (const l of this.listeners) l(e);
    return e;
  }

  /** Events with id > afterId, not older than retention. */
  since(afterId: number, now: number): NoiseEvent[] {
    return this.events.filter((e) => e.id > afterId && now - e.at <= this.retention);
  }

  get lastId(): number {
    return this.nextId - 1;
  }

  /** Subscribe (e.g. audio/HUD). Returns an unsubscribe; double-unsubscribe is safe. */
  subscribe(listener: (e: NoiseEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  clear(): void {
    this.events = [];
  }
}

/**
 * Hearing strength 0..1 with linear falloff. Solid walls between source and listener halve the
 * effective radius — muffled, not silenced (a mechanism, not x-ray hearing).
 */
export function hearingStrength(distance: number, radius: number, occluded: boolean): number {
  const r = occluded ? radius * 0.5 : radius;
  if (r <= 0 || distance >= r) return 0;
  return 1 - distance / r;
}

export const FOOTSTEP_NOISE = {
  walk: { radius: 3.2, severity: 0.25 },
  run: { radius: 7.5, severity: 0.45 },
  crouch: { radius: 1.2, severity: 0.1 },
  /** Carrying a full load makes footsteps this much louder (multiplier on radius). */
  loadRadiusBoost: 0.6,
  strideMeters: 0.75,
} as const;
