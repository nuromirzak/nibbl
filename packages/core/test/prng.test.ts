import { describe, expect, it } from 'vitest'
import { mulberry32, pickIndex } from '../src/prng'

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('returns uint32 values', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(2 ** 32)
    }
  })

  it('treats -1 and 0xffffffff as the same seed', () => {
    expect(mulberry32(-1)()).toBe(mulberry32(0xffffffff)())
  })

  it('pickIndex stays in range', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 1000; i++) {
      const v = pickIndex(rng, 5)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(5)
    }
  })
})
