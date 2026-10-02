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

  it('matches known vectors and an independent reference implementation', () => {
    expect(mulberry32(0)()).toBe(1144304738)
    expect(mulberry32(42)()).toBe(2581720956)
    // Written separately from src: the original float form of mulberry32, scaled back to uint32.
    const reference = (seed: number) => {
      let a = seed | 0
      return () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 4294967296
      }
    }
    for (const seed of [0, 1, 42, 0x7fffffff, 0xffffffff]) {
      const ours = mulberry32(seed)
      const theirs = reference(seed)
      for (let i = 0; i < 1000; i++) expect(ours()).toBe(theirs())
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
