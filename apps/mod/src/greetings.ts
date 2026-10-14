// The daily greeting (0.3.0): 32 lines in 4 buckets by local hour, one picked per local day.
import { mulberry32 } from '@nibbl/core'

export type Bucket = 'morning' | 'afternoon' | 'evening' | 'night'

export const GREETINGS: Record<Bucket, readonly string[]> = {
  morning: [
    'Good morning! {name} is stretching.',
    'Morning. {name} saved you the first bug of the day.',
    'Rise and ship. {name} is ready.',
    'Good morning! Coffee for you, bugs for {name}.',
    'Morning! {name} has been waiting by the prompt.',
    'New day, clean slate. {name} says hi.',
    "Good morning. Let's make the tests green.",
    'Morning! {name} did a little wiggle when you came back.',
  ],
  afternoon: [
    'Good afternoon! {name} is wide awake.',
    'Back after lunch? {name} is hungry too.',
    'Afternoon. {name} kept your seat warm.',
    'Hi again! {name} counted the minutes.',
    'Good afternoon. One commit at a time.',
    'Afternoon! {name} found a sunny spot above the prompt.',
    'Hey! {name} is ready for whatever breaks next.',
    'Good afternoon. Small steps, green checks.',
  ],
  evening: [
    "Good evening! {name} is glad you're here.",
    'Evening session? {name} brought snacks.',
    'Good evening. {name} is in a cozy mood.',
    "Evening! Let's finish what we started.",
    'Hi! {name} likes the quiet evening hours.',
    'Good evening. {name} will keep you company.',
    'Evening, coder. {name} is all ears.',
    'One more feature? {name} believes in you.',
  ],
  night: [
    'Late night? {name} put on a nightcap.',
    'Burning the midnight oil. {name} is here with you.',
    'Hello, night owl. {name} is wide awake for you.',
    'Shh, the bugs are sleeping. Good time to catch them.',
    'Late session. {name} says: drink some water.',
    'Night mode on. {name} is keeping watch.',
    'Still up? {name} too.',
    'Quiet hours. {name} is happy you stopped by.',
  ],
}

export const bucketOfHour = (hour: number): Bucket =>
  hour >= 5 && hour <= 11 ? 'morning' : hour >= 12 && hour <= 17 ? 'afternoon' : hour >= 18 && hour <= 22 ? 'evening' : 'night'

const DAY_MS = 86_400_000

// The local calendar day as a number: floor((now + offset) / day).
export const localDay = (now: number, offsetMin: number): number => Math.floor((now + offsetMin * 60_000) / DAY_MS)

export const localHourOf = (now: number, offsetMin: number): number => {
  const minutes = Math.floor(now / 60_000) + offsetMin
  return Math.floor((((minutes % 1440) + 1440) % 1440) / 60)
}

export const greetingFor = (seed: number, now: number, offsetMin: number, name: string): string => {
  const lines = GREETINGS[bucketOfHour(localHourOf(now, offsetMin))]
  const rng = mulberry32((seed ^ localDay(now, offsetMin)) >>> 0)
  return lines[rng() % lines.length]!.replaceAll('{name}', name)
}
