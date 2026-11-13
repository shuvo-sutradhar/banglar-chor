import { z } from 'zod';
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from './settings';
import { createProfile, profileSchema, type Profile } from '../game/systems/progression';

/** Versioned local-only save key (README §12). Nothing here is ever sent to a server. */
export const SAVE_KEY = 'sidhel-chor:v1';
/** Document schema version (v1 = Phase 1–2, v2 = Phase 3 run history, v3 = Phase 4B progression). */
export const SAVE_VERSION = 3;
export const MAX_SAVED_RUNS = 20;

export const FINAL_OUTCOMES = ['night-caught', 'night-empty', 'night-escaped', 'completed', 'market-escaped', 'market-caught'] as const;

/** One finished run, as stored on THIS device only (not verified, not global). */
export const completedRunSchema = z.object({
  id: z.string().max(64),
  seed: z.number().int().nonnegative(),
  endedAtIso: z.string().max(40),
  nickname: z.string().max(24),
  outcome: z.enum(FINAL_OUTCOMES),
  score: z.number().int().nonnegative(),
  money: z.number().int().nonnegative(),
  collected: z.number().int().nonnegative(),
  sold: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  detections: z.number().int().nonnegative(),
  caught: z.boolean(),
  line: z.string().max(200),
});

export type CompletedRun = z.output<typeof completedRunSchema>;

export const saveDocumentSchema = z.object({
  version: z.literal(SAVE_VERSION),
  settings: settingsSchema,
  nickname: z.string().max(24).optional(),
  /** Set after the first completed preparation ritual; enables the skip button. */
  preparationDone: z.boolean().default(false),
  /** Most recent completed runs, newest first (bounded). */
  runs: z.array(completedRunSchema).max(MAX_SAVED_RUNS).default([]),
  /** Phase 4B: money, energy, equipment, supplies, village memory. */
  profile: profileSchema,
});

export type SaveDocument = z.output<typeof saveDocumentSchema>;

/** Minimal subset of the Web Storage API so tests can inject fakes. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type LoadNotice = 'none' | 'corrupt-reset' | 'version-reset' | 'storage-unavailable';

export type LoadResult = { document: SaveDocument; notice: LoadNotice };

export function createDefaultDocument(): SaveDocument {
  return { version: SAVE_VERSION, settings: { ...DEFAULT_SETTINGS }, preparationDone: false, runs: [], profile: createProfile() };
}

/** Safely obtain localStorage; returns null when blocked (private mode, sandboxed iframe, etc.). */
export function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = `${SAVE_KEY}:probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export class PersistenceService {
  private readonly storage: StorageLike | null;

  constructor(storage: StorageLike | null) {
    this.storage = storage;
  }

  get available(): boolean {
    return this.storage !== null;
  }

  load(): LoadResult {
    if (!this.storage) return { document: createDefaultDocument(), notice: 'storage-unavailable' };
    let raw: string | null;
    try {
      raw = this.storage.getItem(SAVE_KEY);
    } catch {
      return { document: createDefaultDocument(), notice: 'storage-unavailable' };
    }
    if (raw === null) return { document: createDefaultDocument(), notice: 'none' };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { document: createDefaultDocument(), notice: 'corrupt-reset' };
    }

    const version = typeof parsed === 'object' && parsed !== null ? (parsed as { version?: unknown }).version : undefined;
    if (version === 1) parsed = migrateV2(migrateV1(parsed as Record<string, unknown>));
    else if (version === 2) parsed = migrateV2(parsed as Record<string, unknown>);
    else if (version !== SAVE_VERSION) {
      return { document: createDefaultDocument(), notice: 'version-reset' };
    }

    const result = saveDocumentSchema.safeParse(parsed);
    if (!result.success) {
      // Salvage valid settings fields where possible instead of discarding everything.
      const p = parsed as { settings?: unknown; runs?: unknown; nickname?: unknown; preparationDone?: unknown; profile?: unknown };
      const salvaged = salvageSettings(p.settings);
      // Keep every individually valid run record (partial / damaged saves).
      const runs = Array.isArray(p.runs) ? p.runs.flatMap((r) => { const v = completedRunSchema.safeParse(r); return v.success ? [v.data] : []; }).slice(0, MAX_SAVED_RUNS) : [];
      const nickname = typeof p.nickname === 'string' && p.nickname.length <= 24 ? p.nickname : undefined;
      return { document: { version: SAVE_VERSION, settings: salvaged, preparationDone: p.preparationDone === true, runs, nickname, profile: salvageProfile(p.profile) }, notice: 'corrupt-reset' };
    }
    return { document: result.data, notice: 'none' };
  }

  /** Returns false (never throws) when storage is unavailable or the quota is exceeded. */
  save(document: SaveDocument): boolean {
    if (!this.storage) return false;
    const valid = saveDocumentSchema.safeParse(document);
    if (!valid.success) return false;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(valid.data));
      return true;
    } catch {
      return false;
    }
  }
}

function salvageSettings(input: unknown): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  if (typeof input !== 'object' || input === null) return settings;
  const shape = settingsSchema.shape;
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(shape) as (keyof Settings)[]) {
    const fieldResult = shape[key].safeParse(record[key]);
    if (fieldResult.success) (settings as Record<keyof Settings, unknown>)[key] = fieldResult.data;
  }
  return settings;
}

/**
 * Keep every individually valid profile field (money, owned items…) from a damaged save; invalid
 * fields fall back to defaults. Equipped items must be owned, or the slot resets to the starter.
 */
export function salvageProfile(input: unknown): Profile {
  const base = createProfile();
  if (typeof input !== 'object' || input === null) return base;
  const record = input as Record<string, unknown>;
  const shape = profileSchema.shape;
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(shape) as (keyof Profile)[]) {
    const r = shape[key].safeParse(record[key]);
    if (r.success) out[key] = r.data;
  }
  const prof = out as Profile;
  const owned = new Set([...base.owned, ...prof.owned]);
  prof.owned = [...owned];
  for (const slot of ['tool', 'bag', 'footwear'] as const) if (!owned.has(prof.equipped[slot])) prof.equipped = { ...prof.equipped, [slot]: base.equipped[slot] };
  return prof;
}

/**
 * v2 (Phase 3) → v3 (Phase 4B): adds the progression profile. Old saves never stored banked
 * money (run money was only a score number), so the bank starts at 0 rather than inventing money
 * from history (D-054); settings, nickname and run history are kept unchanged.
 */
export function migrateV2(doc: Record<string, unknown>): Record<string, unknown> {
  return { ...doc, version: 3, profile: createProfile() };
}

/** v1 (Phase 1–2) → v2: same settings/nickname/preparation flag, empty run history. */
export function migrateV1(doc: Record<string, unknown>): Record<string, unknown> {
  return { ...doc, version: 2, runs: [] };
}

/** Add a finished run (newest first, bounded) — returns a new document. Idempotent per run id. */
export function addCompletedRun(doc: SaveDocument, run: CompletedRun): SaveDocument {
  if (doc.runs.some((r) => r.id === run.id)) return doc;
  return { ...doc, runs: [run, ...doc.runs].slice(0, MAX_SAVED_RUNS) };
}

export function personalBest(doc: Pick<SaveDocument, 'runs'>): CompletedRun | null {
  return doc.runs.reduce<CompletedRun | null>((best, r) => (!best || r.score > best.score ? r : best), null);
}
