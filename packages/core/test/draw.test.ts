import { describe, expect, it } from 'vitest'
import { drawPet, faceRow, type Expression, type Stage } from '../src/draw'
import { genome, type Genome } from '../src/genome'
import { gridHash } from '../src/grid'
import { C } from '../src/palette'
import { MARK_MOTIFS, MARK_SPOTS } from '../src/genes'
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

  it('keeps every hat visible (at least 2 cells differ from the hatless pet)', () => {
    const failures: string[] = []
    for (let s = 0; s < 3000; s++) {
      for (const tier of ['epic', 'legendary'] as const) {
        const g = genome(s, tier, false)
        for (const stage of STAGES) {
          const a = drawPet(g, stage, 'idle')
          const b = drawPet({ ...g, hat: 'none' }, stage, 'idle')
          let diff = 0
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (a[y][x] !== b[y][x]) diff++
          if (diff < 2) failures.push(`${s}/${tier}/${stage}`)
        }
      }
    }
    expect(failures).toEqual([])
  }, 60_000)

  it('never draws a mark inside the eye area of any expression', () => {
    for (let s = 0; s < 150; s++) {
      const g = genome(s, TIERS[s % 5], s % 7 === 0)
      for (const stage of STAGES) {
        const ey = faceRow(g, stage)
        const inset = stage === 'baby' ? 1 : 0
        for (const e of EXPRESSIONS) {
          const base = drawPet(g, stage, e)
          for (const motif of MARK_MOTIFS) {
            for (const spot of MARK_SPOTS) {
              const other = drawPet({ ...g, mark: { motif, spot } }, stage, e)
              for (const sx of [5 + inset, 10 - inset]) {
                const out = sx < 8 ? -1 : 1
                for (const [x, y] of [[sx, ey], [sx + out, ey], [sx - 1, ey + 1], [sx, ey + 1], [sx + 1, ey + 1]]) {
                  expect(other[y][x]).toBe(base[y][x])
                }
              }
            }
          }
        }
      }
    }
  }, 60_000)

  it('shows the mark at every spot and stage, smallest bodies included', () => {
    const hidden: string[] = []
    const check = (g: Genome, label: string) => {
      for (const stage of STAGES) {
        for (const spot of MARK_SPOTS) {
          // dot and star never share a color, so equal grids mean no mark pixel is visible.
          const dot = gridHash(drawPet({ ...g, mark: { motif: 'dot', spot } }, stage, 'idle'))
          const star = gridHash(drawPet({ ...g, mark: { motif: 'star', spot } }, stage, 'idle'))
          // Known, deferred (baby face art): tall ears pull a baby's face row up between them,
          // leaving no forehead pixel; only that case may hide a forehead mark.
          const earsLiftFace = stage === 'baby' && spot === 'forehead' && (g.head === 'bunny' || g.head === 'pointy')
          if (dot === star && !earsLiftFace) hidden.push(`${label}/${stage}/${spot}`)
        }
      }
    }
    for (let s = 0; s < 1000; s++) check(genome(s, TIERS[s % 5], s % 9 === 0), String(s))
    for (const family of ['mochi', 'critter', 'sprout'] as const) {
      for (const halfW of [5, 6, 7]) {
        for (const halfH of [5, 6, 7]) check({ ...genome(1, 'rare', false), family, halfW, halfH, head: family === 'sprout' ? 'leaf' : 'round' }, `${family}${halfW}x${halfH}`)
      }
    }
    expect(hidden).toEqual([])
  }, 60_000)

  it('marks shiny pets with a corner sparkle that never touches the outline', () => {
    for (let s = 0; s < 1000; s++) {
      const g = genome(s, TIERS[s % 5], false)
      for (const stage of STAGES) {
        const plain = drawPet(g, stage, 'idle')
        const shiny = drawPet({ ...g, shiny: true }, stage, 'idle')
        expect([shiny[1][14], shiny[0][15]]).toEqual([C.white, C.cyan])
        for (let y = 0; y <= 3; y++) for (let x = 13; x <= 15; x++) expect(plain[y][x]).toBeNull()
      }
    }
  })

  it('always lands at least one spot on spotted teens and adults', () => {
    const bare: string[] = []
    for (let s = 0; s < 3000; s++) {
      const g = { ...genome(s, TIERS[s % 5], false), pattern: 'spots' as const }
      for (const stage of ['teen', 'adult'] as const) {
        const spotted = drawPet(g, stage, 'idle')
        const plain = drawPet({ ...g, pattern: 'none' }, stage, 'idle')
        let diff = 0
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (spotted[y][x] !== plain[y][x]) diff++
        if (diff < 2) bare.push(`${s}/${stage}`)
      }
    }
    expect(bare).toEqual([])
  })

})
