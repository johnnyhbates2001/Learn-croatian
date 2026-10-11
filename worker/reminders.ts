// Daily study reminders: a cron trigger checks every 15 minutes and pushes to each
// subscribed device once its local reminder time has passed, unless today's goal is already met.
import { DEFAULT_GOAL, reminderDue, reminderMessage, streakBefore, type ReminderFacts } from './schedule';
import { generateVapidKeys, sendPush, type Vapid } from './webpush';

export interface ReminderEnv {
  DB: D1Database;
}

export interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** Local time, HH:MM. */
  remind_at: string;
  /** IANA time zone, e.g. Europe/Zagreb. */
  tz: string;
  /** Study day (YYYY-MM-DD) a reminder was last handled for. */
  last_sent: string | null;
}

async function recordData<T>(db: D1Database, key: string) {
  const row = await db.prepare('SELECT data FROM records WHERE key = ?1').bind(key).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as T) : null;
}

/** Build the facts for a study day from the synced records. */
export async function loadFacts(db: D1Database, day: string, now: number): Promise<ReminderFacts> {
  const [stats, settings, streakMeta, due, metDays] = await Promise.all([
    recordData<{ xp?: number; met?: boolean }>(db, `d:${day}`),
    recordData<{ dailyGoal?: number }>(db, 'm:settings'),
    recordData<{ frozen?: string[] }>(db, 'm:streak'),
    db.prepare("SELECT COUNT(*) AS n FROM records WHERE key LIKE 'c:%' AND json_extract(data, '$.due') <= ?1").bind(now).first<{ n: number }>(),
    db.prepare("SELECT key FROM records WHERE key LIKE 'd:%' AND json_extract(data, '$.met') = 1").all<{ key: string }>(),
  ]);
  const counted = new Set([...metDays.results.map((r) => r.key.slice(2)), ...(streakMeta?.frozen ?? [])]);
  return { due: due?.n ?? 0, streak: streakBefore(day, counted), xp: stats?.xp ?? 0, goal: settings?.dailyGoal ?? DEFAULT_GOAL, met: !!stats?.met };
}

// ---- VAPID keys -------------------------------------------------------------
// Generated on first use and kept in D1, so there's nothing to configure.

async function getMeta(db: D1Database, key: string) {
  const row = await db.prepare('SELECT value FROM meta WHERE key = ?1').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

const setMeta = (db: D1Database, key: string, value: string) =>
  db.prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, value).run();

/** Get (or create) the VAPID keys. `origin` is the site's URL, used as the contact address. */
export async function getVapid(db: D1Database, origin?: string): Promise<Vapid | null> {
  if (origin?.startsWith('https://') && (await getMeta(db, 'vapid_subject')) !== origin) await setMeta(db, 'vapid_subject', origin);
  const stored = await getMeta(db, 'vapid');
  let keys = stored ? (JSON.parse(stored) as Omit<Vapid, 'subject'>) : null;
  if (!keys) {
    if (!origin) return null;
    keys = await generateVapidKeys();
    // Another request may have raced us; keep whichever was stored first.
    await db.prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO NOTHING').bind('vapid', JSON.stringify(keys)).run();
    keys = JSON.parse((await getMeta(db, 'vapid'))!) as Omit<Vapid, 'subject'>;
  }
  return { ...keys, subject: (await getMeta(db, 'vapid_subject')) ?? 'mailto:reminders@example.com' };
}

/** Send a push; drops the subscription if the push service says it no longer exists. */
export async function pushTo(db: D1Database, sub: SubscriptionRow, message: unknown, vapid: Vapid) {
  const res = await sendPush(sub, message, vapid);
  if (res.status === 404 || res.status === 410) await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(sub.endpoint).run();
  else if (!res.ok) console.error(`push failed ${res.status}: ${await res.text().catch(() => '')}`);
  return res;
}

export async function sendReminders(env: ReminderEnv, now = Date.now()) {
  const { results: subs } = await env.DB.prepare('SELECT * FROM push_subscriptions').all<SubscriptionRow>();
  const ready = subs.map((s) => ({ s, day: reminderDue(s, now) })).filter((x): x is { s: SubscriptionRow; day: string } => !!x.day);
  if (!ready.length) return;
  const vapid = await getVapid(env.DB);
  if (!vapid) return;
  const facts = new Map<string, Promise<ReminderFacts>>();
  for (const { s, day } of ready) {
    if (!facts.has(day)) facts.set(day, loadFacts(env.DB, day, now));
    const message = reminderMessage(await facts.get(day)!);
    await env.DB.prepare('UPDATE push_subscriptions SET last_sent = ?1 WHERE endpoint = ?2').bind(day, s.endpoint).run();
    if (message) await pushTo(env.DB, s, message, vapid);
  }
}
