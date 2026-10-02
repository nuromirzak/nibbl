import { LABEL_MAX, NAME_MAX } from './config'
import { utcText } from './hud'

// /api/name answers name_* or label_* codes (apps/api/src/lib/filter.ts); each becomes one sentence.
export const nameErrorText = (field: 'name' | 'label', code: string, retryAt: number | null, now: number): string => {
  const max = field === 'name' ? NAME_MAX : LABEL_MAX
  const reason = code.startsWith(`${field}_`) ? code.slice(field.length + 1) : code
  if (reason === 'empty') return `A ${field} needs at least one letter or digit.`
  if (reason === 'too_long') return `A ${field} is at most ${max} characters.`
  if (reason === 'invalid_chars') {
    return `A ${field} may use letters, digits, spaces and . , ' ! ? & + ( ) _ - only, and may not look like a serial such as #42.`
  }
  if (reason === 'url') return `A ${field} cannot look like a link.`
  if (reason === 'blocked') return `That ${field} is not allowed. Try another one.`
  if (reason === 'rate_limited' && field === 'name') {
    return retryAt === null ? 'You can rename once a week.' : `You can rename once a week. Next rename from ${utcText(retryAt)}.`
  }
  if (reason === 'rate_limited') {
    const seconds = retryAt === null ? 60 : Math.max(1, Math.ceil((retryAt - now) / 1000))
    return `Labels change at most once a minute. Try again in ${seconds}s.`
  }
  return `The server answered ${code}. Try again later.`
}

// Import answers 401 for a wrong serial/token; raw server codes are never shown.
export const importErrorText = (status: number): string => {
  if (status === 401) return 'The server did not accept that code. Check it, or export a fresh one on the other machine.'
  if (status === 400) return 'The server could not use that code. Check that you copied all of it, or export a fresh one.'
  if (status === 429) return 'The server asked for a pause. Try the import again in a while.'
  return 'The server could not finish the import. Try again later.'
}
