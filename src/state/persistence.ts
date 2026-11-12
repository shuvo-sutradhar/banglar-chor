import { z } from 'zod';
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from './settings';

/** Versioned local-only save key (README §12). Nothing here is ever sent to a server. */
export const SAVE_KEY = 'sidhel-chor:v1';
export const SAVE_VERSION = 1;

export const saveDocumentSchema = z.object({
  version: z.literal(SAVE_VERSION),
  settings: settingsSchema,
  nickname: z.string().max(24).optional(),
  /** Set after the first completed preparation ritual; enables the skip button. */
  preparationDone: z.boolean().default(false),
});

export type SaveDocument = z.output<typeof saveDocumentSchema>;

/** Minimal subset of the Web Storage API so tests can inject fakes. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type LoadNotice = 'none' | 'corrupt-reset' | 'version-reset' | 'storage-unavailable';

export type LoadResult = { document: SaveDocument; notice: LoadNotice };

export function createDefaultDocument(): SaveDocument {
  return { version: SAVE_VERSION, settings: { ...DEFAULT_SETTINGS }, preparationDone: false };
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
    if (version !== SAVE_VERSION) {
      // No older versions exist yet; future migrations plug in here.
      return { document: createDefaultDocument(), notice: 'version-reset' };
    }

    const result = saveDocumentSchema.safeParse(parsed);
    if (!result.success) {
      // Salvage valid settings fields where possible instead of discarding everything.
      const salvaged = salvageSettings((parsed as { settings?: unknown }).settings);
      return { document: { version: SAVE_VERSION, settings: salvaged, preparationDone: false }, notice: 'corrupt-reset' };
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
