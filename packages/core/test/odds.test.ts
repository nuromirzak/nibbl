import { describe, expect, it } from 'vitest'
import { BP, SHINY_BP, TIERS, TIER_BP, shinyFromRoll, tierFromRoll, tierRank } from '../src/odds'
import { RAMPS, SHINY_OF, SWEETIE } from '../src/palette'
import { mulberry32 } from '../src/prng'

describe('palette', () => {
  it('has 16 colors and valid ramp indices', () => {
    expect(SWEETIE).toHaveLength(16)
    for (const ramp of Object.values(RAMPS)) {
      for (const i of ramp) expect(i).toBeGreaterThanOrEqual(0)
      for (const i of ramp) expect(i).toBeLessThan(16)
    }
  })

  it('maps every ramp to a different shiny ramp', () => {
    for (const [name, shiny] of Object.entries(SHINY_OF)) expect(shiny).not.toBe(name)
  })
})

describe('odds', () => {
  it('tier basis points sum to 10000', () => {
    expect(TIERS.reduce((s, t) => s + TIER_BP[t], 0)).toBe(BP)
  })

  it('maps roll boundaries to tiers', () => {
    expect(tierFromRoll(0)).toBe('common')
    expect(tierFromRoll(3999)).toBe('common')
    expect(tierFromRoll(4000)).toBe('uncommon')
    expect(tierFromRoll(9699)).toBe('epic')
    expect(tierFromRoll(9700)).toBe('legendary')
    expect(tierFromRoll(9999)).toBe('legendary')
    expect(tierFromRoll(-1)).toBe('legendary')
    expect(tierFromRoll(10000)).toBe('common')
  })

  it('matches target odds within 0.2 percentage points over 1e6 rolls', () => {
    const rng = mulberry32(2026)
    const counts = Object.fromEntries(TIERS.map(t => [t, 0])) as Record<string, number>
    let shiny = 0
    const n = 1_000_000
    for (let i = 0; i < n; i++) {
      counts[tierFromRoll(rng())]++
      if (shinyFromRoll(rng())) shiny++
    }
    for (const t of TIERS) expect(Math.abs(counts[t] / n - TIER_BP[t] / BP)).toBeLessThan(0.002)
    expect(Math.abs(shiny / n - SHINY_BP / BP)).toBeLessThan(0.002)
  })

  it('ranks tiers in order', () => {
    expect(tierRank('common')).toBe(0)
    expect(tierRank('legendary')).toBe(4)
  })
})
