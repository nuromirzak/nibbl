-- Waves: a one-tap hello from one pet to another. No text, no XP. Limits are enforced in src/routes/wave.ts.
CREATE TABLE waves (
  id          INTEGER PRIMARY KEY,
  from_serial INTEGER NOT NULL,
  to_serial   INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  delivered   INTEGER NOT NULL DEFAULT 0
);
-- Sync reads undelivered waves for one pet.
CREATE INDEX waves_inbox ON waves (to_serial, delivered);
-- The daily limits count one sender's waves since UTC midnight.
CREATE INDEX waves_sent ON waves (from_serial, created_at);
