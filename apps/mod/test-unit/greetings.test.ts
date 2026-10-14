import { describe, expect, it } from 'vitest'

import { GREETINGS, bucketOfHour, greetingFor, localDay } from '../src/greetings'

const T = (h: number, d = 2) => Date.UTC(2026, 9, d, h, 0)

describe('greetings', () => {
  it('has 8 lines in each of 4 buckets', () => {
    for (const lines of Object.values(GREETINGS)) expect(lines).toHaveLength(8)
    expect(Object.keys(GREETINGS)).toEqual(['morning', 'afternoon', 'evening', 'night'])
  })
  it('buckets the local hour', () => {
    const want = (h: number) => bucketOfHour(h)
    expect([4, 5, 11, 12, 17, 18, 22, 23, 0].map(want)).toEqual(['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night'])
  })
  it('picks from the local-hour bucket, shifted by the offset', () => {
    // 09:00 UTC is 14:00 at +05:00 (afternoon) and 04:00 at -05:00 (night)
    expect(GREETINGS.morning.map(l => l.replaceAll('{name}', 'Pixel'))).toContain(greetingFor(1, T(9), 0, 'Pixel'))
    expect(GREETINGS.afternoon.map(l => l.replaceAll('{name}', 'Pixel'))).toContain(greetingFor(1, T(9), 300, 'Pixel'))
    expect(GREETINGS.night.map(l => l.replaceAll('{name}', 'Pixel'))).toContain(greetingFor(1, T(9), -300, 'Pixel'))
  })
  it('is deterministic per seed and day, fills the name, and varies over days', () => {
    expect(greetingFor(7, T(9), 0, 'Pixel')).toBe(greetingFor(7, T(10), 0, 'Pixel'))
    expect(greetingFor(7, T(9), 0, 'Pixel')).not.toMatch(/[{}]/)
    const seen = new Set(Array.from({ length: 20 }, (_, d) => greetingFor(7, T(9, 1 + d), 0, 'Pixel')))
    expect(seen.size).toBeGreaterThan(3)
  })
  it('counts the local day across the offset', () => {
    expect(localDay(T(0), 0)).toBe(localDay(T(23, 1), 0) + 1)
    expect(localDay(T(20), 300)).toBe(localDay(T(20), 0) + 1)
    expect(localDay(T(18), 300)).toBe(localDay(T(18), 0))
  })
})
