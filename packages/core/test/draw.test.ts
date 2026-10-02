import { describe, expect, it } from 'vitest'
import { drawPet, faceRow, type Expression, type Stage } from '../src/draw'
import { genome } from '../src/genome'
import { gridHash } from '../src/grid'
import { TIERS } from '../src/odds'

const STAGES: Stage[] = ['baby', 'teen', 'adult']
const EXPRESSIONS: Expression[] = ['idle', 'blink', 'happy', 'sad', 'sleep', 'surprised']

describe('drawPet', () => {
  it('returns a 16x16 grid of palette indices or null', () => {
    const grid = drawPet(genome(42, 'rare', false), 'adult', 'idle')
    expect(grid).toHaveLength(16)
    for (const row of grid) {
      expect(row).toHaveLength(16)
      for (const cell of row) if (cell !== null) expect(cell).toBeGreaterThanOrEqual(0)
    }
  })

  it('never throws and stays in bounds for any seed, tier, stage and expression', () => {
    for (let s = 0; s < 3000; s++) {
      const g = genome(s, TIERS[s % 5], s % 13 === 0)
      for (const stage of STAGES) {
        for (const e of EXPRESSIONS) {
          const grid = drawPet(g, stage, e)
          expect(grid).toHaveLength(16)
          for (const row of grid) expect(row).toHaveLength(16)
        }
      }
    }
  }, 60_000)

  it('draws something for every pet', () => {
    for (let s = 0; s < 500; s++) {
      const filled = drawPet(genome(s, 'common', false), 'baby', 'idle').flat().filter(c => c !== null)
      expect(filled.length).toBeGreaterThan(20)
    }
  })

  it('changes only face rows between expressions', () => {
    for (let s = 0; s < 300; s++) {
      const g = genome(s, TIERS[s % 5], false)
      const ey = faceRow(g, 'adult')
      const idle = drawPet(g, 'adult', 'idle')
      for (const e of EXPRESSIONS) {
        const other = drawPet(g, 'adult', e)
        for (let y = 0; y < 16; y++) {
          if (y >= ey - 1 && y <= ey + 3) continue
          expect(other[y]).toEqual(idle[y])
        }
      }
    }
  })

  it('keeps the belly out of the face rows', () => {
    for (let s = 0; s < 300; s++) {
      const g = { ...genome(s, 'common', false), belly: true }
      const ey = faceRow(g, 'adult')
      const withBelly = drawPet(g, 'adult', 'idle')
      const without = drawPet({ ...g, belly: false }, 'adult', 'idle')
      for (let y = ey - 1; y <= ey + 2; y++) expect(withBelly[y]).toEqual(without[y])
    }
  })

  it('draws the same pixels on every runtime (fixed hashes)', () => {
    // Snapshot values are recorded on the first run and must never change afterwards:
    // a changed hash means existing users' pets changed shape.
    expect(gridHash(drawPet(genome(1, 'common', false), 'adult', 'idle'))).toMatchSnapshot()
    expect(gridHash(drawPet(genome(42, 'rare', false), 'teen', 'happy'))).toMatchSnapshot()
    expect(gridHash(drawPet(genome(0xffffffff, 'legendary', true), 'baby', 'sad'))).toMatchSnapshot()
  })
})
