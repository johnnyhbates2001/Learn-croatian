// Pure scheduling and wording for daily reminders (no Worker APIs, so it's unit-testable).

// Must match ROLLOVER_HOURS in src/lib/dates.ts: a study day ends at 03:00 local time.
const ROLLOVER_HOURS = 3;
export const DEFAULT_GOAL = 100;

export function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Local date (YYYY-MM-DD) and time (HH:MM) in a time zone. */
export function localParts(ms: number, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** The study day a moment belongs to, as the app counts it (see dayKey in src/lib/dates.ts). */
export const studyDay = (ms: number, tz: string) => localParts(ms - ROLLOVER_HOURS * 3600_000, tz).date;

/** Should this subscription get a reminder now? Returns the study day to mark it sent for. */
export function reminderDue(sub: { remind_at: string; tz: string; last_sent: string | null }, now: number) {
  const day = studyDay(now, sub.tz);
  if (sub.last_sent === day) return null;
  // Between midnight and the rollover the study day is still "yesterday": don't remind then.
  const { date, time } = localParts(now, sub.tz);
  if (date !== day || time < sub.remind_at) return null;
  return day;
}

const shiftDay = (key: string, n: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Days in a row up to (not including) `today` that met the goal or were covered by a streak freeze. */
export function streakBefore(today: string, counted: Set<string>) {
  let n = 0;
  for (let k = shiftDay(today, -1); counted.has(k); k = shiftDay(k, -1)) n++;
  return n;
}

export interface ReminderFacts {
  /** Cards due for review now. */
  due: number;
  streak: number;
  xp: number;
  goal: number;
  met: boolean;
}

export function reminderMessage(f: ReminderFacts) {
  if (f.met || f.xp >= f.goal) return null;
  const keep = f.streak > 0 ? ` and keep your ${f.streak}-day streak` : '';
  if (f.xp > 0) return { title: 'Almost there! 🇭🇷', body: `${f.goal - f.xp} XP to go to reach today's goal${keep}.`, url: '/' };
  const what = f.due > 0 ? `${f.due} word${f.due === 1 ? ' is' : 's are'} ready for review` : 'Time to learn a few new words';
  return { title: 'Vrijeme je za hrvatski! 🇭🇷', body: f.streak > 0 ? `${what} — keep your ${f.streak}-day streak going!` : `${what}.`, url: '/' };
}
