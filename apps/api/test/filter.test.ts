import { describe, expect, it } from 'vitest'
import { checkText, LABEL_MAX, NAME_MAX } from '../src/lib/filter'

const reason = (s: unknown, max = NAME_MAX) => {
  const r = checkText(s, max)
  return r.ok ? 'ok' : r.reason
}

describe('checkText', () => {
  it('accepts normal names in English and Russian', () => {
    for (const s of ['Byte', 'Mochi', 'Пиксель', 'night coder', 'R2-D2', "Rune's pet", 'Kernel #two', 'Mr.Bean']) expect(reason(s, LABEL_MAX)).toBe('ok')
  })

  it('keeps clean words that contain short roots', () => {
    for (const s of ['корабля', 'Небо', 'хлеб', 'Sushi Tako', 'Peacock', 'Grape', 'Assassin', 'awwww']) expect(reason(s)).toBe('ok')
  })

  it('keeps clean words that contain blocked roots', () => {
    for (const s of ['Scunthorpe', 'Therapist', 'Swank', 'Swanky', 'Penistone', 'Shitake', 'Naziv', 'Slutsky', 'Cocktail']) expect(reason(s)).toBe('ok')
    for (const s of ['rapist', 'wanker', 'nazi', 'slut']) expect(reason(s)).toBe('blocked')
  })

  it('rejects variation selectors and orphan combining marks', () => {
    for (const s of ['a\uFE0F', '\u0301a', 'a \u0301b', 'a\u{E0100}']) expect(reason(s)).toBe('invalid_chars')
    for (const s of ['\u00E9', 'e\u0301']) expect(reason(s)).toBe('ok')
  })

  it('normalizes whitespace and returns the cleaned value', () => {
    expect(checkText('  night \t coder ', LABEL_MAX)).toEqual({ ok: true, value: 'night coder' })
  })

  it('enforces length in code points', () => {
    expect(reason('a'.repeat(16))).toBe('ok')
    expect(reason('a'.repeat(17))).toBe('too_long')
    expect(reason('б'.repeat(16))).toBe('ok')
    expect(reason('a'.repeat(24), LABEL_MAX)).toBe('ok')
    expect(reason('a'.repeat(25), LABEL_MAX)).toBe('too_long')
    expect(reason('   ')).toBe('empty')
    expect(reason(42)).toBe('invalid_chars')
  })

  it('rejects control, zero-width, bidi and stacked combining characters', () => {
    for (const s of ['a\u0007b', 'a​b', '‮Byte', 'á́́', 'Byte<script>', 'emoji 🐛', 'a/b', 'a:b']) {
      expect(reason(s)).toBe('invalid_chars')
    }
  })

  it('rejects # followed by a digit, so nobody can pose as another serial', () => {
    for (const s of ['Byte #000001', 'Kernel #2', '#1', 'a #９']) expect(reason(s, LABEL_MAX)).toBe('invalid_chars')
    for (const s of ['#one', 'C# dev', 'Byte 2']) expect(reason(s, LABEL_MAX)).toBe('ok')
  })

  it('collapses runs of 3+ identical letters before the blocklist', () => {
    for (const s of ['fuuuck', 'shiiiit', 'cuuuunt', 'Сууука', 'fuuuuuuck you']) expect(reason(s, LABEL_MAX)).toBe('blocked')
    for (const s of ['awwww', 'Sooo cool', 'zzz']) expect(reason(s, LABEL_MAX)).toBe('ok')
  })

  it('blocks the slurs and roots added after review', () => {
    for (const s of ['kike', 'chink', 'fag', 'dick', 'cock', 'rape', 'rapes', 'пидрила', 'phuck', 'big dick', 'xуевый']) {
      expect(reason(s, LABEL_MAX), s).toBe('blocked')
    }
  })

  it('anchors the short new roots so clean words pass', () => {
    for (const s of ['Grape', 'Drapes', 'Peacock', 'Haddock', 'Benedick', 'Cockpit', 'Dickens', 'Rapeseed', 'Strafag']) {
      expect(reason(s, LABEL_MAX), s).toBe('ok')
    }
  })

  it('keeps Russian words that only contain a root', () => {
    for (const s of ['Страхуем', 'Психуешь', 'Сукачев', 'Сукачёв', 'Matsushita']) expect(reason(s, LABEL_MAX), s).toBe('ok')
    for (const s of ['хуево', 'Хуею']) expect(reason(s, LABEL_MAX), s).toBe('blocked')
  })

  it('rejects URLs', () => {
    for (const s of ['example.com', 'http stuff', 'www', 'nibbl.pet', 't.me']) expect(reason(s)).toBe('url')
  })

  it('blocks profanity through case, leetspeak, spacing and homoglyphs', () => {
    for (const s of ['fuck', 'FuCk3r', 'f.u.c.k', 'f u c k', 'sh1t', 'хуй', 'xyй', 'сука', 'сукa', 'Бля', 'fuсk']) expect(reason(s)).toBe('blocked')
  })
})
