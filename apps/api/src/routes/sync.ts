import {
  heartsLeft,
  unlockedIds,
  ZERO_TOTALS,
  type AchievementFacts,
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
import { eventDelta, isMissingSchema } from '../lib/retention'

export const MAX_EVENTS = 1000
export const MIN_SYNC_INTERVAL_MS = 30_000
export const MAX_CLOCK_SKEW_MS = 5 * 60_000

type WindowRow = { hour: number; pets: number; turns: number; checks: number; commits: number }
const KINDS = ['pet', 'turn', 'check_pass', 'commit'] as const

const toWindows = (rows: WindowRow[]): Windows =>
  Object.fromEntries(rows.map(r => [r.hour, { pet: r.pets, turn: r.turns, check_pass: r.checks, commit: r.commits }]))

// Nothing counts from before the pet existed, so a first sync cannot claim the core's 24 h
// lookback for a pet hatched a minute ago. A client clock up to 5 min fast is pulled back to
// `now`; anything further ahead is dropped. Junk entries pass through for core to reject.
export const clampEvents = (events: unknown[], hatchedAt: number, now: number): unknown[] =>
  events.flatMap(e => {
    if (!e || typeof e !== 'object') return [e]
    const at = (e as { at?: unknown }).at
    if (typeof at !== 'number' || !Number.isFinite(at)) return [e]
    if (at < hatchedAt || at > now + MAX_CLOCK_SKEW_MS) return []
    return [at > now ? { ...e, at: now } : e]
  })

const sameWindow = (a: HourWindow | undefined, b: HourWindow): boolean => KINDS.every(k => (a?.[k] ?? 0) === (b[k] ?? 0))

type InviteRow = { id: number; serial: number; name: string | null }
type WeekWinRow = { week: string; gain: number }

const readInvites = async (db: D1Database, serial: number): Promise<InviteRow[]> => {
  try {
    const { results } = await db
      .prepare(
        `SELECT n.id, n.from_serial AS serial, p.name FROM invite_notices n JOIN pets p ON p.serial = n.from_serial
         WHERE n.to_serial = ? AND n.delivered = 0 ORDER BY n.id LIMIT 5`,
      )
      .bind(serial)
      .all<InviteRow>()
    return results
  } catch (err) {
    if (isMissingSchema(err)) return []
    throw err
  }
}

const readWeekWin = async (db: D1Database, serial: number): Promise<WeekWinRow | null> => {
  try {
    return await db
      .prepare('SELECT week, gain FROM week_winners WHERE serial = ? AND delivered = 0 ORDER BY at LIMIT 1')
      .bind(serial)
      .first<WeekWinRow>()
  } catch (err) {
    if (isMissingSchema(err)) return null
    throw err
  }
}

// `reads` = [totals, existing achievements, friends flag, week wins, ...marks], all taken after the totals upsert.
// Only ids this call actually inserted are returned, so a retried or concurrent sync cannot report one twice.
const awardUnlocks = async (db: D1Database, serial: number, level: number, now: number, reads: D1Result[]): Promise<string[]> => {
  const [totalsRes, haveRes, friendsRes, winsRes] = reads
  const t = totalsRes!.results[0] as { turns: number; checks: number; commits: number; errors: number; pets: number; waves_sent: number; active_days: number } | undefined
  const facts: AchievementFacts = {
    ...ZERO_TOTALS,
    ...(t && { turns: t.turns, checks: t.checks, commits: t.commits, errors: t.errors, pets: t.pets, wavesSent: t.waves_sent, activeDays: t.active_days }),
    level,
    friends: ((friendsRes!.results[0] as { f: number } | undefined)?.f ?? 0) === 1,
    weekWins: (winsRes!.results[0] as { n: number } | undefined)?.n ?? 0,
  }
  const have = new Set((haveRes!.results as { id: string }[]).map(r => r.id))
  const fresh = unlockedIds(facts).filter(id => !have.has(id))
  if (fresh.length === 0) return []
  const inserted = await db.batch(
    fresh.map(id => db.prepare('INSERT OR IGNORE INTO pet_achievements (serial, id, at) VALUES (?, ?, ?)').bind(serial, id, now)),
  )
  return fresh.filter((_, i) => inserted[i]!.meta.changes === 1)
}

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
  const clamped = clampEvents(events, pet.hatched_at, now)
  const scored = scoreEvents(clamped as NibblEvent[], before, now, last)
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

  // Only a 0.2.0+ client (it sends `v`) reads the social fields, so only it consumes waves or costs a rank query.
  const isSocial = typeof body.v === 'string'
  const wantsRank = isSocial && body.rank === true
  const inbox = isSocial
    ? (
        await env.DB.prepare(
          `SELECT w.id, w.from_serial AS "from", p.name FROM waves w JOIN pets p ON p.serial = w.from_serial
           WHERE w.to_serial = ? AND w.delivered = 0 AND p.is_hidden = 0 ORDER BY w.id LIMIT 5`,
        )
          .bind(pet.serial)
          .all<{ id: number; from: number; name: string | null }>()
      ).results
    : []
  // Retention reads (invites, week win) must never break a sync, e.g. before migration 0004 is applied.
  const invites = isSocial ? await readInvites(env.DB, pet.serial) : []
  const weekWin = isSocial ? await readWeekWin(env.DB, pet.serial) : null
  // Marked delivered in the same batch, behind the same last_sync_at guard, so a lost race delivers nothing twice.
  const markDelivered = inbox.map(w =>
    env.DB.prepare(`UPDATE waves SET delivered = 1 WHERE id = ? AND delivered = 0 AND ${guard}`).bind(w.id, pet.serial, now),
  )
  // Rank reads ride in the same batch as the write, so a committed sync cannot fail afterwards. The
  // position cost is O(rows above this pet) per request: see docs/decisions/0016-social-v0-2.md.
  // Same ordering as routes/rank.ts: xp DESC, serial ASC, hidden pets excluded.
  const rankReads =
    wantsRank && pet.is_hidden === 0
      ? [
          env.DB.prepare('SELECT COUNT(*) AS n FROM pets WHERE is_hidden = 0 AND (xp > ? OR (xp = ? AND serial < ?))').bind(xp, xp, pet.serial),
          env.DB.prepare("SELECT value AS n FROM counters WHERE name = 'hatched'"),
          env.DB.prepare(
            `SELECT serial, name, tier, xp FROM pets WHERE is_hidden = 0 AND (xp > ? OR (xp = ? AND serial < ?))
             ORDER BY xp ASC, serial DESC LIMIT 1`,
          ).bind(xp, xp, pet.serial),
        ]
      : []

  const core = [
    env.DB.prepare('UPDATE pets SET xp = ?, level = ?, last_sync_at = ? WHERE serial = ? AND last_sync_at IS ?').bind(
      xp,
      level,
      now,
      pet.serial,
      last,
    ),
    env.DB.prepare(`DELETE FROM xp_windows WHERE serial = ? AND hour < ? AND ${guard}`).bind(pet.serial, oldestHour, pet.serial, now),
    ...windowWrites,
    ...markDelivered,
    ...rankReads,
  ]

  // Lifetime totals count what the scorer accepted, behind the same guard as the window writes, so a 409
  // or a lost race counts nothing. active_days grows when the newest event falls on a later UTC day.
  const d = eventDelta(clamped, before, scored.windows, now, last)
  const retention = [
    env.DB.prepare(
      `INSERT INTO pet_totals (serial, turns, checks, commits, errors, pets, active_days, last_day)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, CASE WHEN ?7 > 0 THEN 1 ELSE 0 END, ?7 WHERE EXISTS (SELECT 1 FROM pets WHERE serial = ?1 AND last_sync_at = ?8)
       ON CONFLICT (serial) DO UPDATE SET turns = turns + excluded.turns, checks = checks + excluded.checks,
         commits = commits + excluded.commits, errors = errors + excluded.errors, pets = pets + excluded.pets,
         active_days = active_days + CASE WHEN excluded.last_day > last_day THEN 1 ELSE 0 END,
         last_day = MAX(last_day, excluded.last_day)`,
    ).bind(pet.serial, d.turns, d.checks, d.commits, d.errors, d.pets, d.lastDay, now),
    ...(isSocial
      ? [
          env.DB.prepare('SELECT turns, checks, commits, errors, pets, waves_sent, active_days FROM pet_totals WHERE serial = ?').bind(pet.serial),
          env.DB.prepare('SELECT id FROM pet_achievements WHERE serial = ?').bind(pet.serial),
          env.DB.prepare(
            'SELECT (invited_by IS NOT NULL OR EXISTS (SELECT 1 FROM pets WHERE invited_by = ?1)) AS f FROM pets WHERE serial = ?1',
          ).bind(pet.serial),
          env.DB.prepare('SELECT COUNT(*) AS n FROM week_winners WHERE serial = ?').bind(pet.serial),
          ...invites.map(i => env.DB.prepare(`UPDATE invite_notices SET delivered = 1 WHERE id = ? AND delivered = 0 AND ${guard}`).bind(i.id, pet.serial, now)),
          ...(weekWin
            ? [env.DB.prepare(`UPDATE week_winners SET delivered = 1 WHERE week = ? AND delivered = 0 AND ${guard}`).bind(weekWin.week, pet.serial, now)]
            : []),
        ]
      : []),
  ]

  let done: D1Result[]
  let retained = true
  try {
    done = await env.DB.batch([...core, ...retention])
  } catch (err) {
    // Worker deployed before migration 0004: sync still works, retention is skipped until it is applied.
    if (!isMissingSchema(err)) throw err
    retained = false
    done = await env.DB.batch(core)
  }
  const [update] = done
  const rest = done.slice(1, core.length)
  if (update!.meta.changes === 0) throw new HttpError(409, 'sync_conflict')

  let unlocked: string[] = []
  if (isSocial && retained) {
    try {
      unlocked = await awardUnlocks(env.DB, pet.serial, level, now, done.slice(core.length + 1))
    } catch (err) {
      // The sync is committed; anything missed is awarded by the next one, which recomputes from the totals.
      console.error('unlock failed', err instanceof Error ? err.message : String(err))
    }
  }

  const base = { xp, level, heartsLeft: heartsLeft(windows, now) }
  if (!isSocial) return json({ ...base, latest: env.LATEST_VERSION })
  const social: Record<string, unknown> = {
    waves: inbox.map(w => ({ from: w.from, name: w.name })),
    unlocked,
    invites: retained ? invites.map(i => ({ serial: i.serial, name: i.name })) : [],
    weekWin: retained && weekWin ? { week: weekWin.week, gain: weekWin.gain } : null,
  }
  if (wantsRank) {
    if (pet.is_hidden === 1) social.rank = null
    else {
      const [aheadRes, totalRes, aboveRes] = rest.slice(rest.length - 3)
      const ahead = (aheadRes!.results[0] as { n: number }).n
      const hatched = (totalRes!.results[0] as { n: number } | undefined)?.n ?? 0
      const above = (aboveRes!.results[0] as { serial: number; name: string | null; tier: string; xp: number } | undefined) ?? null
      // `hatched` counts every pet ever hatched (bots included, hidden pets too): an upper bound, never below the position.
      social.rank = { pos: ahead + 1, total: Math.max(hatched, ahead + 1), above }
    }
  }
  return json({ ...base, ...social, latest: env.LATEST_VERSION })
}
