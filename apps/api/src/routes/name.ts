import type { Deps, Env } from '../env'
import { authPet } from '../lib/auth'
import { checkText, LABEL_MAX, NAME_MAX } from '../lib/filter'
import { HttpError, json, MAX_SMALL_BYTES, readJson } from '../lib/http'
import { DAY_MS } from './hatch'

export const RENAME_EVERY_MS = 7 * DAY_MS

export const name = async (request: Request, env: Env, deps: Deps): Promise<Response> => {
  const body = await readJson(request, MAX_SMALL_BYTES)
  const pet = await authPet(env.DB, body)
  if (body.name === undefined && body.label === undefined) throw new HttpError(400, 'nothing_to_change')
  const now = deps.now()

  // Validate everything before writing, so a bad label never half-applies a new name.
  let nextName = pet.name
  let nameChangedAt = pet.name_changed_at
  if (body.name !== undefined) {
    const r = checkText(body.name, NAME_MAX)
    if (!r.ok) throw new HttpError(400, `name_${r.reason}`)
    if (r.value !== pet.name) {
      if (pet.name_changed_at !== null && now - pet.name_changed_at < RENAME_EVERY_MS) {
        throw new HttpError(429, 'name_rate_limited', { retryAt: pet.name_changed_at + RENAME_EVERY_MS })
      }
      nextName = r.value
      nameChangedAt = now
    }
  }

  let nextLabel = pet.label
  if (body.label === '' || body.label === null) nextLabel = null
  else if (body.label !== undefined) {
    const r = checkText(body.label, LABEL_MAX)
    if (!r.ok) throw new HttpError(400, `label_${r.reason}`)
    nextLabel = r.value
  }

  // A real rename is guarded in SQL so two concurrent requests cannot both pass the weekly limit.
  const renaming = nextName !== pet.name
  const result = renaming
    ? await env.DB.prepare(
        'UPDATE pets SET name = ?, label = ?, name_changed_at = ? WHERE serial = ? AND (name_changed_at IS NULL OR name_changed_at <= ?)',
      )
        .bind(nextName, nextLabel, nameChangedAt, pet.serial, now - RENAME_EVERY_MS)
        .run()
    : await env.DB.prepare('UPDATE pets SET label = ? WHERE serial = ?').bind(nextLabel, pet.serial).run()
  if (result.meta.changes === 0) {
    const fresh = await env.DB.prepare('SELECT name_changed_at FROM pets WHERE serial = ?')
      .bind(pet.serial)
      .first<{ name_changed_at: number | null }>()
    throw new HttpError(429, 'name_rate_limited', { retryAt: (fresh?.name_changed_at ?? now) + RENAME_EVERY_MS })
  }
  return json({ name: nextName, label: nextLabel })
}
