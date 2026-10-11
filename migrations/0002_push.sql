-- Devices subscribed to daily study reminders (Web Push).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  remind_at  TEXT NOT NULL, -- local time, HH:MM
  tz         TEXT NOT NULL, -- IANA time zone
  last_sent  TEXT,          -- study day (YYYY-MM-DD) the last reminder was handled for
  created_at INTEGER NOT NULL
);

-- Server-side settings, e.g. the VAPID keys used to sign pushes.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
