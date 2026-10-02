import {
  heartsLeft,
  HOUR_MS,
  levelFromXp,
  pruneWindows,
  scoreEvents,
  SYNC_GRACE_MS,
  type HourWindow,
  type NibblEvent,
  type Windows,
} from '@nibbl/core'
import type { Deps, Env } from '../env'
import { authPet } from '../lib/auth'
import { HttpError, json, MAX_SYNC_BYTES, readJson } from '../lib/http'

export const MAX_EVENTS = 1000
export const MIN_SYNC_INTERVAL_MS = 30_000

type WindowRow = { hour: number; pets: number; turns: number; checks: number; commits: number }
const KINDS = ['pet', 'turn', 'check_pass', 'commit'] as const

const toWindows = (rows: WindowRow[]): Windows =>
  Object.fromEntries(rows.map(r => [r.hour, { pet: r.pets, turn: r.turns, check_pass: r.checks, commit: r.commits }]))

const sameWindow = (a: HourWindow | undefined, b: HourWindow): boolean => KINDS.every(k => (a?.[k] ?? 0) === (b[k] ?? 0))

export const sync = async (request: Request, env: Env, deps: Deps): Promise<Response> => {
  const body = await readJson(request, MAX_SYNC_BYTES)
  const pet = await authPet(env.DB, body)
  const events = body.events
  if (!Array.isArray(events)) throw new HttpError(400, 'invalid_events')
  if (events.length > MAX_EVENTS) throw new HttpError(413, 'too_many_events')

  const last = pet.last_sync_at
  // Another colo can run a little behind; time never moves backwards for one pet.
  const now = Math.max(deps.now(), last ?? 0)
  if (last !== null && now - last < MIN_SYNC_INTERVAL_MS) {
    throw new HttpError(429, 'sync_too_soon', { retryAt: last + MIN_SYNC_INTERVAL_MS })
  }

  const { results } = await env.DB.prepare('SELECT hour, pets, turns, checks, commits FROM xp_windows WHERE serial = ?')
    .bind(pet.serial)
    .all<WindowRow>()
  const before = toWindows(results)
  const scored = scoreEvents(events as NibblEvent[], before, now, last)
  // Pruned with the same `now` that becomes last_sync_at, as core requires.
  const windows = pruneWindows(scored.windows, now)
  const xp = pet.xp + scored.xpGained
  const { level } = levelFromXp(xp)
  const oldestHour = Math.floor((now - SYNC_GRACE_MS) / HOUR_MS)

  // Window writes only land if this request won the last_sync_at race inside the transaction.
  const guard = 'EXISTS (SELECT 1 FROM pets WHERE serial = ? AND last_sync_at = ?)'
  const windowWrites = Object.entries(windows)
    .filter(([hour, w]) => !sameWindow(before[Number(hour)], w))
    .map(([hour, w]) =>
      env.DB.prepare(
        `INSERT INTO xp_windows (serial, hour, pets, turns, checks, commits)
         SELECT ?, ?, ?, ?, ?, ? WHERE ${guard}
         ON CONFLICT (serial, hour) DO UPDATE SET pets = excluded.pets, turns = excluded.turns, checks = excluded.checks, commits = excluded.commits`,
      ).bind(pet.serial, Number(hour), w.pet ?? 0, w.turn ?? 0, w.check_pass ?? 0, w.commit ?? 0, pet.serial, now),
    )

  const [update] = await env.DB.batch([
    env.DB.prepare('UPDATE pets SET xp = ?, level = ?, last_sync_at = ? WHERE serial = ? AND last_sync_at IS ?').bind(
      xp,
      level,
      now,
      pet.serial,
      last,
    ),
    env.DB.prepare(`DELETE FROM xp_windows WHERE serial = ? AND hour < ? AND ${guard}`).bind(pet.serial, oldestHour, pet.serial, now),
    ...windowWrites,
  ])
  if (update.meta.changes === 0) throw new HttpError(409, 'sync_conflict')
  return json({ xp, level, heartsLeft: heartsLeft(windows, now) })
}
