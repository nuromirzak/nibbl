import type { Stage } from './draw'

export type EventType = 'pet' | 'turn' | 'check_pass' | 'commit' | 'error'
export type NibblEvent = { type: EventType; at: number }
export type HourWindow = Partial<Record<EventType, number>>
export type Windows = Record<number, HourWindow>

export const HOUR_MS = 3_600_000
const SYNC_GRACE_MS = 3 * HOUR_MS
const FIRST_SYNC_LOOKBACK_MS = 24 * HOUR_MS

export const XP_PER_EVENT: Record<EventType, number> = { pet: 2, turn: 3, check_pass: 2, commit: 2, error: 0 }
export const CAPS_PER_HOUR: Record<Exclude<EventType, 'error'>, number> = { pet: 5, turn: 20, check_pass: 20, commit: 10 }

const hourOf = (at: number) => Math.floor(at / HOUR_MS)
const isEventType = (t: unknown): t is EventType => typeof t === 'string' && t in XP_PER_EVENT

export const scoreEvents = (
  events: NibblEvent[],
  windows: Windows,
  now: number,
  lastSyncAt: number | null,
): { xpGained: number; windows: Windows; accepted: number } => {
  const oldest = lastSyncAt === null ? now - FIRST_SYNC_LOOKBACK_MS : lastSyncAt - SYNC_GRACE_MS
  const next: Windows = Object.fromEntries(Object.entries(windows).map(([h, w]) => [h, { ...w }]))
  let xpGained = 0
  let accepted = 0
  for (const e of events) {
    if (!isEventType(e.type) || !Number.isFinite(e.at) || e.at > now || e.at < oldest) continue
    if (e.type === 'error') continue
    const hour = hourOf(e.at)
    const window = (next[hour] ??= {})
    const used = window[e.type] ?? 0
    if (used >= CAPS_PER_HOUR[e.type]) continue
    window[e.type] = used + 1
    xpGained += XP_PER_EVENT[e.type]
    accepted++
  }
  return { xpGained, windows: next, accepted }
}

export const heartsLeft = (windows: Windows, now: number): number =>
  Math.max(0, CAPS_PER_HOUR.pet - (windows[hourOf(now)]?.pet ?? 0))

export const xpToNext = (level: number): number => Math.round(10 * level ** 1.4)

export const levelFromXp = (xp: number): { level: number; intoLevel: number; toNext: number } => {
  let level = 1
  let rest = Math.max(0, Math.floor(xp))
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level)
    level++
  }
  return { level, intoLevel: rest, toNext: xpToNext(level) }
}

export const stageForLevel = (level: number): Stage => (level >= 25 ? 'adult' : level >= 10 ? 'teen' : 'baby')
