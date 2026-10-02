import { describe, expect, it } from 'vitest'
import { toCellPairs } from '../src/cells'
import { drawEgg, drawEggScene } from '../src/egg'
import { genome } from '../src/genome'
import { C } from '../src/palette'
import { SCENE_H, SCENE_W, drawScene } from '../src/scene'

describe('drawScene', () => {
  it('is 32x16 with a ground row', () => {
    const s = drawScene(genome(42, 'rare', false))
    expect(s).toHaveLength(SCENE_H)
    for (const row of s) expect(row).toHaveLength(SCENE_W)
    expect(s[15].every(c => c === C.slate || c === C.dusk)).toBe(true)
  })

  it('clamps petX, lift and bugs instead of throwing', () => {
    const g = genome(3, 'legendary', true)
    for (const petX of [-10, 0, 16, 99]) {
      for (const lift of [-5, 0, 3, 20]) {
        expect(() => drawScene(g, { petX, lift, bugs: 99, heart: true, frame: 7 })).not.toThrow()
      }
    }
  })

  it('draws bugs only when asked', () => {
    const g = genome(8, 'common', false)
    const count = (bugs: number) => drawScene(g, { bugs, petX: 0 }).flat().filter(c => c === C.lime).length
    expect(count(0)).toBe(count(0))
    expect(count(2)).toBeGreaterThan(count(0))
  })
})

describe('drawEgg', () => {
  it('adds crack pixels as cracks grow', () => {
    const ink = (n: 0 | 1 | 2 | 3) => drawEgg(n).flat().filter(c => c === C.ink).length
    expect(ink(1)).toBeGreaterThan(ink(0))
    expect(ink(3)).toBeGreaterThan(ink(1))
    expect(drawEggScene(2, 1)).toHaveLength(16)
  })
})

describe('toCellPairs', () => {
  it('packs two pixel rows into one terminal row', () => {
    const pairs = toCellPairs([
      [1, 2, null, null],
      [3, null, 4, null],
    ])
    expect(pairs).toEqual([
      [
        { glyph: '▀', fg: 1, bg: 3 },
        { glyph: '▀', fg: 2, bg: null },
        { glyph: '▄', fg: 4, bg: null },
        { glyph: ' ', fg: null, bg: null },
      ],
    ])
  })

  it('turns a 32x16 scene into 8 rows of 32 cells', () => {
    const pairs = toCellPairs(drawScene(genome(1, 'common', false)))
    expect(pairs).toHaveLength(8)
    for (const row of pairs) expect(row).toHaveLength(32)
  })
})
