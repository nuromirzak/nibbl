import type { Deps, Env } from '../env'
import { edgeCached } from '../lib/edge'
import { HttpError, json } from '../lib/http'
import { isMissingSchema } from '../lib/retention'

const SERIAL = /^\d{1,6}$/

type TotalsRow = { turns: number; checks: number; commits: number; errors: number; pets: number; waves_sent: number; active_days: number }

// Public, read-only profile: what the card shows, as JSON. Bots are public on the board, so they are served too.
export const pet = (request: Request, env: Env, _deps: Deps): Promise<Response> => edgeCached(request, 60, () => profile(request, env))

const profile = async (request: Request, env: Env): Promise<Response> => {
  const raw = new URL(request.url).pathname.slice('/api/pet/'.length)
  const serial = SERIAL.test(raw) ? Number(raw) : 0
  if (serial < 1) throw new HttpError(400, 'invalid_serial')
  const row = await env.DB.prepare(`SELECT p.serial, p.name, p.level,
       CASE WHEN q.is_hidden = 0 THEN p.invited_by END AS invited_by,
       CASE WHEN q.is_hidden = 0 THEN q.name END AS parent_name
       FROM pets p LEFT JOIN pets q ON q.serial = p.invited_by WHERE p.serial = ? AND p.is_hidden = 0`)
    .bind(serial)
    .first<{ serial: number; name: string | null; level: number; invited_by: number | null; parent_name: string | null }>()
  if (!row) throw new HttpError(404, 'not_found')
  const [totals, achievements, friends, wins] = await env.DB.batch([
    env.DB.prepare('SELECT turns, checks, commits, errors, pets, waves_sent, active_days FROM pet_totals WHERE serial = ?').bind(serial),
    env.DB.prepare('SELECT id, at FROM pet_achievements WHERE serial = ? ORDER BY at, id').bind(serial),
    env.DB.prepare('SELECT COUNT(*) AS n FROM pets WHERE invited_by = ? AND last_sync_at IS NOT NULL').bind(serial),
    env.DB.prepare('SELECT COUNT(*) AS n FROM week_winners WHERE serial = ?').bind(serial),
  ])
  const t = totals!.results[0] as TotalsRow | undefined
  let eggsHatched = 0
  try {
    eggsHatched = (await env.DB.prepare('SELECT COUNT(*) AS n FROM gift_codes WHERE from_serial = ? AND redeemed_by IS NOT NULL').bind(serial).first<number>('n')) ?? 0
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }
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
      parent: row.invited_by === null ? null : { serial: row.invited_by, name: row.parent_name },
      eggsHatched,
      friends: (friends!.results[0] as { n: number }).n,
      weekWins: (wins!.results[0] as { n: number }).n,
    },
    200,
    { 'cache-control': 'public, max-age=60' },
  )
}
