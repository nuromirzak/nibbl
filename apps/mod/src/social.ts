// Pure helpers for the social layer (0.2.0): lenient parsing of the optional /api/sync fields and
// every line of text they produce. Nothing here touches the engine, so vitest covers it directly.
import { padSerial } from './pet'

export type WaveIn = { from: number; name: string | null }
export type WaveSeen = WaveIn & { at: number }
export type RankAbove = { serial: number; name: string | null; tier: string; xp: number }
export type RankInfo = { pos: number; total: number; above: RankAbove | null }
export type Social = { waves: WaveIn[]; rank: RankInfo | null; latest: string | null }

const isPosInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1
const isNameOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string'
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export const parseWaves = (v: unknown): WaveIn[] => {
  if (!Array.isArray(v)) return []
  const out: WaveIn[] = []
  for (const w of v.slice(0, 5)) {
    if (isObj(w) && isPosInt(w.from) && isNameOrNull(w.name ?? null)) out.push({ from: w.from, name: typeof w.name === 'string' && w.name.length > 0 ? w.name : null })
  }
  return out
}

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

// Missing or malformed optional fields are ignored, never an error: a 0.2.0 mod must keep working
// against an older server and against a server that changes these shapes.
export const parseSocial = (body: Record<string, unknown>): Social => ({
  waves: parseWaves(body.waves),
  rank: parseRank(body.rank),
  latest: parseLatest(body.latest),
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

export const labelOf = (name: string | null, serial: number): string => (name ? `${name} #${padSerial(serial)}` : `#${padSerial(serial)}`)

export const waveToastText = (waves: readonly WaveIn[], me: string): string | null => {
  if (waves.length === 0) return null
  if (waves.length === 1) return `${labelOf(waves[0]!.name, waves[0]!.from)} waved at ${me} ♥`
  return `${waves.length} nibbls waved at ${me} ♥`
}

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
