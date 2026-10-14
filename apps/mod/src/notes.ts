import { mulberry32 } from '@nibbl/core'

import { padSerial } from './pet'

// Twenty notes from the maker, bundled so they work offline. {name} and {serial} are filled per pet.
export const NOTES: readonly string[] = [
  'Hi, I made nibbl. Thanks for keeping {name} alive. It means more than a star.',
  '{name} has never seen your code. It only knows that you showed up.',
  "Tip: /nibbl name gives it a name. Most nibbls still don't have one.",
  "Somewhere right now another nibbl is eating a bug. You're not coding alone.",
  'Only 3% of eggs hatch legendary. {name} is one of a kind anyway.',
  "Tests went red? That's just lunch for {name}.",
  'Tip: /nibbl wave <serial> sends a heart to another nibbl. Try the one above you.',
  "Long day? {name} doesn't count hours, only the times you came back.",
  'Every serial is issued once and never reused. #{serial} is yours forever.',
  'Your nibbl changes shape at level 10. No spoilers.',
  'I read every GitHub issue. Tell me what {name} should do next.',
  'Breaks are allowed. {name} sleeps fine and never dies.',
  'Commit early, commit often. {name} likes the crunch.',
  'Tip: /nibbl odds shows your rarest trait. Some are 1 in 24.',
  'Someone in another country hatched a nibbl today. Hi to both of you.',
  "Nibbl is one person's side project. Thanks for being one of the first.",
  "{name}'s card is public: getnibbl.pages.dev/p/{serial}. Show it off if you like.",
  'Green build, happy pet. Red build, fed pet. {name} wins either way.',
  'If {name} made you smile once this week, it did its job.',
  'Still here? So am I. See you at the next level.',
]

// A fresh shuffle of 0..n-1 for this pet: the same seed always gives the same order, so the next
// note is always known from the index alone and no note repeats.
export const noteOrder = (seed: number, n: number = NOTES.length): number[] => {
  const order = Array.from({ length: n }, (_, i) => i)
  const rng = mulberry32(seed)
  for (let i = n - 1; i > 0; i--) {
    const j = rng() % (i + 1)
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  return order
}

// The public card URL takes the plain serial; everywhere else the serial is the padded #000042 form.
export const fillNote = (text: string, name: string, serial: number): string =>
  text.replaceAll('/p/{serial}', `/p/${serial}`).replaceAll('{name}', name).replaceAll('{serial}', padSerial(serial))

export const noteAt = (seed: number, index: number, name: string, serial: number): string =>
  fillNote(NOTES[noteOrder(seed)[index]!]!, name, serial)
