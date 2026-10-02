import { describe, expect, it } from 'vitest'
import { BP, SHINY_BP, TIERS, TIER_BP, isTier, rollFromBytes, shinyFromRoll, tierFromRoll, tierRank } from '../src/odds'
import { RAMPS, SHINY_RAMPS, SWEETIE } from '../src/palette'
import { mulberry32 } from '../src/prng'

describe('palette', () => {
  it('has 16 colors and valid ramp indices', () => {
    expect(SWEETIE).toHaveLength(16)
    for (const ramp of Object.values(RAMPS)) {
      for (const i of ramp) expect(i).toBeGreaterThanOrEqual(0)
      for (const i of ramp) expect(i).toBeLessThan(16)
    }
  })

  it('gives every ramp a dedicated shiny triplet unlike any base ramp or other shiny ramp', () => {
    const triplets = [...Object.values(RAMPS), ...Object.values(SHINY_RAMPS)].map(r => r.join(','))
    expect(new Set(triplets).size).toBe(triplets.length)
    expect(Object.keys(SHINY_RAMPS).sort()).toEqual(Object.keys(RAMPS).sort())
    for (const ramp of Object.values(SHINY_RAMPS)) for (const i of ramp) expect(i >= 0 && i < 16).toBe(true)
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

  it('throws RangeError on non-finite rolls', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => tierFromRoll(bad)).toThrow(RangeError)
      expect(() => shinyFromRoll(bad)).toThrow(RangeError)
    }
  })

  it('recognizes tiers', () => {
    for (const t of TIERS) expect(isTier(t)).toBe(true)
    for (const x of ['mythic', '', 'Common', 3, null, undefined, {}, 'toString', '__proto__']) expect(isTier(x)).toBe(false)
  })

  it('rolls seed, tier and shiny from big-endian words at offsets 0, 4 and 8', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x00, 0x25, 0xe4, 0x00, 0x00, 0x01, 0x8f, 0xff])
    // 0x25e4 = 9700 -> legendary, 0x18f = 399 -> shiny
    expect(rollFromBytes(bytes)).toEqual({ seed: 0xdeadbeef, tier: 'legendary', shiny: true })
    const common = new Uint8Array(12)
    common[7] = 1
    common[11] = 0x90
    common[10] = 0x01 // 0x190 = 400 -> not shiny
    expect(rollFromBytes(common)).toEqual({ seed: 0, tier: 'common', shiny: false })
    expect(rollFromBytes(new Uint8Array(12).fill(0xff))).toEqual({
      seed: 0xffffffff, tier: tierFromRoll(0xffffffff), shiny: shinyFromRoll(0xffffffff),
    })
    expect(() => rollFromBytes(new Uint8Array(11))).toThrow(RangeError)
  })

  it('ranks tiers in order', () => {
    expect(tierRank('common')).toBe(0)
    expect(tierRank('legendary')).toBe(4)
  })
})
