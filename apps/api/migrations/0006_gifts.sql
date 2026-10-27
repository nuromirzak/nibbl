-- Gift eggs and coding-today count (0.4.0).
-- Run this migration BEFORE deploying the Worker that uses it. Sync, hatch and the card still work
-- without it (they skip the gift parts), but no gift is recorded until it is applied.

-- One row per gift egg. Only the hash of the code is stored; the code itself is derived from the secret.
CREATE TABLE gift_codes (
  code_hash   TEXT PRIMARY KEY,
  from_serial INTEGER NOT NULL,
  milestone   INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  redeemed_by INTEGER,
  redeemed_at INTEGER,
  UNIQUE (from_serial, milestone)
);
CREATE INDEX gift_codes_redeemed_by ON gift_codes (redeemed_by);

-- 1 when the invited hatch came from a gift egg (so the toast can say it carries the mark).
ALTER TABLE invite_notices ADD COLUMN via_gift INTEGER NOT NULL DEFAULT 0;

-- Real, visible pets that synced in the last 24 h; the cron refreshes it.
INSERT OR IGNORE INTO counters (name, value) VALUES ('active_24h', 0);
