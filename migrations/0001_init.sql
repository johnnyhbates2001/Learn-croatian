-- One row per synced record. Keys are namespaced:
--   c:<wordId>:<r|p>  flashcard scheduling state
--   d:<YYYY-MM-DD>    daily activity (xp, reviews, ...)
--   m:<name>          settings, streak, achievements, flags
CREATE TABLE IF NOT EXISTS records (
  key        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL, -- client timestamp (ms), used for last-write-wins
  rev        INTEGER NOT NULL  -- server revision, used for incremental pulls
);
CREATE INDEX IF NOT EXISTS records_rev ON records (rev);
