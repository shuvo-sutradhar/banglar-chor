/**
 * Dialogue playback (docs/AUDIO_DIRECTION.md §4).
 *
 * `VoiceDirector` is pure decision logic with injected time and outputs (unit-tested):
 * - one line at a time (no unnatural overlaps); a strictly higher-priority line interrupts,
 *   an equal/lower one waits in a short queue (priority ≥ 2) or is dropped (flavour lines);
 * - per-line cooldowns and a per-character breath gap;
 * - the subtitle is shown when playback STARTS and cleared when it ENDS (synchronised with the
 *   real audio duration, or an estimated reading time when no recording exists yet);
 * - family / rough dialogue variants.
 *
 * `browserVoicePlayer` plays recorded files (AudioBuffer on the voice bus, spatialised for NPCs)
 * when they are listed in public/assets/audio/voice/available.json. No recordings exist yet, so
 * today every line is "text-only": subtitles with timing, and NO fake voice sounds.
 */
import { lineText, voiceFile, voiceLine, voiceLineForText, CHARACTER_NAMES, type VoiceLine } from './voiceLines';
import { audio } from './AudioManager';

export type PlayHandle = { duration: number; voiced: boolean; stop: () => void };

export interface VoicePlayer {
  /** Start playback now; returns the real duration (s) and whether real audio is playing. */
  start(line: VoiceLine, text: string, rough: boolean, at?: { x: number; z: number }): PlayHandle;
}

export interface SubtitleSink {
  show(text: string, speaker: string, ms: number): number;
  clear(id: number): void;
}

export type SpeakResult = 'played' | 'queued' | 'cooldown' | 'busy' | 'unknown' | 'disabled';

type Active = { line: VoiceLine; endsAt: number; handle: PlayHandle; captionId: number };
type Pending = { line: VoiceLine; at?: { x: number; z: number }; expires: number };

/** Reading-time estimate for text-only lines (Bangla, comfortable pace). */
export function estimateDuration(text: string): number {
  return Math.min(5.5, Math.max(1.3, 0.55 + text.length * 0.065));
}

export const VOICE_RULES = {
  /** Gap kept between two lines (natural breath). */
  gap: 0.12,
  /** The same character won't start a new line within this time of their last one ending. */
  characterGap: 0.6,
  queueMax: 2,
  /** Queued lines older than this are dropped (they'd be out of context). */
  queueTtl: 2.5,
} as const;

export class VoiceDirector {
  private active: Active | null = null;
  private queue: Pending[] = [];
  private lastPlayed = new Map<string, number>();
  private lastCharacterEnd = new Map<string, number>();
  private freeAt = 0;
  rough = false;
  enabled = true;
  /** History for tests/debug: [time, id, voiced]. */
  readonly log: { at: number; id: string; voiced: boolean }[] = [];

  private readonly player: VoicePlayer;
  private readonly subtitles: SubtitleSink;
  private readonly now: () => number;

  constructor(player: VoicePlayer, subtitles: SubtitleSink, now: () => number) {
    this.player = player;
    this.subtitles = subtitles;
    this.now = now;
  }

  get current(): VoiceLine | null {
    return this.active?.line ?? null;
  }

  get queued(): number {
    return this.queue.length;
  }

  speak(id: string, at?: { x: number; z: number }): SpeakResult {
    const line = voiceLine(id);
    if (!line) return 'unknown';
    return this.request(line, at);
  }

  request(line: VoiceLine, at?: { x: number; z: number }): SpeakResult {
    if (!this.enabled) return 'disabled';
    const t = this.now();
    this.update();
    const last = this.lastPlayed.get(line.id);
    if (last !== undefined && t - last < line.cooldown) return 'cooldown';
    if (this.active && this.active.line.id === line.id) return 'cooldown';
    if (this.active) {
      if (line.priority > this.active.line.priority) {
        this.interrupt();
        this.begin(line, at, t);
        return 'played';
      }
      if (line.priority >= 2 && this.queue.length < VOICE_RULES.queueMax && !this.queue.some((q) => q.line.id === line.id)) {
        this.queue.push({ line, at, expires: t + VOICE_RULES.queueTtl });
        this.queue.sort((a, b) => b.line.priority - a.line.priority);
        return 'queued';
      }
      return 'busy';
    }
    const charFree = (this.lastCharacterEnd.get(line.character) ?? -99) + VOICE_RULES.characterGap;
    if (t < this.freeAt || (t < charFree && line.priority < 3)) {
      if (line.priority >= 2 && this.queue.length < VOICE_RULES.queueMax) {
        this.queue.push({ line, at, expires: t + VOICE_RULES.queueTtl });
        return 'queued';
      }
      return 'busy';
    }
    this.begin(line, at, t);
    return 'played';
  }

  /**
   * Crowd walla for scripted scenes (the catch): plays without taking the single dialogue slot,
   * so overlapping shouts are allowed there only; the scene shows its own subtitles.
   */
  crowd(id: string, at?: { x: number; z: number }): PlayHandle | null {
    const line = voiceLine(id);
    if (!line || !this.enabled) return null;
    const handle = this.player.start(line, lineText(line, this.rough), this.rough, line.positional ? at : undefined);
    this.crowdHandles.add(handle);
    this.lastPlayed.set(line.id, this.now());
    this.log.push({ at: this.now(), id: line.id, voiced: handle.voiced });
    return handle;
  }

  private crowdHandles = new Set<PlayHandle>();

  /** Advance: finish the current line at its real end, then start the next queued one. */
  update(): void {
    const t = this.now();
    if (this.active && t >= this.active.endsAt) this.finish(t);
    if (!this.active && t >= this.freeAt) {
      this.queue = this.queue.filter((q) => q.expires >= t);
      const next = this.queue.shift();
      if (next) this.begin(next.line, next.at, t);
    }
  }

  /** Stop everything (pause menu, scene change, catch skip). */
  stopAll(): void {
    this.queue = [];
    if (this.active) this.interrupt();
    for (const h of this.crowdHandles) h.stop();
    this.crowdHandles.clear();
  }

  private begin(line: VoiceLine, at: { x: number; z: number } | undefined, t: number): void {
    const text = lineText(line, this.rough);
    const handle = this.player.start(line, text, this.rough, line.positional ? at : undefined);
    const duration = Math.max(0.3, handle.duration);
    const captionId = this.subtitles.show(text, CHARACTER_NAMES[line.character], duration * 1000 + 250);
    this.active = { line, endsAt: t + duration, handle, captionId };
    this.lastPlayed.set(line.id, t);
    this.log.push({ at: t, id: line.id, voiced: handle.voiced });
    if (this.log.length > 60) this.log.splice(0, this.log.length - 60);
  }

  private finish(t: number): void {
    const a = this.active!;
    this.lastCharacterEnd.set(a.line.character, t);
    this.freeAt = t + VOICE_RULES.gap;
    this.active = null;
  }

  private interrupt(): void {
    const a = this.active!;
    a.handle.stop();
    this.subtitles.clear(a.captionId);
    this.lastCharacterEnd.set(a.line.character, this.now());
    this.active = null;
  }
}

// ------------------------------------------------------------------ browser playback
/** Files that actually exist (written by `npm run voice:manifest`); empty until recordings land. */
let available: Set<string> | null = null;
const buffers = new Map<string, AudioBuffer | 'loading' | 'failed'>();

export async function loadVoiceAvailability(base = import.meta.env.BASE_URL ?? '/'): Promise<number> {
  try {
    const res = await fetch(`${base}assets/audio/voice/available.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const list = (await res.json()) as unknown;
    available = new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    available = new Set();
  }
  return available.size;
}

export function voiceAvailability(): { checked: boolean; files: number } {
  return { checked: available !== null, files: available?.size ?? 0 };
}

function preload(file: string): void {
  const ctx = audio.context;
  if (!ctx || buffers.has(file)) return;
  buffers.set(file, 'loading');
  void fetch(`${import.meta.env.BASE_URL ?? '/'}${file}`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((b) => ctx.decodeAudioData(b))
    .then((buf) => buffers.set(file, buf))
    .catch(() => buffers.set(file, 'failed'));
}

/** Warm the cache for lines likely to be needed soon (e.g. the catch sequence). */
export function preloadLines(ids: readonly string[], rough: boolean): void {
  for (const id of ids) {
    const l = voiceLine(id);
    if (!l) continue;
    const f = voiceFile(l, rough && !!l.roughText);
    if (available?.has(f)) preload(f);
  }
}

export const browserVoicePlayer: VoicePlayer = {
  start(line, text, rough, at) {
    const file = voiceFile(line, rough && !!line.roughText);
    const ctx = audio.context;
    const buf = buffers.get(file);
    if (ctx && available?.has(file)) {
      if (buf instanceof AudioBuffer) {
        const r = audio.route({ at, bus: 'voice', range: 34 }, 'voice');
        if (r) {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const g = ctx.createGain();
          g.gain.value = r.gain;
          src.connect(g).connect(r.input);
          src.start();
          return { duration: buf.duration, voiced: true, stop: () => { try { src.stop(); } catch { /* ended */ } } };
        }
      } else preload(file); // next time
    }
    return { duration: estimateDuration(text), voiced: false, stop: () => {} };
  },
};

// ------------------------------------------------------------------ singleton wiring
let subtitleSink: SubtitleSink = { show: () => 0, clear: () => {} };
export function setSubtitleSink(sink: SubtitleSink): void {
  subtitleSink = sink;
}

export const voice = new VoiceDirector(
  browserVoicePlayer,
  { show: (t, s, ms) => subtitleSink.show(t, s, ms), clear: (id) => subtitleSink.clear(id) },
  () => performance.now() / 1000,
);

/**
 * Route a spoken text through the director if it is a manifest line. Returns true when the
 * director handled the subtitle (the caller must then not show it again).
 */
export function speakText(text: string, at?: { x: number; z: number }): boolean {
  const line = voiceLineForText(text);
  if (!line) return false;
  const r = voice.request(line, at);
  if (r === 'played' || r === 'queued') return true;
  // Suppressed audio: gameplay-critical info lines still get their subtitle (from the caller).
  return !line.info;
}
