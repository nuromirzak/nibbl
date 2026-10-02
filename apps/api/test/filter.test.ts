import { describe, expect, it } from 'vitest'
import { checkText, LABEL_MAX, NAME_MAX } from '../src/lib/filter'

const reason = (s: unknown, max = NAME_MAX) => {
  const r = checkText(s, max)
  return r.ok ? 'ok' : r.reason
}

describe('checkText', () => {
  it('accepts normal names in English and Russian', () => {
    for (const s of ['Byte', 'Mochi', 'Пиксель', 'night coder', 'R2-D2', "Rune's pet", 'Kernel #2', 'Mr.Bean']) expect(reason(s, LABEL_MAX)).toBe('ok')
  })

  it('keeps clean words that contain short roots', () => {
    for (const s of ['корабля', 'Небо', 'хлеб', 'Sushi Tako', 'Peacock', 'Grape', 'Assassin', 'awwww']) expect(reason(s)).toBe('ok')
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

  it('rejects URLs', () => {
    for (const s of ['example.com', 'http stuff', 'www', 'nibbl.pet', 't.me']) expect(reason(s)).toBe('url')
  })

  it('blocks profanity through case, leetspeak, spacing and homoglyphs', () => {
    for (const s of ['fuck', 'FuCk3r', 'f.u.c.k', 'f u c k', 'sh1t', 'хуй', 'xyй', 'сука', 'сукa', 'Бля', 'fuсk']) expect(reason(s)).toBe('blocked')
  })
})
