import { describe, expect, it } from 'vitest'
import { genome, traitOdds } from '../src/genome'
import { shinyFromRoll, tierFromRoll } from '../src/odds'
import { mulberry32 } from '../src/prng'

describe('traitOdds honesty', () => {
  it('reports the probability each gene=value pair actually appears with (200 000 real rolls)', () => {
    const n = 200_000
    const seeds = mulberry32(0x0dd5)
    const tiers = mulberry32(0x7135)
    const shinies = mulberry32(0x5417)
    const seen = new Map<string, { probability: number; count: number }>()
    for (let i = 0; i < n; i++) {
      const g = genome(seeds(), tierFromRoll(tiers()), shinyFromRoll(shinies()))
      for (const t of traitOdds(g)) {
        const key = `${t.gene}=${t.value}`
        const entry = seen.get(key)
        if (entry === undefined) seen.set(key, { probability: t.probability, count: 1 })
        else {
          // The same pair must always be reported with the same probability.
          expect(t.probability).toBe(entry.probability)
          entry.count++
        }
      }
    }
    const off: string[] = []
    for (const [key, { probability, count }] of seen) {
      const empirical = count / n
      const tolerance = Math.max(0.003, 0.1 * probability)
      if (Math.abs(empirical - probability) > tolerance) {
        off.push(`${key}: reported ${(probability * 100).toFixed(3)}%, seen ${(empirical * 100).toFixed(3)}%`)
      }
    }
    expect(off).toEqual([])
    expect(seen.size).toBeGreaterThan(40)
  }, 60_000)
})
