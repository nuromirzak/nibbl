import { describe, expect, it } from 'vitest'
import { toCellPairs } from '../src/cells'
import { drawEgg, drawEggScene } from '../src/egg'
import { genome } from '../src/genome'
import type { Grid } from '../src/grid'
import { C } from '../src/palette'
import { SCENE_H, SCENE_W, drawScene } from '../src/scene'

describe('drawScene', () => {
  it('is 32x16 with a ground row', () => {
    const s = drawScene(genome(42, 'rare', false))
    expect(s).toHaveLength(SCENE_H)
    for (const row of s) expect(row).toHaveLength(SCENE_W)
    expect(s[15].every(c => c === C.slate || c === C.dusk)).toBe(true)
  })

  it('clamps petX, lift and bugs and keeps the ground row intact', () => {
    const g = genome(3, 'legendary', true)
    const ground = drawScene(g)[15]
    for (const petX of [-10, 0, 16, 99, NaN, Infinity, -Infinity]) {
      for (const lift of [-5, 0, 3, 20, NaN, Infinity]) {
        const s = drawScene(g, { petX, lift, bugs: 99, heart: true, frame: 7 })
        expect(s[15]).toEqual(ground)
        for (const row of s) expect(Object.keys(row)).toHaveLength(SCENE_W)
      }
    }
  })

  it('draws the pet at petX 0 and lift 0 when given NaN', () => {
    const g = genome(3, 'legendary', true)
    expect(drawScene(g, { petX: NaN, lift: NaN })).toEqual(drawScene(g, { petX: 0, lift: 0 }))
    expect(drawScene(g, { petX: NaN, lift: NaN, bugs: NaN, frame: NaN })).toEqual(drawScene(g, { petX: 0, lift: 0, bugs: 0, frame: 0 }))
  })

  it('adds exactly one bug sprite of lime pixels per bug clear of the pet', () => {
    const g = genome(8, 'common', false)
    const count = (bugs: number) => drawScene(g, { bugs, petX: 0 }).flat().filter(c => c === C.lime).length
    const perBug = 5
    expect(count(1) - count(0)).toBe(perBug)
    expect(count(2) - count(0)).toBe(2 * perBug)
  })
})

describe('shiny sparkle in the scene', () => {
  it('twinkles between two empty-sky spots by frame', () => {
    const g = { ...genome(8, 'common', false), shiny: true }
    const even = drawScene(g, { petX: 6, frame: 0 })
    const odd = drawScene(g, { petX: 6, frame: 1 })
    expect(even[2][21]).toBe(C.white)
    expect(odd[2][21]).toBeNull()
    expect(odd[0][19]).toBe(C.white)
    expect(even[0][19]).toBeNull()
    const plain = drawScene({ ...g, shiny: false }, { petX: 6, frame: 0 })
    expect(plain[2][21]).toBeNull()
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

describe('reaction overlays', () => {
  const g = genome(8, 'common', false)
  const changed = (a: Grid, b: Grid) => {
    const out: { x: number; y: number; before: number | null; after: number | null }[] = []
    for (let y = 0; y < a.length; y++) for (let x = 0; x < a[y].length; x++) if (a[y][x] !== b[y][x]) out.push({ x, y, before: a[y][x], after: b[y][x] })
    return out
  }

  it('draws every existing scene exactly as before when no reaction is on', () => {
    expect(drawScene(g, { petX: 6, away: false, loot: false, box: false, nightcap: false, zzz: false })).toEqual(drawScene(g, { petX: 6 }))
  })

  it('away leaves only the ground and the bugs, even for a shiny legendary', () => {
    const s = drawScene(genome(3, 'legendary', true), { petX: 6, away: true, bugs: 2, frame: 1 })
    expect(s[SCENE_H - 1]).toEqual(drawScene(g)[SCENE_H - 1])
    // Two bug sprites of 6 pixels each and nothing else above the ground.
    expect(s.slice(0, SCENE_H - 1).flat().filter(c => c !== null)).toHaveLength(12)
  })

  it('box paints a 4x3 box in front of the pet, beside its body', () => {
    const d = changed(drawScene(g, { petX: 6 }), drawScene(g, { petX: 6, box: true }))
    expect(d.length).toBeGreaterThan(0)
    for (const c of d) {
      expect([C.orange, C.yellow, C.red]).toContain(c.after)
      expect(c.x).toBeGreaterThanOrEqual(17)
      expect(c.x).toBeLessThanOrEqual(20)
      expect(c.y).toBeGreaterThanOrEqual(11)
      expect(c.y).toBeLessThanOrEqual(13)
    }
  })

  it('nightcap paints blue and a white pompom over the top two rows of the head at every stage', () => {
    for (const stage of ['baby', 'teen', 'adult'] as const) {
      const base = drawScene(g, { petX: 6, stage })
      const d = changed(base, drawScene(g, { petX: 6, stage, nightcap: true }))
      expect(d.length, stage).toBeGreaterThan(0)
      const top = base.findIndex((row, y) => y < SCENE_H - 2 && row.some((c, x) => c !== null && x >= 6 && x < 22))
      for (const c of d) {
        expect([top, top + 1], stage).toContain(c.y)
        expect([C.blue, C.white], stage).toContain(c.after)
      }
    }
  })

  it('loot and zzz paint only empty sky, and the Z bobs with the frame', () => {
    for (const opts of [{ loot: true, frame: 0 }, { zzz: true, frame: 0 }, { zzz: true, frame: 1 }]) {
      const base = drawScene(g, { petX: 6, frame: opts.frame })
      const d = changed(base, drawScene(g, { petX: 6, ...opts }))
      expect(d.length).toBeGreaterThan(0)
      for (const c of d) expect(c.before).toBeNull()
    }
    expect(drawScene(g, { petX: 6, zzz: true, frame: 0 })).not.toEqual(drawScene(g, { petX: 6, zzz: true, frame: 1 }))
  })
})
