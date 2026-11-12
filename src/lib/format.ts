const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Convert ASCII digits in a string/number to Bangla digits. */
export function toBnDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

export function formatTaka(amount: number): string {
  return `৳${toBnDigits(Math.round(amount))}`;
}

/** Weight in kg with up to one decimal (e.g. "০.২ কেজি", "২ কেজি"). */
export function formatKg(kg: number): string {
  const rounded = Math.round(kg * 10) / 10;
  return `${toBnDigits(Number.isInteger(rounded) ? rounded : rounded.toFixed(1))} কেজি`;
}

/** Night clock "রাত ৩:০৫" from minutes past midnight. */
export function formatNightClock(minutesPastMidnight: number): string {
  const m = Math.floor(minutesPastMidnight);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `রাত ${toBnDigits(h)}:${toBnDigits(String(mm).padStart(2, '0'))}`;
}
