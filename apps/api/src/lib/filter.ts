export const NAME_MAX = 16
export const LABEL_MAX = 24

export type TextCheck =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'too_long' | 'invalid_chars' | 'url' | 'blocked' }

// Letters, combining marks, digits, space and a little punctuation. No emoji: terminal widths vary.
const ALLOWED = /^[\p{L}\p{M}\p{N} .,'!?&+#()_-]+$/u
const STACKED_MARKS = /\p{M}{2,}/u
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
  'fuck', 'shit', 'cunt', 'nigg', 'fagg', 'rapist', 'nazi', 'hitler', 'porn', 'whore', 'slut', 'bitch', 'penis',
  'vagina', 'pussy', 'cocksuck', 'dildo', 'retard', 'wank', 'twat', 'asshole', 'jizz', 'motherf',
] as const
const RU = [
  'хуй', 'хуе', 'хуя', 'пизд', '^еб', 'ебан', 'ебат', 'ебал', 'ебло', 'заеб', 'выеб', 'уеб', 'долбоеб', '^бля', 'сука', 'суки',
  'мудак', 'мудил', 'пидор', 'пидар', 'гандон', 'гондон', 'шлюх', 'залуп', 'дроч', 'жопа', 'нацист', 'гитлер',
] as const

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
  const words = mapChars(clean.toLowerCase(), LEET).split(/[^\p{L}]+/u).filter(Boolean)
  return hits(words.map(w => mapChars(w, TO_LATIN)), EN) || hits(words.map(w => mapChars(w, TO_CYRILLIC)), RU)
}

export const checkText = (raw: unknown, max: number): TextCheck => {
  if (typeof raw !== 'string') return { ok: false, reason: 'invalid_chars' }
  const clean = raw.normalize('NFKC').replace(/\s+/gu, ' ').trim()
  if (clean.length === 0) return { ok: false, reason: 'empty' }
  if ([...clean].length > max) return { ok: false, reason: 'too_long' }
  if (!ALLOWED.test(clean) || STACKED_MARKS.test(clean)) return { ok: false, reason: 'invalid_chars' }
  if (URLISH.test(clean)) return { ok: false, reason: 'url' }
  if (isBlocked(clean)) return { ok: false, reason: 'blocked' }
  return { ok: true, value: clean }
}
