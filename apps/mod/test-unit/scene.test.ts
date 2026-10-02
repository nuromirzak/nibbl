import { describe, expect, it } from 'vitest'
import type { NibblPetView } from '../types'
import { CALM } from '../src/reactions'
import { eggCells, eggCracks, frameOf, genomeOf } from '../src/scene'

const H = 3_600_000
const NOW = 10 * H + 5
const VIEW: NibblPetView = { serial: 42, seed: 123456, tier: 'rare', shiny: false, genesis: true, name: 'Nibbl', label: null, xp: 0, heartsHour: 10, heartsUsed: 2 }
const ANIM = { frame: 0, petX: 8, blink: false }

describe('scene cells', () => {
  it('cracks the egg in three steps over 10 turns', () => {
    expect([0, 3, 4, 7, 10, 99].map(eggCracks)).toEqual([0, 0, 1, 2, 3, 3])
  })

  it('draws a 32x8 Raster (4096 base64 chars) and wobbles the egg by frame parity', () => {
    const a = eggCells(4, 0)
    const b = eggCells(4, 1)
    expect(a.cells.columns).toBe(32)
    expect(a.cells.rows).toBe(8)
    expect(a.cells.cells).toHaveLength(4096)
    expect(a.id).not.toBe(b.id)
    expect(eggCells(4, 2).id).toBe(a.id)
  })

  it('caches genomes and cells per visible state', () => {
    expect(genomeOf(1, 'common', false)).toBe(genomeOf(1, 'common', false))
    const one = frameOf(VIEW, 0, CALM, ANIM, NOW, 300)
    const two = frameOf(VIEW, 0, CALM, ANIM, NOW, 300)
    expect(two.id).toBe(one.id)
    expect(two.cells).toBe(one.cells)
    expect(one.hud).toBe('chilling|♥♥♥♡♡')
  })

  it('changes the scene when the pet is away and puts the expedition clock in the HUD key', () => {
    const away = { ...CALM, awaySince: NOW - 5_000 }
    const gone = frameOf(VIEW, 0, away, { ...ANIM, petX: 16 }, NOW, 300)
    expect(gone.id).not.toBe(frameOf(VIEW, 0, CALM, { ...ANIM, petX: 16 }, NOW, 300).id)
    expect(gone.id).toContain('"away":true')
    expect(gone.hud).toBe('⛏ on expedition 0:05|♥♥♥♡♡')
  })

  it('draws the egg when there is no pet yet', () => {
    expect(frameOf(null, 3, CALM, ANIM, NOW, 300).id).toBe('egg|0|0')
  })
})
