import { describe, expect, it } from 'vitest'
import { HOUR_MS, MAX_LEVEL, SYNC_GRACE_MS, heartsLeft, pruneWindows, levelFromXp, scoreEvents, stageForLevel, xpToNext } from '../src/progression'

const NOW = 1_800_000_000_000

describe('levels', () => {
  it('follows round(10 * n^1.4)', () => {
    expect(xpToNext(1)).toBe(10)
    expect(xpToNext(2)).toBe(26)
    expect(xpToNext(9)).toBe(217)
  })

  it('converts xp to level', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, intoLevel: 0, toNext: 10 })
    expect(levelFromXp(9).level).toBe(1)
    expect(levelFromXp(10)).toEqual({ level: 2, intoLevel: 0, toNext: 26 })
    expect(levelFromXp(36).level).toBe(3)
  })

  it('maps level to stage', () => {
    expect(stageForLevel(1)).toBe('baby')
    expect(stageForLevel(10)).toBe('teen')
    expect(stageForLevel(25)).toBe('adult')
  })

  it('handles non-finite xp values', () => {
    const infResult = levelFromXp(Infinity)
    expect(infResult.level).toBeGreaterThanOrEqual(1)
    expect(infResult.level).toBeLessThanOrEqual(MAX_LEVEL)
    expect(Number.isFinite(infResult.intoLevel)).toBe(true)

    const nanResult = levelFromXp(NaN)
    expect(nanResult.level).toBe(1)
    expect(nanResult.intoLevel).toBe(0)

    const negResult = levelFromXp(-5)
    expect(negResult.level).toBe(1)
    expect(negResult.intoLevel).toBe(0)
  })

  it('stops progression at MAX_LEVEL', () => {
    const bigResult = levelFromXp(1e300)
    expect(bigResult.level).toBe(MAX_LEVEL)
    expect(Number.isFinite(bigResult.intoLevel)).toBe(true)
    expect(bigResult.intoLevel).toBeGreaterThanOrEqual(0)
  })
})

describe('scoreEvents', () => {
  it('gives XP per event type', () => {
    const r = scoreEvents(
      [{ type: 'pet', at: NOW }, { type: 'turn', at: NOW }, { type: 'check_pass', at: NOW }, { type: 'commit', at: NOW }, { type: 'error', at: NOW }],
      {},
      NOW,
      null,
    )
    expect(r.xpGained).toBe(2 + 3 + 2 + 2)
  })

  it('caps pets at 5 per hour bucket and carries existing windows', () => {
    const pets = Array.from({ length: 9 }, () => ({ type: 'pet' as const, at: NOW }))
    const first = scoreEvents(pets, {}, NOW, null)
    expect(first.xpGained).toBe(10)
    const second = scoreEvents(pets, first.windows, NOW, null)
    expect(second.xpGained).toBe(0)
    expect(heartsLeft(first.windows, NOW)).toBe(0)
    expect(heartsLeft({}, NOW)).toBe(5)
  })

  it('refills hearts in the next hour bucket', () => {
    const pets = Array.from({ length: 5 }, () => ({ type: 'pet' as const, at: NOW }))
    const r = scoreEvents(pets, {}, NOW, null)
    expect(heartsLeft(r.windows, NOW + HOUR_MS)).toBe(5)
  })

  it('ignores future events, events older than the sync window and unknown types', () => {
    const r = scoreEvents(
      [
        { type: 'turn', at: NOW + 60_000 },
        { type: 'turn', at: NOW - 5 * HOUR_MS },
        { type: 'hack' as never, at: NOW },
      ],
      {},
      NOW,
      NOW - HOUR_MS,
    )
    expect(r.xpGained).toBe(0)
    expect(r.accepted).toBe(0)
  })

  it('never exceeds caps for 10 000 duplicates', () => {
    const flood = Array.from({ length: 10_000 }, () => ({ type: 'turn' as const, at: NOW }))
    expect(scoreEvents(flood, {}, NOW, null).xpGained).toBe(20 * 3)
  })

  it('rejects prototype pollution attempts', () => {
    const r = scoreEvents(
      [
        { type: 'toString' as never, at: NOW },
        { type: '__proto__' as never, at: NOW },
        { type: 'constructor' as never, at: NOW },
      ],
      {},
      NOW,
      null,
    )
    expect(r.xpGained).toBe(0)
    expect(r.accepted).toBe(0)
  })

  it('skips null and non-object elements', () => {
    const r = scoreEvents(
      [null as never, {} as never, { type: 'pet' as const, at: NOW }],
      {},
      NOW,
      null,
    )
    expect(r.xpGained).toBe(2)
    expect(r.accepted).toBe(1)
  })

  it('returns zero xp when now is non-finite', () => {
    const r = scoreEvents([{ type: 'pet', at: NOW }], {}, NaN, null)
    expect(r.xpGained).toBe(0)
    expect(r.accepted).toBe(0)
  })

  it('returns zero xp when lastSyncAt is non-finite', () => {
    const r = scoreEvents([{ type: 'pet', at: NOW }], {}, NOW, Infinity)
    expect(r.xpGained).toBe(0)
    expect(r.accepted).toBe(0)
  })
})

describe('pruneWindows', () => {
  // A batch that fills every cap in the hour of NOW and the hour before it.
  const saturating = (['pet', 'turn', 'check_pass', 'commit'] as const).flatMap(type =>
    [NOW, NOW - HOUR_MS].flatMap(at => Array.from({ length: 25 }, () => ({ type, at }))),
  )

  it('keeps every window a replay can still reach, so a replayed batch earns nothing', () => {
    const first = scoreEvents(saturating, {}, NOW, null)
    expect(first.xpGained).toBeGreaterThan(0)
    const pruned = pruneWindows(first.windows, NOW + HOUR_MS)
    const replay = scoreEvents(saturating, pruned, NOW + HOUR_MS, NOW)
    expect(replay.xpGained).toBe(0)
  })

  it('drops hours older than the sync grace and copies what it keeps', () => {
    const hour = Math.floor(NOW / HOUR_MS)
    const windows = { [hour - 10]: { pet: 1 }, [hour - 3]: { pet: 2 }, [hour - 2]: { pet: 3 }, [hour]: { turn: 4 } }
    const cutoff = Math.floor((NOW - SYNC_GRACE_MS) / HOUR_MS)
    const pruned = pruneWindows(windows, NOW)
    expect(Object.keys(pruned).map(Number).sort()).toEqual(Object.keys(windows).map(Number).filter(h => h >= cutoff).sort())
    expect(pruned[hour]).toEqual({ turn: 4 })
    expect(pruned[hour]).not.toBe(windows[hour])
    expect(SYNC_GRACE_MS).toBe(3 * HOUR_MS)
    expect(pruneWindows(windows, NaN)).toEqual(windows)
  })
})
