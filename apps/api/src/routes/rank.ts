import type { Deps, Env } from '../env'
import { HttpError, json } from '../lib/http'
import type { BoardEntry } from '../cron'

type RankRow = Omit<BoardEntry, 'rank' | 'shiny' | 'genesis'> & { shiny: number; genesis: number }

const SERIAL = /^\d{1,6}$/

// rank = 1 + visible pets ahead in leaderboard order (xp DESC, serial ASC); served by the pets_board index.
export const rank = async (request: Request, env: Env, _deps: Deps): Promise<Response> => {
  const raw = new URL(request.url).pathname.slice('/api/rank/'.length)
  const serial = SERIAL.test(raw) ? Number(raw) : 0
  if (serial < 1) throw new HttpError(400, 'invalid_serial')
  const pet = await env.DB.prepare(
    'SELECT serial, name, label, seed, tier, shiny, genesis, xp, level FROM pets WHERE serial = ? AND is_hidden = 0',
  )
    .bind(serial)
    .first<RankRow>()
  if (!pet) throw new HttpError(404, 'not_found')
  const ahead = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM pets WHERE is_hidden = 0 AND (xp > ? OR (xp = ? AND serial < ?))',
  )
    .bind(pet.xp, pet.xp, pet.serial)
    .first<number>('n')
  const entry: BoardEntry = { rank: (ahead ?? 0) + 1, ...pet, shiny: pet.shiny === 1, genesis: pet.genesis === 1 }
  return json(entry, 200, { 'cache-control': 'public, max-age=60' })
}
