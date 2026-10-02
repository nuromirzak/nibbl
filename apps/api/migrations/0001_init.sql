-- Nibbl schema v1. Spec section 6.5, plus `checks` in xp_windows and the counters table.
CREATE TABLE pets (
  serial          INTEGER PRIMARY KEY,
  machine_hash    TEXT UNIQUE NOT NULL,
  token_hash      TEXT NOT NULL,
  seed            INTEGER NOT NULL,
  genome_key      TEXT UNIQUE NOT NULL,
  visual_key      TEXT UNIQUE NOT NULL,
  tier            TEXT NOT NULL,
  shiny           INTEGER NOT NULL,
  genesis         INTEGER NOT NULL,
  name            TEXT,
  label           TEXT,
  xp              INTEGER NOT NULL DEFAULT 0,
  level           INTEGER NOT NULL DEFAULT 1,
  is_bot          INTEGER NOT NULL DEFAULT 0,
  is_hidden       INTEGER NOT NULL DEFAULT 0,
  hatched_at      INTEGER NOT NULL,
  last_sync_at    INTEGER,
  name_changed_at INTEGER,
  -- Write-path cooldowns (60 s): label changes and re-hatches of a known machine.
  label_changed_at INTEGER,
  rehatched_at    INTEGER
);

-- The 5-minute leaderboard rebuild walks this index instead of the whole table.
CREATE INDEX pets_board ON pets (is_hidden, xp DESC, serial);

CREATE TABLE xp_windows (
  serial  INTEGER NOT NULL,
  hour    INTEGER NOT NULL,
  pets    INTEGER NOT NULL DEFAULT 0,
  turns   INTEGER NOT NULL DEFAULT 0,
  checks  INTEGER NOT NULL DEFAULT 0,
  commits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (serial, hour)
) WITHOUT ROWID;

-- One row per (salted IP or IPv6 /64, UTC day): new hatches that day. Known-machine re-hatches never count.
CREATE TABLE hatch_ip (ip_hash TEXT PRIMARY KEY, count INTEGER NOT NULL, last_at INTEGER NOT NULL);
-- The cron prune deletes by last_at; without this it scans every row each tick.
CREATE INDEX hatch_ip_last ON hatch_ip (last_at);

CREATE TABLE leaderboard_cache (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, built_at INTEGER NOT NULL);

-- serial: last issued serial. hatched: real hatches only (bots never touch it). bot_hour: last UTC hour bots grew.
CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO counters (name, value) VALUES ('serial', 0), ('hatched', 0), ('bot_hour', 0);
