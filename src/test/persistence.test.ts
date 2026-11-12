import { describe, expect, it } from 'vitest';
import { PersistenceService, SAVE_KEY, createDefaultDocument, type StorageLike } from '../state/persistence';
import { DEFAULT_SETTINGS } from '../state/settings';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? (data[k] as string) : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

describe('PersistenceService', () => {
  it('round-trips a valid document', () => {
    const storage = memoryStorage();
    const service = new PersistenceService(storage);
    const doc = createDefaultDocument();
    doc.settings.quality = 'low';
    doc.settings.invertY = true;
    expect(service.save(doc)).toBe(true);
    const loaded = service.load();
    expect(loaded.notice).toBe('none');
    expect(loaded.document.settings.quality).toBe('low');
    expect(loaded.document.settings.invertY).toBe(true);
  });

  it('returns defaults with no notice when empty', () => {
    const loaded = new PersistenceService(memoryStorage()).load();
    expect(loaded.notice).toBe('none');
    expect(loaded.document.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('recovers from unparsable JSON', () => {
    const loaded = new PersistenceService(memoryStorage({ [SAVE_KEY]: '{not json' })).load();
    expect(loaded.notice).toBe('corrupt-reset');
    expect(loaded.document.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('salvages valid fields from a partially corrupt document', () => {
    const raw = JSON.stringify({ version: 1, settings: { quality: 'high', reducedMotion: 'yes', cameraSensitivity: 99 } });
    const loaded = new PersistenceService(memoryStorage({ [SAVE_KEY]: raw })).load();
    expect(loaded.notice).toBe('corrupt-reset');
    expect(loaded.document.settings.quality).toBe('high');
    expect(loaded.document.settings.reducedMotion).toBe(DEFAULT_SETTINGS.reducedMotion);
    expect(loaded.document.settings.cameraSensitivity).toBe(DEFAULT_SETTINGS.cameraSensitivity);
  });

  it('resets on version mismatch', () => {
    const raw = JSON.stringify({ version: 99, settings: DEFAULT_SETTINGS });
    expect(new PersistenceService(memoryStorage({ [SAVE_KEY]: raw })).load().notice).toBe('version-reset');
  });

  it('handles unavailable or throwing storage without crashing', () => {
    expect(new PersistenceService(null).load().notice).toBe('storage-unavailable');
    expect(new PersistenceService(null).save(createDefaultDocument())).toBe(false);
    const throwing: StorageLike = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => {},
    };
    const service = new PersistenceService(throwing);
    expect(service.load().notice).toBe('storage-unavailable');
    expect(service.save(createDefaultDocument())).toBe(false);
  });

  it('refuses to save invalid documents', () => {
    const doc = createDefaultDocument();
    (doc.settings as { cameraSensitivity: number }).cameraSensitivity = Number.NaN;
    expect(new PersistenceService(memoryStorage()).save(doc)).toBe(false);
  });
});
