import type { Deps, Env } from '../env'
import { edgeCached } from '../lib/edge'
import { json } from '../lib/http'
import { isoWeek } from '../lib/retention'

type Row = { serial: number; name: string | null; tier: string; shiny: number; seed: number; level: number; gain: number }
type Winner = Row & { week: string; retro: number }

const view = ({ shiny, ...r }: { shiny: number } & Omit<Row, 'shiny'>) => ({ ...r, shiny: shiny === 1 })

// Nibbl of the week: the current week so far, and the last finished winners. Real, visible pets only.
export const week = (request: Request, env: Env, deps: Deps): Promise<Response> => edgeCached(request, 300, () => weekBoard(env, deps))

const weekBoard = async (env: Env, deps: Deps): Promise<Response> => {
  const now = deps.now()
  const cur = isoWeek(now)
  // Without a snapshot "gain" would be lifetime xp, so the week board stays empty until the first rollover run.
  const snapped = (await env.DB.prepare("SELECT value FROM counters WHERE name = 'week'").first<number>('value')) ?? 0
  const [leaders, winners] = await env.DB.batch([
    env.DB.prepare(
      `SELECT p.serial, p.name, p.tier, p.shiny, p.seed, p.level, p.xp - COALESCE(s.xp, 0) AS gain
       FROM pets p LEFT JOIN week_snap s ON s.serial = p.serial
       WHERE ?1 > 0 AND p.is_bot = 0 AND p.is_hidden = 0 AND p.xp - COALESCE(s.xp, 0) > 0
       ORDER BY gain DESC, p.serial ASC LIMIT 5`,
    ).bind(snapped),
    env.DB.prepare(
      `SELECT w.week, p.serial, p.name, p.tier, p.shiny, p.seed, p.level, w.gain, w.retro
       FROM week_winners w JOIN pets p ON p.serial = w.serial WHERE p.is_hidden = 0 ORDER BY w.week DESC LIMIT 8`,
    ),
  ])
  return json(
    {
      week: cur.label,
      endsAt: cur.endsAt,
      leaders: (leaders!.results as Row[]).map(view),
      winners: (winners!.results as Winner[]).map(({ retro, ...w }) => ({ ...view(w), retro: retro === 1 })),
    },
    200,
    { 'cache-control': 'public, max-age=300' },
  )
}
