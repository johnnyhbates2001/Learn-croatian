// A "study day" rolls over at 03:00 local time, so late-night sessions count for the evening before.
const ROLLOVER_HOURS = 3;

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(ms = Date.now()) {
  const d = new Date(ms - ROLLOVER_HOURS * 3600_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Shift a YYYY-MM-DD key by n days. */
export function addDays(key: string, n: number) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function daysBetween(a: string, b: string) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400_000);
}

/** Day of week for a key, 0 = Monday. */
export function weekday(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return (new Date(y, m - 1, d, 12).getDay() + 6) % 7;
}
