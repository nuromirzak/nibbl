import { describe, expect, it } from 'vitest'
import {
  append,
  countEvents,
  emptyQueue,
  gainFor,
  heartsUsedAt,
  isOrphan,
  isSyncDue,
  keepNewest,
  localWindows,
  pendingGain,
  queueOf,
  removeUpTo,
  sendable,
  takeBatch,
  toWire,
  type Queue,
} from '../src/queue'

const HOUR = 3_600_000
const ev = (n: number, type: 'turn' | 'pet' | 'commit' | 'error' | 'hide', at: number, g = 0) => ({ type, at, n, g })

describe('append', () => {
  it('numbers events, refreshes the heartbeat and keeps only the newest cap events', () => {
    let q = emptyQueue(0)
    for (let i = 0; i < 1005; i++) q = append(q, 'turn', i, 3)
    expect(q.events).toHaveLength(1000)
    expect(q.events[0]).toEqual({ type: 'turn', at: 5, n: 6, g: 3 })
    expect(q.next).toBe(1006)
    expect(q.beat).toBe(1004)
  })
})

describe('toWire', () => {
  it('sends only type and time, never the local gain or sequence number', () => {
    expect(toWire([ev(1, 'turn', 10, 3), ev(2, 'hide', 20)])).toEqual([{ type: 'turn', at: 10 }, { type: 'hide', at: 20 }])
  })
})

describe('takeBatch', () => {
  it('sends the newest events across queues in time order and clears everything it saw', () => {
    const a: Queue = { beat: 0, next: 4, events: [ev(1, 'turn', 10), ev(2, 'pet', 30), ev(3, 'turn', 50)] }
    const b: Queue = { beat: 0, next: 3, events: [ev(1, 'commit', 20), ev(2, 'error', 40)] }
    const batch = takeBatch({ a, b }, 3)
    expect(batch.events.map(e => e.at)).toEqual([30, 40, 50])
    expect(batch.upTo).toEqual({ a: 3, b: 2 })
  })

  it('is empty for empty queues', () => {
    expect(takeBatch({ a: emptyQueue(0) })).toEqual({ events: [], upTo: {} })
  })
})

describe('removeUpTo and keepNewest', () => {
  it('keeps events appended after the batch was taken', () => {
    const q: Queue = { beat: 0, next: 5, events: [ev(1, 'turn', 1), ev(2, 'turn', 2), ev(3, 'turn', 3), ev(4, 'turn', 4)] }
    expect(removeUpTo(q, 2).events.map(e => e.n)).toEqual([3, 4])
    expect(keepNewest(q, 1).events.map(e => e.n)).toEqual([4])
  })
})

describe('optimistic scoring', () => {
  it('gives 2 xp for each of the first 5 pets in an hour and 0 after', () => {
    const now = 10 * HOUR + 1_000
    let q = emptyQueue(now)
    const gains: number[] = []
    for (let i = 0; i < 6; i++) {
      const g = gainFor('pet', now, localWindows({ heartsHour: 0, heartsUsed: 0 }, [q], now, null), null)
      gains.push(g)
      q = append(q, 'pet', now, g)
    }
    expect(gains).toEqual([2, 2, 2, 2, 2, 0])
    expect(heartsUsedAt(localWindows({ heartsHour: 0, heartsUsed: 0 }, [q], now, null), now)).toBe(5)
    expect(pendingGain([q])).toBe(10)
  })

  it('counts the pets the server already saw this hour', () => {
    const now = 10 * HOUR + 1_000
    const windows = localWindows({ heartsHour: 10, heartsUsed: 4 }, [], now, now - 1_000)
    expect(gainFor('pet', now, windows, now - 1_000)).toBe(2)
    const full = localWindows({ heartsHour: 10, heartsUsed: 5 }, [], now, now - 1_000)
    expect(gainFor('pet', now, full, now - 1_000)).toBe(0)
  })

  it('never scores hide and errors', () => {
    const now = HOUR
    expect(gainFor('hide', now, {}, null)).toBe(0)
    expect(gainFor('error', now, {}, null)).toBe(0)
    expect(gainFor('turn', now, {}, null)).toBe(3)
  })
})

describe('scheduling', () => {
  it('is due after 2.5 h, at 500 waiting events, or on the first sync; never when empty', () => {
    const now = 100 * HOUR
    expect(isSyncDue(now - 1_000, 3, now)).toBe(false)
    expect(isSyncDue(now - 150 * 60_000, 3, now)).toBe(true)
    expect(isSyncDue(now - 1_000, 500, now)).toBe(true)
    expect(isSyncDue(null, 1, now)).toBe(true)
    expect(isSyncDue(null, 0, now)).toBe(false)
  })

  it('sends its own queue and orphans (15 min without a heartbeat), never a live session', () => {
    const now = HOUR
    const all = { own: { beat: now, next: 1, events: [] }, live: { beat: now - 60_000, next: 1, events: [] }, dead: { beat: now - 15 * 60_000, next: 1, events: [] } }
    expect(Object.keys(sendable(all, 'own', now)).sort()).toEqual(['dead', 'own'])
    expect(isOrphan(all.dead, now)).toBe(true)
    expect(countEvents([{ beat: 0, next: 3, events: [ev(1, 'turn', 1), ev(2, 'turn', 2)] }])).toBe(2)
  })
})

describe('queueOf', () => {
  it('drops malformed events and refuses junk', () => {
    expect(queueOf({ beat: 1, next: 3, events: [ev(1, 'turn', 1), { type: 'sneeze', at: 2, n: 2, g: 0 }, null] })).toEqual({ beat: 1, next: 3, events: [ev(1, 'turn', 1)] })
    expect(queueOf('junk')).toBeNull()
    expect(queueOf({ beat: 'x', next: 1, events: [] })).toBeNull()
  })

  it('lifts a stale next above every stored sequence number', () => {
    expect(queueOf({ beat: 1, next: 2, events: [ev(1, 'turn', 1), ev(7, 'pet', 2)] })?.next).toBe(8)
  })

  it('keeps only the newest cap events of an oversized record', () => {
    const events = Array.from({ length: 1003 }, (_, i) => ev(i + 1, 'turn', i))
    const q = queueOf({ beat: 1, next: 1004, events })!
    expect(q.events).toHaveLength(1000)
    expect(q.events[0]!.n).toBe(4)
    expect(q.next).toBe(1004)
  })
})
