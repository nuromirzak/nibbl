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

// Task 8 adds growBots here.
export const runCron = async (env: Env, now: number): Promise<void> => {
  await rebuildLeaderboard(env.DB, now)
  await pruneHatchIp(env.DB, now)
}
