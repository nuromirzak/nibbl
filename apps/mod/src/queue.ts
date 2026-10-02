import { CAPS_PER_HOUR, HOUR_MS, scoreEvents, type EventType, type NibblEvent, type Windows } from '@nibbl/core'

import { MAX_BATCH, ORPHAN_MS, QUEUE_CAP, SYNC_EVERY_MS, SYNC_SOON_PENDING } from './config'

export type ModEventType = EventType | 'hide'
// n: sequence number within its queue; g: the XP this event earned locally (never sent).
export type QueuedEvent = { type: ModEventType; at: number; n: number; g: number }
export type Queue = { beat: number; next: number; events: QueuedEvent[] }
export type WireEvent = { type: ModEventType; at: number }
export type Batch = { events: QueuedEvent[]; upTo: Record<string, number> }

const TYPES: readonly ModEventType[] = ['pet', 'turn', 'check_pass', 'commit', 'error', 'hide']

export const emptyQueue = (now: number): Queue => ({ beat: now, next: 1, events: [] })

export const queueOf = (v: unknown): Queue | null => {
  if (typeof v !== 'object' || v === null) return null
  const q = v as Queue
  if (!Number.isFinite(q.beat) || !Number.isInteger(q.next) || !Array.isArray(q.events)) return null
  const events = q.events.filter(
    (e): e is QueuedEvent =>
      typeof e === 'object' && e !== null && TYPES.includes(e.type) && Number.isFinite(e.at) && Number.isInteger(e.n) && Number.isFinite(e.g),
  )
  // A hand-edited or stale record can carry a `next` at or below a stored `n`, or more events than
  // the cap: keep sequence numbers unique (removeUpTo clears by `n`) and keep the newest QUEUE_CAP.
  let maxN = 0
  for (const e of events) maxN = Math.max(maxN, e.n)
  return { beat: q.beat, next: Math.max(q.next, maxN + 1), events: events.length > QUEUE_CAP ? events.slice(events.length - QUEUE_CAP) : events }
}

export const append = (q: Queue, type: ModEventType, at: number, g: number, cap = QUEUE_CAP): Queue => {
  const events = [...q.events, { type, at, n: q.next, g }]
  return { beat: at, next: q.next + 1, events: events.length > cap ? events.slice(events.length - cap) : events }
}

export const toWire = (events: readonly QueuedEvent[]): WireEvent[] => events.map(e => ({ type: e.type, at: e.at }))

// The oldest `max` events across the queues, sent in time order. Each queue gives up its events in
// sequence order, so `upTo` (cleared by `n` after a 200) covers exactly what was sent: an event that
// did not fit stays queued for the next sync.
export const takeBatch = (queues: Readonly<Record<string, Queue>>, max = MAX_BATCH): Batch => {
  const upTo: Record<string, number> = {}
  const lines = Object.entries(queues).map(([key, q]) => ({ key, events: [...q.events].sort((x, y) => x.n - y.n), i: 0 }))
  const events: QueuedEvent[] = []
  while (events.length < max) {
    let pick: (typeof lines)[number] | null = null
    for (const line of lines) {
      const head = line.events[line.i]
      if (head && (!pick || head.at < pick.events[pick.i]!.at)) pick = line
    }
    if (!pick) break
    const e = pick.events[pick.i++]!
    upTo[pick.key] = e.n
    events.push(e)
  }
  events.sort((x, y) => x.at - y.at)
  return { events, upTo }
}

export const removeUpTo = (q: Queue, n: number): Queue => ({ ...q, events: q.events.filter(e => e.n > n) })

export const keepNewest = (q: Queue, count: number): Queue => ({ ...q, events: q.events.slice(Math.max(0, q.events.length - count)) })

export const pendingGain = (queues: Iterable<Queue>): number => {
  let sum = 0
  for (const q of queues) for (const e of q.events) sum += e.g
  return sum
}

export const countEvents = (queues: Iterable<Queue>): number => {
  let n = 0
  for (const q of queues) n += q.events.length
  return n
}

// The hour windows as the server will see them: the pets it already counted in its last sync hour,
// plus every event still waiting in any queue.
export const localWindows = (base: { heartsHour: number; heartsUsed: number }, queues: Iterable<Queue>, now: number, lastSyncAt: number | null): Windows => {
  const events: NibblEvent[] = []
  for (const q of queues) for (const e of q.events) if (e.type !== 'hide') events.push({ type: e.type, at: e.at })
  events.sort((a, b) => a.at - b.at)
  const start: Windows = base.heartsUsed > 0 ? { [base.heartsHour]: { pet: base.heartsUsed } } : {}
  return scoreEvents(events, start, now, lastSyncAt).windows
}

export const gainFor = (type: ModEventType, at: number, windows: Windows, lastSyncAt: number | null): number =>
  type === 'hide' ? 0 : scoreEvents([{ type, at }], windows, at, lastSyncAt).xpGained

export const heartsUsedAt = (windows: Windows, now: number): number => Math.min(CAPS_PER_HOUR.pet, windows[Math.floor(now / HOUR_MS)]?.pet ?? 0)

export const isOrphan = (q: Queue, now: number): boolean => now - q.beat >= ORPHAN_MS

export const sendable = (all: Readonly<Record<string, Queue>>, own: string, now: number): Record<string, Queue> =>
  Object.fromEntries(Object.entries(all).filter(([key, q]) => key === own || isOrphan(q, now)))

export const isSyncDue = (lastSyncAt: number | null, pending: number, now: number): boolean =>
  pending > 0 && (lastSyncAt === null || now - lastSyncAt >= SYNC_EVERY_MS || pending >= SYNC_SOON_PENDING)
