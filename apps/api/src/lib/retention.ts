import { HOUR_MS, SYNC_GRACE_MS, type Windows } from '@nibbl/core'

export const DAY_MS = 86_400_000
// Mirrors the first-sync lookback inside core's scoreEvents (not exported there).
const FIRST_SYNC_LOOKBACK_MS = 24 * HOUR_MS
// Errors are accepted but score nothing and are not stored per hour, so they get their own cap.
export const ERRORS_PER_HOUR = 20

// A deploy-order mistake (Worker live before migration 0004) must never break sync, hatch or waves.
export const isMissingSchema = (err: unknown): boolean =>
  err instanceof Error && /no such (table|column)|has no column named/i.test(err.message)

export type EventDelta = { turns: number; checks: number; commits: number; errors: number; pets: number; lastDay: number }

const sumKind = (before: Windows, after: Windows, kind: 'pet' | 'turn' | 'check_pass' | 'commit'): number =>
  Object.entries(after).reduce((n, [h, w]) => n + Math.max(0, (w[kind] ?? 0) - (before[Number(h)]?.[kind] ?? 0)), 0)

// What this sync adds to the lifetime totals. Scored kinds are the scorer's own accepted events
// (the per-hour window diff), so over-cap events never count. A replay can still re-count up to the hourly
// caps; errors are capped per hour within one request only. `events` are already clamped.
export const eventDelta = (events: unknown[], before: Windows, after: Windows, now: number, last: number | null): EventDelta => {
  const oldest = last === null ? now - FIRST_SYNC_LOOKBACK_MS : last - SYNC_GRACE_MS
  const errorsByHour = new Map<number, number>()
  let errors = 0
  let newest = -Infinity
  for (const e of events) {
    if (!e || typeof e !== 'object') continue
    const { type, at } = e as { type?: unknown; at?: unknown }
    if (typeof at !== 'number' || !Number.isFinite(at) || at > now || at < oldest) continue
    if (type !== 'pet' && type !== 'turn' && type !== 'check_pass' && type !== 'commit' && type !== 'error') continue
    newest = Math.max(newest, at)
    if (type !== 'error') continue
    const hour = Math.floor(at / HOUR_MS)
    const used = errorsByHour.get(hour) ?? 0
    if (used >= ERRORS_PER_HOUR) continue
    errorsByHour.set(hour, used + 1)
    errors++
  }
  return {
    turns: sumKind(before, after, 'turn'),
    checks: sumKind(before, after, 'check_pass'),
    commits: sumKind(before, after, 'commit'),
    pets: sumKind(before, after, 'pet'),
    errors,
    lastDay: Number.isFinite(newest) ? Math.floor(newest / DAY_MS) : 0,
  }
}

// ISO 8601 week in UTC. `key` = year * 100 + week, `label` = "2026-W43", `endsAt` = next Monday 00:00 UTC.
export const isoWeek = (ms: number): { key: number; label: string; endsAt: number } => {
  const dayStart = Math.floor(ms / DAY_MS) * DAY_MS
  const dow = (new Date(dayStart).getUTCDay() + 6) % 7 // Monday = 0
  const thursday = dayStart - dow * DAY_MS + 3 * DAY_MS
  const year = new Date(thursday).getUTCFullYear()
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1
  return { key: year * 100 + week, label: weekLabel(year * 100 + week), endsAt: dayStart - dow * DAY_MS + 7 * DAY_MS }
}

export const weekLabel = (key: number): string => `${Math.floor(key / 100)}-W${String(key % 100).padStart(2, '0')}`

// Releases before 0.3.0 drop the retention fields, so those are only delivered to 0.3.0+ clients.
// An unparseable version is treated as new; an absent one is old.
export const MIN_RETENTION_VERSION: readonly [number, number, number] = [0, 3, 0]

// `min` is "x.y.z". An unparseable `v` is treated as new; an absent (non-string) one is old.
export const atLeast = (v: unknown, min: string): boolean => {
  if (typeof v !== 'string') return false
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim())
  if (!m) return true
  const want = min.split('.').map(Number)
  const parts = [Number(m[1]), Number(m[2]), Number(m[3])]
  for (let i = 0; i < 3; i++) {
    if (parts[i]! !== want[i]!) return parts[i]! > want[i]!
  }
  return true
}

export const readsRetention = (v: unknown): boolean => atLeast(v, MIN_RETENTION_VERSION.join('.'))
