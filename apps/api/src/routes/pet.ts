import type { Deps, Env } from '../env'
import { HttpError, json } from '../lib/http'

const SERIAL = /^\d{1,6}$/

type TotalsRow = { turns: number; checks: number; commits: number; errors: number; pets: number; waves_sent: number; active_days: number }

// Public, read-only profile: what the card shows, as JSON. Bots are public on the board, so they are served too.
export const pet = async (request: Request, env: Env, _deps: Deps): Promise<Response> => {
  const raw = new URL(request.url).pathname.slice('/api/pet/'.length)
  const serial = SERIAL.test(raw) ? Number(raw) : 0
  if (serial < 1) throw new HttpError(400, 'invalid_serial')
  const row = await env.DB.prepare('SELECT serial, name, level, invited_by FROM pets WHERE serial = ? AND is_hidden = 0')
    .bind(serial)
    .first<{ serial: number; name: string | null; level: number; invited_by: number | null }>()
  if (!row) throw new HttpError(404, 'not_found')
  const [totals, achievements, friends, wins] = await env.DB.batch([
    env.DB.prepare('SELECT turns, checks, commits, errors, pets, waves_sent, active_days FROM pet_totals WHERE serial = ?').bind(serial),
    env.DB.prepare('SELECT id, at FROM pet_achievements WHERE serial = ? ORDER BY at, id').bind(serial),
    env.DB.prepare('SELECT COUNT(*) AS n FROM pets WHERE invited_by = ?').bind(serial),
    env.DB.prepare('SELECT COUNT(*) AS n FROM week_winners WHERE serial = ?').bind(serial),
  ])
  const t = totals!.results[0] as TotalsRow | undefined
  return json(
    {
      serial: row.serial,
      name: row.name,
      level: row.level,
      totals: {
        turns: t?.turns ?? 0,
        checks: t?.checks ?? 0,
        commits: t?.commits ?? 0,
        errors: t?.errors ?? 0,
        pets: t?.pets ?? 0,
        wavesSent: t?.waves_sent ?? 0,
        activeDays: t?.active_days ?? 0,
      },
      achievements: achievements!.results as { id: string; at: number }[],
      invitedBy: row.invited_by,
      friends: (friends!.results[0] as { n: number }).n,
      weekWins: (wins!.results[0] as { n: number }).n,
    },
    200,
    { 'cache-control': 'public, max-age=60' },
  )
}
