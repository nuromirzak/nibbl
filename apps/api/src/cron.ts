import { HOUR_MS, levelFromXp } from '@nibbl/core'
import { BOT_CATCH_UP_HOURS, BOTS, botHourCounts, xpForCounts } from './bots'
import type { Env } from './env'
import { isoWeek, weekLabel } from './lib/retention'
import { DAY_MS } from './routes/hatch'

export const LEADERBOARD_SIZE = 100

export type BoardEntry = {
  rank: number
  serial: number
  name: string | null
  label: string | null
  seed: number
  tier: string
  shiny: boolean
  genesis: boolean
  xp: number
  level: number
}
export type Board = { builtAt: number; entries: BoardEntry[] }

type BoardRow = Omit<BoardEntry, 'rank' | 'shiny' | 'genesis'> & { shiny: number; genesis: number }

// Walks the pets_board index, so a rebuild reads about LEADERBOARD_SIZE rows.
export const rebuildLeaderboard = async (db: D1Database, now: number): Promise<string> => {
  const { results } = await db
    .prepare(
      'SELECT serial, name, label, seed, tier, shiny, genesis, xp, level FROM pets WHERE is_hidden = 0 ORDER BY xp DESC, serial ASC LIMIT ?',
    )
    .bind(LEADERBOARD_SIZE)
    .all<BoardRow>()
  const board: Board = {
    builtAt: now,
    entries: results.map((r, i) => ({
      rank: i + 1,
      serial: r.serial,
      name: r.name,
      label: r.label,
      seed: r.seed,
      tier: r.tier,
      shiny: r.shiny === 1,
      genesis: r.genesis === 1,
      xp: r.xp,
      level: r.level,
    })),
  }
  const text = JSON.stringify(board)
  await db
    .prepare(
      'INSERT INTO leaderboard_cache (id, json, built_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json, built_at = excluded.built_at',
    )
    .bind(text, now)
    .run()
  return text
}

export const pruneHatchIp = async (db: D1Database, now: number): Promise<void> => {
  await db.prepare('DELETE FROM hatch_ip WHERE last_at < ?').bind(now - 2 * DAY_MS).run()
}

export const WAVE_KEEP_MS = 30 * DAY_MS

// Delivered waves go once the UTC day they were sent ends (until then they still count toward the
// daily wave limits); undelivered ones expire after 30 days, e.g. waves at bots or at pets that never sync.
export const pruneWaves = async (db: D1Database, now: number): Promise<void> => {
  const dayStart = Math.floor(now / DAY_MS) * DAY_MS
  await db
    .prepare('DELETE FROM waves WHERE (delivered = 1 AND created_at < ?) OR created_at < ?')
    .bind(dayStart, now - WAVE_KEEP_MS)
    .run()
}

// Bots hold the lowest serials, so the primary key bounds this read to them, not the whole table.
// is_hidden stays out of the WHERE: with it SQLite prefers pets_board and walks every visible pet.
export const BOT_MAX_SERIAL = Math.max(...BOTS.map(b => b.serial))
export const BOT_ROWS_SQL = 'SELECT serial, xp, is_hidden FROM pets WHERE serial <= ? AND is_bot = 1 ORDER BY serial'

// Applies every completed UTC hour once, tracked in counters.bot_hour.
export const growBots = async (db: D1Database, now: number): Promise<number> => {
  const hour = Math.floor(now / HOUR_MS) - 1
  const last = (await db.prepare("SELECT value FROM counters WHERE name = 'bot_hour'").first<number>('value')) ?? 0
  if (last >= hour) return 0
  const from = Math.max(last + 1, hour - BOT_CATCH_UP_HOURS + 1)
  const { results } = await db.prepare(BOT_ROWS_SQL).bind(BOT_MAX_SERIAL).all<{ serial: number; xp: number; is_hidden: number }>()
  const specs = new Map(BOTS.map(b => [b.serial, b]))
  const updates = results.filter(bot => bot.is_hidden === 0).map(bot => {
    const spec = specs.get(bot.serial) ?? { serial: bot.serial, tz: 0, owl: false }
    let gain = 0
    for (let h = from; h <= hour; h++) gain += xpForCounts(botHourCounts(spec, h))
    const xp = bot.xp + gain
    const level = levelFromXp(xp).level
    if (gain === 0) return db.prepare('UPDATE pets SET xp = ?, level = ? WHERE serial = ?').bind(xp, level, bot.serial)
    // A bot that gained XP last synced at the end of the last applied hour.
    return db.prepare('UPDATE pets SET xp = ?, level = ?, last_sync_at = ? WHERE serial = ?').bind(xp, level, (hour + 1) * HOUR_MS, bot.serial)
  })
  await db.batch([...updates, db.prepare("UPDATE counters SET value = ? WHERE name = 'bot_hour'").bind(hour)])
  return hour - from + 1
}

export const ACTIVE_WINDOW_MS = DAY_MS

// Real, visible pets that synced within the last 24 h. Bots keep a fresh last_sync_at, so they are excluded.
export const countActive = async (db: D1Database, now: number): Promise<void> => {
  await db
    .prepare(
      `INSERT INTO counters (name, value) SELECT 'active_24h', COUNT(*) FROM pets WHERE is_bot = 0 AND is_hidden = 0 AND last_sync_at > ?
       ON CONFLICT (name) DO UPDATE SET value = excluded.value`,
    )
    .bind(now - ACTIVE_WINDOW_MS)
    .run()
}

// Nibbl of the week. counters.week holds the ISO week (year * 100 + week) the snapshot belongs to, 0 = none yet.
// First run only snapshots. When the week changes, the real, visible pet with the biggest xp gain since the
// snapshot wins the finished week (ties: lower serial; a pet without a snapshot row counts from 0), then the
// snapshot is replaced. All in one batch, so a failed run leaves the old week to be rolled again.
export const weekRollover = async (db: D1Database, now: number): Promise<void> => {
  const cur = isoWeek(now).key
  const stored = (await db.prepare("SELECT value FROM counters WHERE name = 'week'").first<number>('value')) ?? 0
  if (stored === cur) return
  const resnap = [
    db.prepare('DELETE FROM week_snap'),
    db.prepare('INSERT INTO week_snap (serial, xp) SELECT serial, xp FROM pets'),
    db.prepare("INSERT INTO counters (name, value) VALUES ('week', ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value").bind(cur),
  ]
  if (stored === 0) {
    await db.batch(resnap)
    return
  }
  const winner = await db
    .prepare(
      `SELECT p.serial, p.xp - COALESCE(s.xp, 0) AS gain FROM pets p LEFT JOIN week_snap s ON s.serial = p.serial
       WHERE p.is_bot = 0 AND p.is_hidden = 0 AND p.xp - COALESCE(s.xp, 0) > 0 ORDER BY gain DESC, p.serial ASC LIMIT 1`,
    )
    .first<{ serial: number; gain: number }>()
  const award = winner
    ? [
        db.prepare('INSERT OR IGNORE INTO week_winners (week, serial, gain, at) VALUES (?, ?, ?, ?)').bind(weekLabel(stored), winner.serial, winner.gain, now),
        // Tied to the stored row, so a lost week_winners insert (already won) can never award a second time.
        db.prepare("INSERT OR IGNORE INTO pet_achievements (serial, id, at, reported) SELECT serial, 'week', ?, 0 FROM week_winners WHERE week = ?").bind(now, weekLabel(stored)),
      ]
    : []
  await db.batch([...award, ...resnap])
}

// Each step is isolated so one failure cannot starve the others. Only err.message is logged
// (no PII), and an aggregate error is rethrown at the end so the failure shows in Workers logs.
export const runCron = async (env: Env, now: number): Promise<void> => {
  // Sequential, growth first, so the rebuilt leaderboard already includes this tick's bot XP.
  const steps: [string, () => Promise<unknown>][] = [
    ['growBots', () => growBots(env.DB, now)],
    ['rebuildLeaderboard', () => rebuildLeaderboard(env.DB, now)],
    ['weekRollover', () => weekRollover(env.DB, now)],
    ['pruneHatchIp', () => pruneHatchIp(env.DB, now)],
    ['pruneWaves', () => pruneWaves(env.DB, now)],
    ['countActive', () => countActive(env.DB, now)],
  ]
  const failed: string[] = []
  for (const [name, run] of steps) {
    try {
      await run()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failed.push(`${name}: ${message}`)
      console.error(`cron step ${name} failed: ${message}`)
    }
  }
  if (failed.length > 0) throw new Error(`cron failed: ${failed.join('; ')}`)
}
