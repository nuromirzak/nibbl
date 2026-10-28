import { describe, expect, it } from 'vitest'
import { NOTES, fillNote, isSkipped, nextNote, noteAt, noteOrder, shownNotes, totalNotes } from '../src/notes'
import { achievementToastText, giftCodeOf, giftCodeText, inviteToastText, parseActive, parseGuests, parseInvites, parseWaves, parseUnlocked, parseWeekWin, weekToastText, parseSocial, parseWaveTarget, rankLine, rankMilestone, waveToastText } from '../src/social'
import { isNewer } from '../src/version'

describe('notes', () => {
  it('has 20 notes and a stable per-seed permutation', () => {
    expect(NOTES).toHaveLength(20)
    const order = noteOrder(123456)
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i))
    expect(noteOrder(123456)).toEqual(order)
    expect(noteOrder(654321)).not.toEqual(order)
  })
  it('keeps note 1 first and the last note last, for any seed', () => {
    for (const seed of [0, 1, 7, 123456, 2 ** 31, 0xffffffff]) {
      const order = noteOrder(seed)
      expect(order[0]).toBe(0)
      expect(order[19]).toBe(19)
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i))
    }
    const middles = new Set(Array.from({ length: 30 }, (_, s) => noteOrder(s).slice(1, 19).join()))
    expect(middles.size).toBeGreaterThan(20)
  })
  it('skips the naming tip for a named pet and the level 10 tease from level 10', () => {
    expect(isSkipped(2, { name: 'Pixel', level: 1 })).toBe(true)
    expect(isSkipped(2, { name: null, level: 1 })).toBe(false)
    expect(isSkipped(9, { name: null, level: 9 })).toBe(false)
    expect(isSkipped(9, { name: null, level: 10 })).toBe(true)
    expect(totalNotes({ name: null, level: 1 })).toBe(20)
    expect(totalNotes({ name: 'P', level: 1 })).toBe(19)
    expect(totalNotes({ name: 'P', level: 12 })).toBe(18)
    for (const seed of [1, 2, 3, 99]) {
      const pet = { seed, name: 'P', level: 12 }
      const order = noteOrder(seed)
      const delivered: number[] = []
      for (let idx = nextNote(pet, 0); idx < 20; idx = nextNote(pet, idx + 1)) delivered.push(order[idx]!)
      expect(delivered).toHaveLength(18)
      expect(delivered).not.toContain(2)
      expect(delivered).not.toContain(9)
      expect(delivered[0]).toBe(0)
      expect(delivered.at(-1)).toBe(19)
      expect(shownNotes(pet, 20)).toHaveLength(18)
    }
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
    expect(s).toEqual({ waves: [{ from: 3, name: null }], rank: { pos: 2, total: 5, above: null }, latest: '0.2.0', unlocked: [], invites: [], weekWin: null, active: null })
  })
  it('ignores junk', () => {
    expect(parseSocial({ waves: 1, rank: [], latest: 2 })).toEqual({ waves: [], rank: null, latest: null, unlocked: [], invites: [], weekWin: null, active: null })
    expect(parseSocial({})).toEqual({ waves: [], rank: null, latest: null, unlocked: [], invites: [], weekWin: null, active: null })
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

describe('0.3.0 sync fields', () => {
  it('keeps known achievement ids once and drops the rest', () => {
    expect(parseUnlocked(['bug-hunter', 'bug-hunter', 'nope', 3, null, 'first-bite'])).toEqual(['bug-hunter', 'first-bite'])
    expect(parseUnlocked('bug-hunter')).toEqual([])
  })
  it('reads invites leniently, at most 5', () => {
    expect(parseInvites([{ serial: 27, name: 'Zed' }, { serial: 0 }, { serial: 'x' }, 7, { serial: 5, name: '' }])).toEqual([
      { serial: 27, name: 'Zed' },
      { serial: 5, name: null },
    ])
    expect(parseInvites(Array.from({ length: 9 }, (_, i) => ({ serial: i + 1, name: null })))).toHaveLength(5)
    expect(parseInvites({})).toEqual([])
  })
  it('reads a week win only in its exact shape', () => {
    expect(parseWeekWin({ week: '2026-W43', gain: 1240 })).toEqual({ week: '2026-W43', gain: 1240 })
    for (const bad of [null, 1, [], {}, { week: 'x', gain: 1 }, { week: '2026-W43', gain: 'a' }, { week: '2026-W43', gain: Infinity }]) expect(parseWeekWin(bad)).toBeNull()
  })
  it('words the toasts', () => {
    expect(achievementToastText(['bug-hunter'], 'Pixel')).toBe('🏆 Pixel unlocked Bug Hunter')
    expect(achievementToastText(['bug-hunter', 'first-bite', 'teen'], 'Pixel')).toBe('Pixel unlocked 3 achievements')
    expect(achievementToastText([], 'Pixel')).toBeNull()
    expect(inviteToastText([{ serial: 27, name: null }])).toBe("Your friend's nibbl #000027 hatched. You are Friends now ♥")
    expect(inviteToastText([{ serial: 27, name: null }, { serial: 28, name: null }])).toBe('2 friends hatched their nibbls. You are Friends now ♥')
    expect(weekToastText('Pixel', 'https://getnibbl.pages.dev')).toBe('Pixel is the Nibbl of the Week! https://getnibbl.pages.dev/week')
  })
})

describe('0.4.0 sync fields', () => {
  const LOOK = { seed: 77, tier: 'epic', shiny: true, level: 12 }
  it('reads the look of a wave and keeps old-shape waves as they are', () => {
    expect(parseWaves([{ from: 3, name: 'Zed', ...LOOK }, { from: 4, name: null }])).toEqual([
      { from: 3, name: 'Zed', look: LOOK },
      { from: 4, name: null },
    ])
  })
  it('ignores a malformed look but keeps the wave', () => {
    for (const bad of [{ seed: 'x' }, { tier: 'mythic' }, { shiny: 1 }, { level: 0 }, { level: 2.5 }, { seed: -1 }, { seed: 2 ** 32 }]) {
      expect(parseWaves([{ from: 3, name: null, ...LOOK, ...bad }])).toEqual([{ from: 3, name: null }])
    }
    expect(parseWaves([{ from: 3, name: null, seed: 1 }])).toEqual([{ from: 3, name: null }])
  })
  it('reads active only as a non-negative integer', () => {
    expect(parseActive(12)).toBe(12)
    expect(parseActive(0)).toBe(0)
    for (const bad of [-1, 1.5, '12', null, undefined, NaN, {}]) expect(parseActive(bad)).toBeNull()
    expect(parseSocial({ active: 4 }).active).toBe(4)
  })
  it('keeps gift and mark on invites, and words the gift toast', () => {
    const [a, b] = parseInvites([{ serial: 31, name: 'Ziutek', gift: true, mark: { motif: 'star', spot: 'cheek' } }, { serial: 32, name: null, gift: true }])
    expect(a).toEqual({ serial: 31, name: 'Ziutek', gift: true, marked: true })
    expect(b).toEqual({ serial: 32, name: null, gift: true })
    expect(inviteToastText([a!])).toBe("Your egg hatched at a friend's: Ziutek #000031 has your mark ♥")
    expect(inviteToastText([b!])).toBe("Your egg hatched at a friend's: #000032 is your nibbl's child ♥")
    expect(parseInvites([{ serial: 5, name: null, gift: 'yes', mark: {} }])).toEqual([{ serial: 5, name: null }])
  })
  it('reads waiting guests back leniently', () => {
    expect(parseGuests([{ from: 3, name: 'Zed', look: LOOK }, { from: 4, look: { seed: 1 } }, 'x', { from: 0, look: LOOK }])).toEqual([{ from: 3, name: 'Zed', look: LOOK }])
    expect(parseGuests('x')).toEqual([])
  })
  it('normalizes gift codes', () => {
    expect(giftCodeOf('abcde-fghjk')).toBe('ABCDEFGHJK')
    expect(giftCodeOf(' ABCDE FGHJK ')).toBe('ABCDEFGHJK')
    expect(giftCodeOf('OIL0U-1lo0u')).toBe('0110V1100V')
    for (const bad of ['', 'ABCDE-FGHJ', 'ABCDE-FGHJKL', 'ABCDE-FGH!K', 5, null]) expect(giftCodeOf(bad)).toBeNull()
    expect(giftCodeText('ABCDEFGHJK')).toBe('ABCDE-FGHJK')
  })
})
