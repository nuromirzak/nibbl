import { genome, levelFromXp } from '@nibbl/core'
import { describe, expect, it } from 'vitest'
import type { NibblPetView } from '../types'
import { eggStatsText, heartsLeftOf, hudLines, oddsText, rarestLine, statsText, tierText, titleOf, xpLineOf } from '../src/hud'
import { CALM } from '../src/reactions'

const H = 3_600_000
const NOW = 10 * H + 5
const VIEW: NibblPetView = { serial: 42, seed: 123456, tier: 'rare', shiny: true, genesis: true, name: 'Byte', label: 'night coder', xp: 312, heartsHour: 10, heartsUsed: 2 }

describe('HUD lines', () => {
  it('titles a server pet with its padded serial and label, and a spike pet as syncing', () => {
    expect(titleOf(VIEW)).toBe('Byte #000042 · night coder')
    expect(titleOf({ ...VIEW, label: null })).toBe('Byte #000042')
    expect(titleOf({ ...VIEW, serial: null })).toBe('Byte · syncing')
    // A view left in session state by an older build may have no serial field at all.
    const old = { ...VIEW, serial: undefined } as unknown as NibblPetView
    expect(titleOf(old)).toBe('Byte · syncing')
    expect(hudLines(old, 0, CALM, NOW, 0).compact).not.toMatch(/undefined/)
    expect(statsText(old, genome(123456, 'rare', true), NOW, { base: 'x', pending: 0, lastSyncAt: null })).not.toMatch(/undefined/)
    expect(tierText(VIEW)).toBe('rare · shiny · Genesis')
  })

  it('draws the XP bar and the hearts of the current hour only', () => {
    expect(xpLineOf(0)).toBe('lvl 1  ░░░░░ 0/10')
    expect(xpLineOf(6)).toBe('lvl 1  ▓▓▓░░ 6/10')
    expect(heartsLeftOf(VIEW, NOW)).toBe(3)
    expect(heartsLeftOf(VIEW, 11 * H)).toBe(5)
  })

  it('has an egg variant and a one-line compact form', () => {
    expect(hudLines(null, 3, CALM, NOW, 0)).toEqual({
      title: 'Egg',
      xp: 'turns 3/10',
      hearts: '',
      status: 'keep working to hatch it',
      compact: 'Egg · turns 3/10 · keep working to hatch it',
    })
    expect(hudLines(null, 12, CALM, NOW, 0).status).toBe('hatching...')
    const level = levelFromXp(312).level
    expect(hudLines(VIEW, 0, CALM, NOW, 0).compact).toBe(`Byte #000042 · lvl ${level} ♥♥♥♡♡ · chilling`)
  })
})

describe('command text', () => {
  const g = genome(VIEW.seed, VIEW.tier, VIEW.shiny)

  it('shows the public odds, and the egg hint before a hatch', () => {
    const text = oddsText(null, null)
    expect(text).toContain('common 40% · uncommon 30% · rare 18% · epic 9% · legendary 3%')
    expect(text).toContain('shiny 4% on top of any tier')
    expect(text).toContain('Your egg shows its traits when it hatches.')
  })

  it("lists the pet's traits and its rarest one", () => {
    const text = oddsText(VIEW, g)
    expect(text).toContain("Byte's traits:")
    expect(text).toMatch(/^ {2}family \w+ [\d.]+%$/m)
    expect(text).toContain(`rarest: ${rarestLine(g)}`)
    expect(rarestLine(g)).toMatch(/^.+ [\d.]+% odds$/)
  })

  it('prints stats with card and leaderboard links and the sync state', () => {
    const text = statsText(VIEW, g, NOW, { base: 'https://getnibbl.pages.dev', pending: 1, lastSyncAt: null })
    expect(text.split('\n')[0]).toBe('Byte #000042 · night coder')
    expect(text).toContain('card: https://getnibbl.pages.dev/p/42')
    expect(text).toContain('leaderboard: https://getnibbl.pages.dev/leaderboard/?me=42')
    expect(text).toContain('hearts this hour: ♥♥♥♡♡')
    expect(text).toContain('sync: 1 event waiting, never synced')
    expect(statsText(VIEW, g, NOW, { base: 'x', pending: 0, lastSyncAt: Date.UTC(2026, 9, 2, 9, 0) })).toContain('sync: 0 events waiting, last sync 2026-10-02 09:00 UTC')
    expect(eggStatsText(0)).toBe('Egg: 0/10 answered turns. It hatches after 10.')
  })
})
