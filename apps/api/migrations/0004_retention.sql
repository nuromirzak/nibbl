-- Retention (0.3.0): lifetime totals, achievements, invites, Nibbl of the week.
-- Run this migration BEFORE deploying the Worker that uses it. Sync and hatch still work
-- without it (they skip the retention parts), but nothing is recorded until it is applied.

-- Lifetime counts of accepted events per pet. xp_windows is pruned to a few hours and holds no errors.
CREATE TABLE pet_totals (
  serial      INTEGER PRIMARY KEY,
  turns       INTEGER NOT NULL DEFAULT 0,
  checks      INTEGER NOT NULL DEFAULT 0,
  commits     INTEGER NOT NULL DEFAULT 0,
  errors      INTEGER NOT NULL DEFAULT 0,
  pets        INTEGER NOT NULL DEFAULT 0,
  waves_sent  INTEGER NOT NULL DEFAULT 0,
  active_days INTEGER NOT NULL DEFAULT 0,
  -- UTC day number (ms / 86400000) of the newest event counted so far.
  last_day    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE pet_achievements (
  serial INTEGER NOT NULL,
  id     TEXT NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (serial, id)
) WITHOUT ROWID;

-- Serial of the pet whose invite code this pet hatched with.
ALTER TABLE pets ADD COLUMN invited_by INTEGER;
CREATE INDEX pets_invited_by ON pets (invited_by);

-- One row per invited hatch, delivered to the inviter by their next sync.
CREATE TABLE invite_notices (
  id          INTEGER PRIMARY KEY,
  to_serial   INTEGER NOT NULL,
  from_serial INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  delivered   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX invite_notices_inbox ON invite_notices (to_serial, delivered);

-- Nibbl of the week: xp at the start of the current week, and one row per finished week.
CREATE TABLE week_snap (serial INTEGER PRIMARY KEY, xp INTEGER NOT NULL);
CREATE TABLE week_winners (
  week      TEXT PRIMARY KEY,
  serial    INTEGER NOT NULL,
  gain      INTEGER NOT NULL,
  at        INTEGER NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0
);

-- Current ISO week as year * 100 + week (e.g. 202643). 0 means no snapshot has been taken yet.
INSERT INTO counters (name, value) VALUES ('week', 0);
