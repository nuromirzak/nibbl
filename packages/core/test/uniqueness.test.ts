import { describe, expect, it } from 'vitest'
import { genome, genomeKey, pickUnique, visualKey, type Genome } from '../src/genome'
import { shinyFromRoll, tierFromRoll } from '../src/odds'
import { mulberry32 } from '../src/prng'

const HATCHES = 100_000
const CANDIDATES = 16

// Mirrors the server: tier and shiny are rolled once per hatch, then several seeds are
// derived for the same hatch and the first one free on both keys wins.
const hatchCandidates = (i: number): Genome[] => {
  const rng = mulberry32(i)
  const tier = tierFromRoll(rng())
  const shiny = shinyFromRoll(rng())
  return Array.from({ length: CANDIDATES }, () => genome(rng(), tier, shiny))
}

describe('uniqueness at scale', () => {
  const takenKeys = new Set<string>()
  const takenVisuals = new Map<string, string>()
  const failures: number[] = []
  const accepted: Genome[] = []

  it('finds a free genome for each of 100 000 sequential hatches', () => {
    for (let i = 0; i < HATCHES; i++) {
      const g = pickUnique(hatchCandidates(i), k => takenKeys.has(k), v => takenVisuals.has(v))
      if (g === null) {
        failures.push(i)
        continue
      }
      takenKeys.add(genomeKey(g))
      takenVisuals.set(visualKey(g), genomeKey(g))
      accepted.push(g)
    }
    expect(failures.length).toBe(0)
  }, 60_000)

  it('never lets two distinct genome keys share a visual key among accepted pets', () => {
    expect(accepted.length).toBe(HATCHES)
    const byVisual = new Map<string, string>()
    for (const g of accepted) {
      const v = visualKey(g)
      const k = genomeKey(g)
      const other = byVisual.get(v)
      if (other !== undefined) expect(other).toBe(k)
      byVisual.set(v, k)
    }
    expect(byVisual.size).toBe(HATCHES)
    expect(new Set(accepted.map(genomeKey)).size).toBe(HATCHES)
  }, 60_000)
})

describe('pickUnique', () => {
  it('returns the first candidate free on both keys, or null', () => {
    const [a, b, c] = [genome(1, 'common', false), genome(2, 'common', false), genome(3, 'common', false)]
    expect(pickUnique([a, b, c], () => false, () => false)).toBe(a)
    expect(pickUnique([a, b, c], k => k === genomeKey(a), () => false)).toBe(b)
    expect(pickUnique([a, b, c], () => false, v => v === visualKey(a) || v === visualKey(b))).toBe(c)
    expect(pickUnique([a, b, c], () => true, () => false)).toBeNull()
    expect(pickUnique([], () => false, () => false)).toBeNull()
  })
})
