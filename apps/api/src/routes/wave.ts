import type { Deps, Env } from '../env'
import { authPet } from '../lib/auth'
import { HttpError, json, MAX_SMALL_BYTES, readJson, serialOf } from '../lib/http'
import { isMissingSchema } from '../lib/retention'
import { DAY_MS } from './hatch'

export const WAVES_PER_DAY = 10

type Target = { serial: number; name: string | null }

// Both limits are re-checked in the INSERT itself, so two concurrent requests cannot both pass them.
export const wave = async (request: Request, env: Env, deps: Deps): Promise<Response> => {
  const body = await readJson(request, MAX_SMALL_BYTES)
  const pet = await authPet(env.DB, body)
  const to = serialOf(body.to)
  if (to === pet.serial) throw new HttpError(400, 'self_wave')
  const target = await env.DB.prepare('SELECT serial, name FROM pets WHERE serial = ? AND is_hidden = 0')
    .bind(to)
    .first<Target>()
  if (!target) throw new HttpError(404, 'not_found')

  const now = deps.now()
  const dayStart = Math.floor(now / DAY_MS) * DAY_MS
  const retryAt = dayStart + DAY_MS
  const insert = env.DB.prepare(
    `INSERT INTO waves (from_serial, to_serial, created_at)
     SELECT ?1, ?2, ?3
     WHERE (SELECT COUNT(*) FROM waves WHERE from_serial = ?1 AND created_at >= ?4) < ?5
       AND NOT EXISTS (SELECT 1 FROM waves WHERE from_serial = ?1 AND to_serial = ?2 AND created_at >= ?4)`,
  ).bind(pet.serial, to, now, dayStart, WAVES_PER_DAY)
  // changes() is the wave insert just above, so a refused wave counts nothing.
  const count = env.DB.prepare(
    `INSERT INTO pet_totals (serial, waves_sent) SELECT ?, 1 WHERE changes() > 0
     ON CONFLICT (serial) DO UPDATE SET waves_sent = waves_sent + 1`,
  ).bind(pet.serial)
  let result: D1Result
  try {
    ;[result] = (await env.DB.batch([insert, count])) as [D1Result, D1Result]
  } catch (err) {
    // Worker deployed before migration 0004: the wave still goes out, just uncounted.
    if (!isMissingSchema(err)) throw err
    result = await insert.run()
  }
  if (result.meta.changes === 0) {
    const again = await env.DB.prepare('SELECT 1 AS x FROM waves WHERE from_serial = ? AND to_serial = ? AND created_at >= ?')
      .bind(pet.serial, to, dayStart)
      .first()
    throw new HttpError(429, again ? 'already_waved' : 'wave_limit', { retryAt })
  }
  return json({ ok: true, to: { serial: target.serial, name: target.name } })
}
