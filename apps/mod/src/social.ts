// Pure helpers for the social layer (0.2.0): lenient parsing of the optional /api/sync fields and
// every line of text they produce. Nothing here touches the engine, so vitest covers it directly.
import { achievementById, TIERS, type Tier } from '@nibbl/core'

import { padSerial } from './pet'

// What a 0.4.0 server adds to a wave: the sender's look, so the pet can visit. Absent from older servers.
export type GuestLook = { seed: number; tier: Tier; shiny: boolean; level: number }
export type WaveIn = { from: number; name: string | null; look?: GuestLook }
export type WaveSeen = WaveIn & { at: number }
export type RankAbove = { serial: number; name: string | null; tier: string; xp: number }
export type RankInfo = { pos: number; total: number; above: RankAbove | null }
// gift: the friend hatched from one of this pet's gift eggs; marked: the child inherited its mark.
export type InviteIn = { serial: number; name: string | null; gift?: true; marked?: true }
export type WeekWin = { week: string; gain: number }
export type Social = {
  waves: WaveIn[]
  rank: RankInfo | null
  latest: string | null
  unlocked: string[]
  invites: InviteIn[]
  weekWin: WeekWin | null
  active: number | null
}

const isPosInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1
const isNameOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string'
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// All four fields must be valid, or there is no look and the wave stays a plain toast.
export const parseLook = (w: Record<string, unknown>): GuestLook | null => {
  const { seed, tier, shiny, level } = w
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) return null
  if (typeof tier !== 'string' || !(TIERS as readonly string[]).includes(tier)) return null
  if (typeof shiny !== 'boolean') return null
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 1000) return null
  return { seed, tier: tier as Tier, shiny, level }
}

export const parseWaves = (v: unknown): WaveIn[] => {
  if (!Array.isArray(v)) return []
  const out: WaveIn[] = []
  for (const w of v.slice(0, 5)) {
    if (isObj(w) && isPosInt(w.from) && isNameOrNull(w.name ?? null)) {
      const look = parseLook(w)
      out.push({ from: w.from, name: typeof w.name === 'string' && w.name.length > 0 ? w.name : null, ...(look ? { look } : {}) })
    }
  }
  return out
}

// A number of pets that synced today; anything else is unknown.
export const parseActive = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)

export const parseRank = (v: unknown): RankInfo | null => {
  if (!isObj(v) || !isPosInt(v.pos) || !isPosInt(v.total)) return null
  let above: RankAbove | null = null
  if (v.above !== null && v.above !== undefined) {
    const a = v.above
    if (!isObj(a) || !isPosInt(a.serial) || !isNameOrNull(a.name ?? null) || typeof a.tier !== 'string' || typeof a.xp !== 'number' || !Number.isFinite(a.xp)) return null
    above = { serial: a.serial, name: typeof a.name === 'string' && a.name.length > 0 ? a.name : null, tier: a.tier, xp: a.xp }
  }
  return { pos: v.pos, total: v.total, above }
}

export const parseLatest = (v: unknown): string | null => (typeof v === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(v) ? v : null)

// Only ids this mod's catalog knows count, each once: a newer server may award ones it cannot name.
export const parseUnlocked = (v: unknown): string[] => {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const id of v) if (typeof id === 'string' && achievementById(id) !== undefined && !out.includes(id)) out.push(id)
  return out
}

export const parseInvites = (v: unknown): InviteIn[] => {
  if (!Array.isArray(v)) return []
  const out: InviteIn[] = []
  for (const i of v.slice(0, 5)) {
    if (isObj(i) && isPosInt(i.serial) && isNameOrNull(i.name ?? null)) {
      const gift = i.gift === true
      out.push({ serial: i.serial, name: typeof i.name === 'string' && i.name.length > 0 ? i.name : null, ...(gift ? { gift: true as const } : {}), ...(gift && isObj(i.mark) ? { marked: true as const } : {}) })
    }
  }
  return out
}

export const parseWeekWin = (v: unknown): WeekWin | null =>
  isObj(v) && typeof v.week === 'string' && /^\d{4}-W\d{2}$/.test(v.week) && typeof v.gain === 'number' && Number.isFinite(v.gain) ? { week: v.week, gain: v.gain } : null

// Missing or malformed optional fields are ignored, never an error: a 0.2.0 mod must keep working
// against an older server and against a server that changes these shapes.
export const parseSocial = (body: Record<string, unknown>): Social => ({
  waves: parseWaves(body.waves),
  rank: parseRank(body.rank),
  latest: parseLatest(body.latest),
  unlocked: parseUnlocked(body.unlocked),
  invites: parseInvites(body.invites),
  weekWin: parseWeekWin(body.weekWin),
  active: parseActive(body.active),
})

export const parseWavesSeen = (v: unknown): WaveSeen[] => {
  if (!Array.isArray(v)) return []
  const out: WaveSeen[] = []
  for (const w of v) {
    if (isObj(w) && isPosInt(w.from) && isNameOrNull(w.name ?? null) && typeof w.at === 'number' && Number.isFinite(w.at)) {
      out.push({ from: w.from, name: typeof w.name === 'string' ? w.name : null, at: w.at })
    }
  }
  return out
}

// A waiting guest: a wave with a look, kept in the store until a visit starts.
export type GuestIn = { from: number; name: string | null; look: GuestLook }

export const parseGuests = (v: unknown): GuestIn[] => {
  if (!Array.isArray(v)) return []
  const out: GuestIn[] = []
  for (const g of v) {
    if (!isObj(g) || !isPosInt(g.from)) continue
    const look = parseLook(isObj(g.look) ? g.look : {})
    if (look) out.push({ from: g.from, name: typeof g.name === 'string' && g.name.length > 0 ? g.name : null, look })
  }
  return out
}

// A gift egg code: 10 base32 characters, typed as XXXXX-XXXXX in any case, with or without the dash
// or spaces. Returns the normalized 10 characters (uppercase), or null.
export const giftCodeOf = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const code = raw.replace(/[-\s]/g, '').toUpperCase()
  return /^[0-9A-Z]{10}$/.test(code) ? code : null
}

export const giftCodeText = (code: string): string => `${code.slice(0, 5)}-${code.slice(5)}`

export const labelOf = (name: string | null, serial: number): string => (name ? `${name} #${padSerial(serial)}` : `#${padSerial(serial)}`)

export const waveToastText = (waves: readonly WaveIn[], me: string): string | null => {
  if (waves.length === 0) return null
  if (waves.length === 1) return `${labelOf(waves[0]!.name, waves[0]!.from)} waved at ${me} ♥`
  return `${waves.length} nibbls waved at ${me} ♥`
}

export const achievementToastText = (ids: readonly string[], me: string): string | null => {
  if (ids.length === 0) return null
  if (ids.length === 1) return `🏆 ${me} unlocked ${achievementById(ids[0]!)?.name ?? ids[0]}`
  return `${me} unlocked ${ids.length} achievements`
}

export const inviteToastText = (invites: readonly InviteIn[]): string | null => {
  if (invites.length === 0) return null
  if (invites.length === 1 && invites[0]!.gift) {
    const who = labelOf(invites[0]!.name, invites[0]!.serial)
    return invites[0]!.marked ? `Your egg hatched at a friend's: ${who} has your mark ♥` : `Your egg hatched at a friend's: ${who} is your nibbl's child ♥`
  }
  if (invites.every(i => i.gift)) return `${invites.length} of your eggs hatched at friends'. They are your nibbl's children ♥`
  if (invites.length === 1) return `Your friend's nibbl #${padSerial(invites[0]!.serial)} hatched. You are Friends now ♥`
  return `${invites.length} friends hatched their nibbls. You are Friends now ♥`
}

export const weekToastText = (me: string, base: string): string => `${me} is the Nibbl of the Week! ${base}/week`

export const rankLine = (r: RankInfo, serverXp: number): string => {
  const head = `rank ${r.pos} of ${r.total}`
  if (!r.above) return `${head} · top of the board`
  const a = r.above
  return `${head} · next: #${padSerial(a.serial)} (${a.xp} xp, ${Math.max(0, a.xp - serverXp)} ahead) · /nibbl wave ${a.serial}`
}

export type RankMilestone = 'first' | 'top10' | null

// Toasts only on firsts: entering the top 10 for the first time, and reaching #1 for the first time.
export const rankMilestone = (best: number | null, pos: number): RankMilestone => {
  if (pos === 1 && (best === null || best > 1)) return 'first'
  if (pos <= 10 && (best === null || best > 10)) return 'top10'
  return null
}

export const UPDATE_HOW = '/plugin marketplace update nibbl, then /plugin update nibbl@nibbl'
// Third-party marketplaces do not auto-update by default, so the line also says how to turn it on.
export const updateLine = (): string => `update: ${UPDATE_HOW} (or turn on auto-update: /plugin > Marketplaces > nibbl)`
export const updateToast = (latest: string): string => `nibbl ${latest} is out: ${UPDATE_HOW}`

export const WAVE_USAGE = 'Usage: /nibbl wave <serial>, for example /nibbl wave 16.'

// "16", "#16" and "000016" all mean serial 16.
export const parseWaveTarget = (raw: string): number | null => {
  const m = /^#?(\d{1,6})$/.exec(raw.trim())
  const n = m ? Number(m[1]) : 0
  return n >= 1 ? n : null
}

export const waveErrorText = (status: number, code: string, to: number): string => {
  const who = `#${padSerial(to)}`
  if (status === 400 && code === 'self_wave') return "You can't wave at yourself."
  if (status === 404) return `No nibbl ${who} to wave at.`
  if (code === 'already_waved') return `You already waved at ${who} today.`
  if (code === 'wave_limit') return "That's 10 waves today. More tomorrow."
  return `The server answered ${code}. Try again later.`
}
