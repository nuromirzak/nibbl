export const NAME_MAX = 16
export const LABEL_MAX = 24

export type TextCheck =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'too_long' | 'invalid_chars' | 'url' | 'blocked' }

// Letters, combining marks, digits, space and a little punctuation. No emoji: terminal widths vary.
const ALLOWED = /^[\p{L}\p{M}\p{N} .,'!?&+#()_-]+$/u
const STACKED_MARKS = /\p{M}{2,}/u
// Variation selectors are \p{M} but invisible; a mark must also follow a base letter or digit.
const VARIATION_SELECTORS = /[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/u
const ORPHAN_MARK = /(^|[^\p{L}\p{N}\p{M}])\p{M}/u
// "Byte #000001" would read as another pet's serial.
const FAKE_SERIAL = /#\s*\p{N}/u
// "fuuuck" and "shiiiit" collapse to their root; doubled letters (Assassin, shiitake) stay.
const LETTER_RUNS = /(\p{L})\1{2,}/gu
const URLISH = /\b(https?|www)\b|\.(com|net|org|io|dev|app|ru|kz|gg|xyz|me|ly|co|sh|so|tv|link|site|online|top|pet)\b/i

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '!': 'i' }
const TO_LATIN: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
}
const TO_CYRILLIC: Record<string, string> = {
  a: 'а', b: 'в', e: 'е', k: 'к', m: 'м', h: 'н', o: 'о', p: 'р', c: 'с', t: 'т', y: 'у', x: 'х', ё: 'е',
}

// A leading ^ means the root must start a word (бля hides inside корабля, еб inside хлеб).
const EN = [
  'fuck', 'shit', 'cunt', 'nigg', 'fagg', '^rapist', '^nazi', 'hitler', 'porn', 'whore', '^slut', 'bitch', '^penis',
  'vagina', 'pussy', 'cocksuck', 'dildo', 'retard', '^wank', 'twat', 'asshole', 'jizz', 'motherf',
  '^kike', '^chink', '^fag', '^dick', '^cock', '^rape', 'phuck',
] as const
const RU = [
  // хуе only at word start: страхуем and психуешь are clean.
  'хуй', '^хуе', 'хуя', 'пизд', '^еб', 'ебан', 'ебат', 'ебал', 'ебло', 'заеб', 'выеб', 'уеб', 'долбоеб', '^бля', 'сука', 'суки',
  'мудак', 'мудил', 'пидор', 'пидар', 'пидрил', 'гандон', 'гондон', 'шлюх', 'залуп', 'дроч', 'жопа', 'нацист', 'гитлер',
] as const

// Clean words that contain or start with a blocked root; checked per word before the English blocklist.
const EN_ALLOW = new Set([
  'scunthorpe', 'therapist', 'penistone', 'shiitake', 'shitake', 'swank', 'swanky', 'cocktail', 'assassin', 'naziv', 'slutsky',
  'matsushita', 'cockpit', 'cockatoo', 'cockatiel', 'cockroach', 'dickens', 'dickinson', 'rapeseed',
])
const RU_ALLOW = new Set(['сукачев'])

const mapChars = (s: string, table: Record<string, string>) => [...s].map(ch => table[ch] ?? ch).join('')

// Words plus runs of spaced single letters ("f u c k"), so a root never spans two real words.
const pieces = (words: string[]): string[] => {
  const out = [...words]
  let run = ''
  for (const w of [...words, '']) {
    if (w.length === 1) run += w
    else {
      if (run.length > 1) out.push(run)
      run = ''
    }
  }
  return out
}

const hits = (words: string[], roots: readonly string[]): boolean => {
  const all = pieces(words)
  return roots.some(root =>
    root.startsWith('^') ? words.some(w => w.startsWith(root.slice(1))) : all.some(p => p.includes(root)),
  )
}

const isBlocked = (clean: string): boolean => {
  const words = mapChars(clean.toLowerCase(), LEET).replace(LETTER_RUNS, '$1').split(/[^\p{L}]+/u).filter(Boolean)
  return (
    hits(words.map(w => mapChars(w, TO_LATIN)).filter(w => !EN_ALLOW.has(w)), EN) ||
    hits(words.map(w => mapChars(w, TO_CYRILLIC)).filter(w => !RU_ALLOW.has(w)), RU)
  )
}

export const checkText = (raw: unknown, max: number): TextCheck => {
  if (typeof raw !== 'string') return { ok: false, reason: 'invalid_chars' }
  const clean = raw.normalize('NFKC').replace(/\s+/gu, ' ').trim()
  if (clean.length === 0) return { ok: false, reason: 'empty' }
  if ([...clean].length > max) return { ok: false, reason: 'too_long' }
  if (!ALLOWED.test(clean) || FAKE_SERIAL.test(clean) || STACKED_MARKS.test(clean) || VARIATION_SELECTORS.test(clean) || ORPHAN_MARK.test(clean)) return { ok: false, reason: 'invalid_chars' }
  if (URLISH.test(clean)) return { ok: false, reason: 'url' }
  if (isBlocked(clean)) return { ok: false, reason: 'blocked' }
  return { ok: true, value: clean }
}
