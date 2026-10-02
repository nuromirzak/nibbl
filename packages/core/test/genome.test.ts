import { describe, expect, it } from 'vitest'
import { firstUnique, genome, genomeKey, rarestTrait, traitOdds } from '../src/genome'
import { TIERS } from '../src/odds'

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

  it('only uses values eligible for the tier, except the guaranteed spice', () => {
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
    expect(genome(1, 'rare', false).hat).toBe('beanie')
    expect(genome(1, 'epic', false).hat).toBe('bow')
    expect(genome(1, 'legendary', false).hat).toBe('crown')
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
