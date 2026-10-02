import type { Deps, Env } from '../env'
import { authPet } from '../lib/auth'
import { checkText, LABEL_MAX, NAME_MAX } from '../lib/filter'
import { HttpError, json, MAX_SMALL_BYTES, readJson } from '../lib/http'
import { DAY_MS } from './hatch'

export const RENAME_EVERY_MS = 7 * DAY_MS
// Labels are free to change, but not as a write loop: one change per minute per pet.
export const RELABEL_EVERY_MS = 60_000

type Stamps = { name_changed_at: number | null; label_changed_at: number | null }

const limitError = (stamps: Stamps, renaming: boolean, relabeling: boolean, now: number): HttpError | null => {
  if (renaming && stamps.name_changed_at !== null && now - stamps.name_changed_at < RENAME_EVERY_MS) {
    return new HttpError(429, 'name_rate_limited', { retryAt: stamps.name_changed_at + RENAME_EVERY_MS })
  }
  if (relabeling && stamps.label_changed_at !== null && now - stamps.label_changed_at < RELABEL_EVERY_MS) {
    return new HttpError(429, 'label_rate_limited', { retryAt: stamps.label_changed_at + RELABEL_EVERY_MS })
  }
  return null
}

export const name = async (request: Request, env: Env, deps: Deps): Promise<Response> => {
  const body = await readJson(request, MAX_SMALL_BYTES)
  const pet = await authPet(env.DB, body)
  if (body.name === undefined && body.label === undefined) throw new HttpError(400, 'nothing_to_change')
  const now = deps.now()

  // Validate everything before writing, so a bad label never half-applies a new name.
  let nextName = pet.name
  if (body.name !== undefined) {
    const r = checkText(body.name, NAME_MAX)
    if (!r.ok) throw new HttpError(400, `name_${r.reason}`)
    nextName = r.value
  }
  let nextLabel = pet.label
  if (body.label === '' || body.label === null) nextLabel = null
  else if (body.label !== undefined) {
    const r = checkText(body.label, LABEL_MAX)
    if (!r.ok) throw new HttpError(400, `label_${r.reason}`)
    nextLabel = r.value
  }

  const renaming = nextName !== pet.name
  const relabeling = nextLabel !== pet.label
  // Resending the current values writes nothing.
  if (!renaming && !relabeling) return json({ name: nextName, label: nextLabel })
  const early = limitError(pet, renaming, relabeling, now)
  if (early) throw early

  // Each limit is also guarded in SQL, so two concurrent requests cannot both pass it.
  const sets: string[] = []
  const guards: string[] = []
  const binds: (string | number | null)[] = []
  if (renaming) {
    sets.push('name = ?', 'name_changed_at = ?')
    binds.push(nextName, now)
  }
  if (relabeling) {
    sets.push('label = ?', 'label_changed_at = ?')
    binds.push(nextLabel, now)
  }
  binds.push(pet.serial)
  if (renaming) {
    guards.push('(name_changed_at IS NULL OR name_changed_at <= ?)')
    binds.push(now - RENAME_EVERY_MS)
  }
  if (relabeling) {
    guards.push('(label_changed_at IS NULL OR label_changed_at <= ?)')
    binds.push(now - RELABEL_EVERY_MS)
  }
  const result = await env.DB.prepare(`UPDATE pets SET ${sets.join(', ')} WHERE serial = ? AND ${guards.join(' AND ')}`)
    .bind(...binds)
    .run()
  if (result.meta.changes === 0) {
    const fresh = await env.DB.prepare('SELECT name_changed_at, label_changed_at FROM pets WHERE serial = ?').bind(pet.serial).first<Stamps>()
    throw limitError(fresh ?? { name_changed_at: now, label_changed_at: now }, renaming, relabeling, now) ?? new HttpError(409, 'name_conflict')
  }
  return json({ name: nextName, label: nextLabel })
}
