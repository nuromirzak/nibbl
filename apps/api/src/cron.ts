import { HOUR_MS, levelFromXp } from '@nibbl/core'
import { BOT_CATCH_UP_HOURS, BOTS, botHourCounts, xpForCounts } from './bots'
import type { Env } from './env'
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

// Applies every completed UTC hour once, tracked in counters.bot_hour.
export const growBots = async (db: D1Database, now: number): Promise<number> => {
  const hour = Math.floor(now / HOUR_MS) - 1
  const last = (await db.prepare("SELECT value FROM counters WHERE name = 'bot_hour'").first<number>('value')) ?? 0
  if (last >= hour) return 0
  const from = Math.max(last + 1, hour - BOT_CATCH_UP_HOURS + 1)
  const { results } = await db.prepare('SELECT serial, xp FROM pets WHERE is_bot = 1 AND is_hidden = 0').all<{ serial: number; xp: number }>()
  const specs = new Map(BOTS.map(b => [b.serial, b]))
  const updates = results.map(bot => {
    const spec = specs.get(bot.serial) ?? { serial: bot.serial, tz: 0, owl: false }
    let gain = 0
    for (let h = from; h <= hour; h++) gain += xpForCounts(botHourCounts(spec, h))
    const xp = bot.xp + gain
    return db.prepare('UPDATE pets SET xp = ?, level = ? WHERE serial = ?').bind(xp, levelFromXp(xp).level, bot.serial)
  })
  await db.batch([...updates, db.prepare("UPDATE counters SET value = ? WHERE name = 'bot_hour'").bind(hour)])
  return hour - from + 1
}

// Each step is isolated so one failure cannot starve the others. Only err.message is logged
// (no PII), and an aggregate error is rethrown at the end so the failure shows in Workers logs.
export const runCron = async (env: Env, now: number): Promise<void> => {
  // Sequential, growth first, so the rebuilt leaderboard already includes this tick's bot XP.
  const steps: [string, () => Promise<unknown>][] = [
    ['growBots', () => growBots(env.DB, now)],
    ['rebuildLeaderboard', () => rebuildLeaderboard(env.DB, now)],
    ['pruneHatchIp', () => pruneHatchIp(env.DB, now)],
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
