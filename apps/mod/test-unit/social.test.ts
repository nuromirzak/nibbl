import { describe, expect, it } from 'vitest'
import { NOTES, fillNote, noteAt, noteOrder } from '../src/notes'
import { parseSocial, parseWaveTarget, rankLine, rankMilestone, waveToastText } from '../src/social'
import { isNewer } from '../src/version'

describe('notes', () => {
  it('has 20 notes and a stable per-seed permutation', () => {
    expect(NOTES).toHaveLength(20)
    const order = noteOrder(123456)
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i))
    expect(noteOrder(123456)).toEqual(order)
    expect(noteOrder(654321)).not.toEqual(order)
  })
  it('fills placeholders, with the plain serial in the card URL', () => {
    expect(fillNote('{name} #{serial}', 'Pixel', 42)).toBe('Pixel #000042')
    expect(fillNote('x getnibbl.pages.dev/p/{serial}.', 'Pixel', 42)).toBe('x getnibbl.pages.dev/p/42.')
    for (let i = 0; i < 20; i++) expect(noteAt(7, i, 'Pixel', 42)).not.toMatch(/[{}]/)
  })
})

describe('isNewer', () => {
  it.each([['0.2.1', '0.2.0'], ['0.10.0', '0.9.9'], ['1.0.0', '0.99.99']])('%s is newer than %s', (a, b) => expect(isNewer(a, b)).toBe(true))
  it.each([['0.2.0', '0.2.0'], ['0.1.9', '0.2.0'], ['abc', '0.2.0'], [undefined, '0.2.0']])('%s is not newer than %s', (a, b) => expect(isNewer(a, b)).toBe(false))
})

describe('parseSocial', () => {
  it('reads a good answer', () => {
    const s = parseSocial({ waves: [{ from: 3, name: null }], rank: { pos: 2, total: 5, above: null }, latest: '0.2.0' })
    expect(s).toEqual({ waves: [{ from: 3, name: null }], rank: { pos: 2, total: 5, above: null }, latest: '0.2.0' })
  })
  it('ignores junk', () => {
    expect(parseSocial({ waves: 1, rank: [], latest: 2 })).toEqual({ waves: [], rank: null, latest: null })
    expect(parseSocial({})).toEqual({ waves: [], rank: null, latest: null })
  })
})

describe('texts', () => {
  it('formats waves, rank and wave targets', () => {
    expect(waveToastText([{ from: 14, name: 'Ziutek' }], 'Pixel')).toBe('Ziutek #000014 waved at Pixel ♥')
    expect(waveToastText([{ from: 1, name: null }, { from: 2, name: null }], 'Pixel')).toBe('2 nibbls waved at Pixel ♥')
    expect(rankLine({ pos: 4, total: 26, above: { serial: 19, name: null, tier: 'rare', xp: 1522 } }, 1402)).toBe(
      'rank 4 of 26 · next: #000019 (1522 xp, 120 ahead) · /nibbl wave 19',
    )
    expect(parseWaveTarget('#16')).toBe(16)
    expect(parseWaveTarget('000016')).toBe(16)
    expect(parseWaveTarget('0')).toBeNull()
    expect(parseWaveTarget('1234567')).toBeNull()
  })
  it('rank milestones fire on firsts only', () => {
    expect(rankMilestone(null, 12)).toBeNull()
    expect(rankMilestone(12, 10)).toBe('top10')
    expect(rankMilestone(10, 5)).toBeNull()
    expect(rankMilestone(5, 1)).toBe('first')
    expect(rankMilestone(1, 1)).toBeNull()
    expect(rankMilestone(null, 1)).toBe('first')
  })
})
