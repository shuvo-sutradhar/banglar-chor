import { bn, type StringKey } from './bn';

export type Locale = 'bn';

/**
 * Minimal localization layer. Bangla is the only shipped locale; an English table can be
 * added later as `Partial<Record<StringKey, string>>` with Bangla as the fallback.
 */
const tables: Record<Locale, Record<StringKey, string>> = { bn };

let activeLocale: Locale = 'bn';

export function setLocale(locale: Locale): void {
  activeLocale = locale;
}

export function t(key: StringKey): string {
  return tables[activeLocale][key] ?? bn[key];
}

export type { StringKey };
