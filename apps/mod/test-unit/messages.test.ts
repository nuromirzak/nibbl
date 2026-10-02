import { describe, expect, it } from 'vitest'
import { nameErrorText } from '../src/messages'

const NOW = Date.UTC(2026, 9, 2, 9, 0)

describe('nameErrorText', () => {
  it.each([
    ['name', 'name_empty', 'A name needs at least one letter or digit.'],
    ['name', 'name_too_long', 'A name is at most 16 characters.'],
    ['label', 'label_too_long', 'A label is at most 24 characters.'],
    ['name', 'name_url', 'A name cannot look like a link.'],
    ['label', 'label_blocked', 'That label is not allowed. Try another one.'],
  ] as const)('%s %s', (field, code, text) => expect(nameErrorText(field, code, null, NOW)).toBe(text))

  it('explains the allowed characters', () => {
    expect(nameErrorText('name', 'name_invalid_chars', null, NOW)).toMatch(/letters, digits, spaces/)
  })

  it('says when the weekly rename opens again and counts down the label minute', () => {
    expect(nameErrorText('name', 'name_rate_limited', NOW + 7 * 86_400_000, NOW)).toBe('You can rename once a week. Next rename from 2026-10-09 09:00 UTC.')
    expect(nameErrorText('label', 'label_rate_limited', NOW + 41_500, NOW)).toBe('Labels change at most once a minute. Try again in 42s.')
  })

  it('falls back to the raw code', () => {
    expect(nameErrorText('name', 'busy', null, NOW)).toBe('The server answered busy. Try again later.')
  })
})
