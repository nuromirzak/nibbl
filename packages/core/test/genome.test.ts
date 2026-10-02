import { describe, expect, it } from 'vitest'
import { firstUnique, genome, genomeKey, markLabel, rarestTrait, traitOdds } from '../src/genome'
import { MARK_MOTIFS, MARK_SPOTS } from '../src/genes'
import { TIERS, type Tier } from '../src/odds'

describe('genome', () => {
  it('is deterministic', () => {
    expect(genome(42, 'rare', false)).toEqual(genome(42, 'rare', false))
  })

  it('normalizes negative seeds', () => {
    expect(genome(-1, 'common', false)).toEqual({ ...genome(0xffffffff, 'common', false), seed: 0xffffffff })
    expect(() => genome(0, 'legendary', true)).not.toThrow()
  })

  it('gives sprouts a leaf and nobody else a leaf', () => {
    for (let s = 0; s < 2000; s++) {
      const g = genome(s, TIERS[s % 5], false)
      expect(g.family === 'sprout').toBe(g.head === 'leaf')
    }
  })

  it('only uses values eligible for the tier', () => {
    for (let s = 0; s < 2000; s++) {
      const g = genome(s, 'common', false)
      expect(['ember', 'moss', 'ocean']).toContain(g.ramp)
      expect(['none', 'spots', 'freckles']).toContain(g.pattern)
      expect(g.hat).toBe('none')
    }
  })

  it('maps hat to tier', () => {
    expect(genome(1, 'common', false).hat).toBe('none')
    expect(genome(1, 'uncommon', false).hat).toBe('none')
    expect(genome(1, 'rare', false).hat).toBe('none')
    expect(genome(1, 'epic', false).hat).toBe('bow')
    expect(genome(1, 'legendary', false).hat).toBe('crown')
  })

  it('reaches horns from rare upward, never below, and never under a hat', () => {
    const heads = (tier: Tier) => new Set(Array.from({ length: 3000 }, (_, s) => genome(s, tier, false).head))
    expect(heads('common').has('horns')).toBe(false)
    expect(heads('uncommon').has('horns')).toBe(false)
    expect(heads('rare').has('horns')).toBe(true)
    for (const tier of ['epic', 'legendary'] as const) expect([...heads(tier)].every(h => h === 'none' || h === 'leaf')).toBe(true)
  })

  it('draws every one of the 24 marks, each with reported odds 1/24', () => {
    const marks = new Set<string>()
    for (let s = 0; s < 5000; s++) {
      const g = genome(s, TIERS[s % 5], false)
      expect(MARK_MOTIFS).toContain(g.mark.motif)
      expect(MARK_SPOTS).toContain(g.mark.spot)
      marks.add(`${g.mark.motif}.${g.mark.spot}`)
      expect(traitOdds(g).find(t => t.gene === 'mark')).toEqual({ gene: 'mark', value: markLabel(g.mark), probability: 1 / 24 })
    }
    expect(marks.size).toBe(24)
    expect(markLabel({ motif: 'star', spot: 'left-cheek' })).toBe('star on left cheek')
  })

  it('reports per-gene odds that sum to 1 over every reachable value', () => {
    const totals = new Map<string, Map<string, number>>()
    for (let s = 0; s < 20_000; s++) {
      for (const t of traitOdds(genome(s, TIERS[s % 5], false))) {
        if (!totals.has(t.gene)) totals.set(t.gene, new Map())
        totals.get(t.gene)!.set(t.value, t.probability)
      }
    }
    for (const [gene, values] of totals) {
      const sum = [...values.values()].reduce((a, b) => a + b, 0)
      expect(sum, gene).toBeCloseTo(1, 9)
    }
  })

  it('guarantees a trait below 5% odds for every genome', () => {
    for (let s = 0; s < 100_000; s++) {
      const g = genome(s, TIERS[s % 5], s % 25 === 0)
      expect(rarestTrait(g).probability).toBeLessThan(0.05)
    }
  })

  it('reports trait odds between 0 and 1', () => {
    for (const t of traitOdds(genome(9, 'epic', true))) {
      expect(t.probability).toBeGreaterThan(0)
      expect(t.probability).toBeLessThanOrEqual(1)
    }
  })

  it('builds a key that changes when a visible gene changes', () => {
    const g = genome(5, 'rare', false)
    expect(genomeKey(g)).not.toBe(genomeKey({ ...g, ramp: g.ramp === 'ember' ? 'moss' : 'ember' }))
    expect(genomeKey(g)).not.toBe(genomeKey({ ...g, mark: { ...g.mark, spot: g.mark.spot === 'belly' ? 'forehead' : 'belly' } }))
    expect(genomeKey(g)).toBe(genomeKey({ ...g, seed: 999 }))
  })

  it('firstUnique skips taken keys and gives up after maxAttempts', () => {
    const taken = new Set([genomeKey(genome(1, 'common', false))])
    const g = firstUnique([1, 2, 3], 'common', false, k => taken.has(k))
    expect(g).not.toBeNull()
    expect(taken.has(genomeKey(g!))).toBe(false)
    expect(firstUnique([1, 2, 3], 'common', false, () => true, 3)).toBeNull()
  })
})
