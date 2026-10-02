import { CAPS_PER_HOUR, mulberry32, XP_PER_EVENT, xpToNext, type Tier } from '@nibbl/core'

// Decision 0009: 12 seeded nibbls. Retire one with `UPDATE pets SET is_hidden = 1 WHERE serial = N`.
// All bots are Genesis (every real pet in the first 30 days is) and form a closed-beta cohort that
// hatched 30-75 days before LAUNCH_AT (2026-10-31T00:00:00Z). Seeded XP must be reachable for the
// bot's age at SEED_XP_PER_HOUR, measured up to SEED_REF_AT, or the numbers would give it away.
export const SEED_LAUNCH_AT = Date.UTC(2026, 9, 31)
export const SEED_REF_AT = SEED_LAUNCH_AT - 30 * 24 * 3_600_000
export const SEED_XP_PER_HOUR = 10
export const seedXpBudget = (hatchedAt: number): number => ((SEED_REF_AT - hatchedAt) / 3_600_000) * SEED_XP_PER_HOUR

export type BotSpec = {
  serial: number
  name: string
  label: string
  tier: Tier
  shiny: boolean
  genesis: boolean
  seed: number
  level: number
  extraXp: number
  hatchedAt: number
  tz: number
  owl: boolean
}

export const BOTS: readonly BotSpec[] = [
  { serial: 1, name: 'Byte', label: 'night coder', tier: 'epic', shiny: false, genesis: true, seed: 2654435761, level: 25, extraXp: 140, hatchedAt: Date.UTC(2026, 7, 17, 7, 23), tz: 5, owl: true },
  { serial: 2, name: 'Segfault', label: 'rust in prod', tier: 'rare', shiny: false, genesis: true, seed: 1013904223, level: 24, extraXp: 210, hatchedAt: Date.UTC(2026, 7, 21, 18, 47), tz: 1, owl: false },
  { serial: 3, name: 'Mochi', label: 'frontend gremlin', tier: 'uncommon', shiny: false, genesis: true, seed: 3141592653, level: 22, extraXp: 90, hatchedAt: Date.UTC(2026, 7, 25, 11, 12), tz: -5, owl: false },
  { serial: 4, name: 'Kernel', label: 'tabs not spaces', tier: 'common', shiny: false, genesis: true, seed: 2718281828, level: 21, extraXp: 310, hatchedAt: Date.UTC(2026, 7, 29, 21, 36), tz: 2, owl: false },
  { serial: 5, name: 'Pico', label: 'ships on fridays', tier: 'legendary', shiny: false, genesis: true, seed: 1618033988, level: 19, extraXp: 50, hatchedAt: Date.UTC(2026, 8, 2, 9, 8), tz: -8, owl: false },
  { serial: 6, name: 'Nimbus', label: 'on call again', tier: 'common', shiny: false, genesis: true, seed: 1414213562, level: 18, extraXp: 220, hatchedAt: Date.UTC(2026, 8, 6, 16, 51), tz: 0, owl: true },
  { serial: 7, name: 'Tofu', label: 'types or bust', tier: 'uncommon', shiny: false, genesis: true, seed: 1732050807, level: 16, extraXp: 30, hatchedAt: Date.UTC(2026, 8, 10, 5, 29), tz: 9, owl: false },
  { serial: 8, name: 'Rune', label: 'vim since 2009', tier: 'rare', shiny: true, genesis: true, seed: 2236067977, level: 15, extraXp: 160, hatchedAt: Date.UTC(2026, 8, 14, 19, 4), tz: 3, owl: false },
  { serial: 9, name: 'Gizmo', label: 'monorepo enjoyer', tier: 'common', shiny: false, genesis: true, seed: 2645751311, level: 13, extraXp: 80, hatchedAt: Date.UTC(2026, 8, 18, 12, 43), tz: -3, owl: false },
  { serial: 10, name: 'Quill', label: 'docs first', tier: 'uncommon', shiny: false, genesis: true, seed: 3316624790, level: 12, extraXp: 45, hatchedAt: Date.UTC(2026, 8, 21, 22, 17), tz: 1, owl: false },
  { serial: 11, name: 'Ziggy', label: 'it works locally', tier: 'epic', shiny: false, genesis: true, seed: 3605551275, level: 10, extraXp: 140, hatchedAt: Date.UTC(2026, 8, 24, 9, 38), tz: -6, owl: true },
  { serial: 12, name: 'Bitsy', label: '2am debugger', tier: 'common', shiny: false, genesis: true, seed: 4123105625, level: 9, extraXp: 30, hatchedAt: Date.UTC(2026, 8, 26, 20, 14), tz: 8, owl: true },
]

export type HourCounts = { pet: number; turn: number; check_pass: number; commit: number }

export const BOT_CATCH_UP_HOURS = 24

// A bot works like a steady human: active in a quarter of its local work hours (late evening
// for night owls), half as often on weekends, rarely otherwise, and never above player caps.
export const botHourCounts = (bot: Pick<BotSpec, 'serial' | 'tz' | 'owl'>, hour: number): HourCounts => {
  const rng = mulberry32(Math.imul(bot.serial, 0x9e3779b1) ^ hour)
  const localHour = hour + bot.tz
  const clock = ((localHour % 24) + 24) % 24
  // Day 0 (1970-01-01) was a Thursday; 0 = Sunday.
  const weekday = (((Math.floor(localHour / 24) + 4) % 7) + 7) % 7
  const working = bot.owl ? clock >= 20 || clock < 3 : clock >= 9 && clock < 19
  let chance = working ? 25 : 3
  if (weekday === 0 || weekday === 6) chance = Math.floor(chance / 2)
  if (rng() % 100 >= chance) return { pet: 0, turn: 0, check_pass: 0, commit: 0 }
  const turn = 3 + (rng() % 8)
  return {
    turn: Math.min(turn, CAPS_PER_HOUR.turn),
    check_pass: Math.min(rng() % (Math.floor(turn / 2) + 1), CAPS_PER_HOUR.check_pass),
    commit: Math.min(rng() % 3, CAPS_PER_HOUR.commit),
    pet: Math.min(rng() % 3, CAPS_PER_HOUR.pet),
  }
}

export const xpForCounts = (c: HourCounts): number =>
  (Object.keys(c) as (keyof HourCounts)[]).reduce((sum, k) => sum + Math.min(c[k], CAPS_PER_HOUR[k]) * XP_PER_EVENT[k], 0)

export const MAX_HOURLY_XP = xpForCounts(CAPS_PER_HOUR)

export const totalXpForLevel = (level: number): number => {
  let xp = 0
  for (let n = 1; n < level; n++) xp += xpToNext(n)
  return xp
}
