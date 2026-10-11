import { Hono } from 'hono';
import { getVapid, pushTo, sendReminders, type SubscriptionRow } from './reminders';
import { isTimeZone, localParts, studyDay } from './schedule';

interface Env {
  DB: D1Database;
  /** Shared secret the app sends as a Bearer token. Set with `wrangler secret put SYNC_TOKEN`. */
  SYNC_TOKEN?: string;
}

interface Change {
  key: string;
  data: unknown;
  updatedAt: number;
}

const PAGE = 1000;
const MAX_PUSH = 500;
const KEY_RE = /^[cdm]:[\w:.-]{1,120}$/;

const app = new Hono<{ Bindings: Env }>().basePath('/api');

async function tokenMatches(given: string, expected: string) {
  const enc = new TextEncoder();
  const a = enc.encode(given);
  const b = enc.encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

app.use('*', async (c, next) => {
  const expected = c.env.SYNC_TOKEN;
  if (!expected) return c.json({ error: 'SYNC_TOKEN is not configured on the server' }, 503);
  const auth = c.req.header('authorization') ?? '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!(await tokenMatches(given, expected))) return c.json({ error: 'unauthorized' }, 401);
  await next();
});

app.get('/ping', async (c) => {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM records').first<{ n: number }>();
  return c.json({ ok: true, records: row?.n ?? 0 });
});

/**
 * Push local changes and pull everything newer than `since`.
 * Each record is last-write-wins on the client's updatedAt; `rev` is a server-side
 * counter so clients can pull incrementally.
 */
app.post('/sync', async (c) => {
  const body = await c.req.json<{ since?: number; changes?: Change[] }>().catch(() => null);
  if (!body) return c.json({ error: 'invalid JSON' }, 400);
  let since = Number(body.since) || 0;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (changes.length > MAX_PUSH) return c.json({ error: `max ${MAX_PUSH} changes per request` }, 413);

  const valid = changes.filter((ch) => typeof ch?.key === 'string' && KEY_RE.test(ch.key) && Number.isFinite(ch.updatedAt));
  if (valid.length) {
    const stmt = c.env.DB.prepare(
      `INSERT INTO records (key, data, updated_at, rev)
       VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(rev), 0) + 1 FROM records))
       ON CONFLICT (key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, rev = excluded.rev
       WHERE excluded.updated_at > records.updated_at`,
    );
    await c.env.DB.batch(valid.map((ch) => stmt.bind(ch.key, JSON.stringify(ch.data), Math.trunc(ch.updatedAt))));
  }

  // If the server was reset since this client last synced, start over from the beginning.
  const top = await c.env.DB.prepare('SELECT COALESCE(MAX(rev), 0) AS rev FROM records').first<{ rev: number }>();
  if (since > (top?.rev ?? 0)) since = 0;

  const { results } = await c.env.DB.prepare('SELECT key, data, updated_at, rev FROM records WHERE rev > ?1 ORDER BY rev LIMIT ?2')
    .bind(since, PAGE)
    .all<{ key: string; data: string; updated_at: number; rev: number }>();

  return c.json({
    rev: results.length ? results[results.length - 1].rev : since,
    more: results.length === PAGE,
    changes: results.map((r) => ({ key: r.key, data: JSON.parse(r.data), updatedAt: r.updated_at })),
  });
});

app.post('/reset', async (c) => {
  await c.env.DB.prepare('DELETE FROM records').run();
  return c.json({ ok: true });
});

// ---- Daily reminders (Web Push) ---------------------------------------------

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

app.get('/push/key', async (c) => {
  const vapid = await getVapid(c.env.DB, new URL(c.req.url).origin);
  return c.json({ publicKey: vapid!.publicKey });
});

app.post('/push/subscribe', async (c) => {
  const body = await c.req
    .json<{ subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; remindAt?: string; tz?: string }>()
    .catch(() => null);
  const endpoint = body?.subscription?.endpoint;
  const { p256dh, auth } = body?.subscription?.keys ?? {};
  const remindAt = body?.remindAt ?? '';
  const tz = body?.tz ?? '';
  if (!endpoint?.startsWith('https://') || !p256dh || !auth || !TIME_RE.test(remindAt) || !isTimeZone(tz)) return c.json({ error: 'invalid subscription' }, 400);
  // If the reminder time has already passed today, start from tomorrow rather than firing straight away.
  const now = Date.now();
  const day = studyDay(now, tz);
  const local = localParts(now, tz);
  const skipToday = local.date === day && local.time >= remindAt ? day : null;
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, remind_at, tz, last_sent, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, remind_at = excluded.remind_at, tz = excluded.tz,
       last_sent = COALESCE(excluded.last_sent, CASE WHEN push_subscriptions.remind_at = excluded.remind_at THEN push_subscriptions.last_sent END)`,
  )
    .bind(endpoint, p256dh, auth, remindAt, tz, skipToday, now)
    .run();
  return c.json({ ok: true });
});

app.post('/push/unsubscribe', async (c) => {
  const body = await c.req.json<{ endpoint?: string }>().catch(() => null);
  if (body?.endpoint) await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(body.endpoint).run();
  return c.json({ ok: true });
});

app.post('/push/test', async (c) => {
  const body = await c.req.json<{ endpoint?: string }>().catch(() => null);
  const sub = await c.env.DB.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?1').bind(body?.endpoint ?? '').first<SubscriptionRow>();
  if (!sub) return c.json({ error: 'This device is not subscribed' }, 404);
  const vapid = await getVapid(c.env.DB, new URL(c.req.url).origin);
  const res = await pushTo(c.env.DB, sub, { title: 'Riječi 🇭🇷', body: 'Reminders are working. Do viđenja!', url: '/' }, vapid!);
  return c.json({ ok: res.ok, status: res.status }, res.ok ? 200 : 502);
});

app.notFound((c) => c.json({ error: 'not found' }, 404));

export default {
  fetch: app.fetch,
  // Cron trigger (see wrangler.jsonc): send any reminders that are due.
  scheduled: (_event, env, ctx) => ctx.waitUntil(sendReminders(env)),
} satisfies ExportedHandler<Env>;
