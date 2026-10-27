// The 0.3.0 commands: /nibbl share, /nibbl achievements and /nibbl invite.
import { ACHIEVEMENTS, ZERO_TOTALS, achievementById, levelFromXp, nextUp, stageForLevel, type AchievementFacts } from '@nibbl/core'
import type { EngineInterface } from 'claude-code'

import { apiBase, getWithin } from './api'
import { K } from './config'
import { cardUrl } from './hud'
import { padSerial } from './pet'
import { refreshView } from './model'
import { parseWaveTarget, giftCodeOf } from './social'
import { eggCommand } from './gift'
import { loadPet, loadSpike } from './store'

const ACHIEVEMENTS_TIMEOUT_MS = 5_000
const LINKING = 'Your nibbl is still linking to the server. Try again in a minute.'

const article = (word: string): string => (/^[aeiou]/i.test(word) ? 'an' : 'a')

export const shareLine = (p: { name: string | null; serial: number; tier: string; xp: number }, url: string): string => {
  const stage = stageForLevel(levelFromXp(p.xp).level)
  const who = p.name && p.name.length > 0 ? `Meet ${p.name}, my nibbl` : 'Meet my nibbl'
  return `${who} #${padSerial(p.serial)}, ${article(p.tier)} ${p.tier} ${stage}. It eats my bugs in Claude Code. ${url}`
}

// No network: the card URL, a ready line, and the X intent link that carries it.
export const shareCommand = async ($: EngineInterface): Promise<string> => {
  const pet = await loadPet($)
  if (!pet) return (await loadSpike($)) ? LINKING : 'Hatch the egg first, then share it.'
  const view = await refreshView($)
  const url = cardUrl(await apiBase($), pet.serial)
  const line = shareLine({ name: pet.name, serial: pet.serial, tier: pet.tier, xp: view?.xp ?? pet.xp }, url)
  return [`card: ${url}`, line, `Post it: https://x.com/intent/post?text=${encodeURIComponent(line)}`, 'Profile badge: /nibbl badge'].join('\n')
}

// No network: the markdown for a GitHub profile README, built from the card URL and the badge the server draws.
export const badgeMarkdown = (base: string, serial: number): string => `[![nibbl](${base}/p/${padSerial(serial)}/badge.svg)](${base}/p/${padSerial(serial)})`

export const badgeCommand = async ($: EngineInterface): Promise<string> => {
  const pet = await loadPet($)
  if (!pet) return (await loadSpike($)) ? LINKING : 'Hatch the egg first.'
  return [badgeMarkdown(await apiBase($), pet.serial), 'Paste it into your GitHub profile README (the repo named after your username).'].join('\n')
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// Lenient reading of GET /api/pet/:serial: unknown ids and malformed rows are dropped.
export const parsePublicPet = (body: Record<string, unknown>): { unlocked: { id: string; at: number }[]; facts: AchievementFacts } => {
  const unlocked: { id: string; at: number }[] = []
  if (Array.isArray(body.achievements)) {
    for (const a of body.achievements) {
      if (isObj(a) && typeof a.id === 'string' && achievementById(a.id) && typeof a.at === 'number' && Number.isFinite(a.at) && !unlocked.some(u => u.id === a.id)) {
        unlocked.push({ id: a.id, at: a.at })
      }
    }
  }
  const t = isObj(body.totals) ? body.totals : {}
  const totals = {
    turns: count(t.turns),
    checks: count(t.checks),
    commits: count(t.commits),
    errors: count(t.errors),
    pets: count(t.pets),
    wavesSent: count(t.wavesSent),
    activeDays: count(t.activeDays),
  }
  const facts: AchievementFacts = {
    ...ZERO_TOTALS,
    ...totals,
    level: count(body.level),
    friends: count(body.friends) > 0 || typeof body.invitedBy === 'number',
    weekWins: count(body.weekWins),
  }
  return { unlocked, facts }
}

const dayText = (at: number): string => new Date(at).toISOString().slice(0, 10)

export const achievementsText = (body: Record<string, unknown>): string => {
  const { unlocked, facts } = parsePublicPet(body)
  const lines = [`Achievements (${unlocked.length} of ${ACHIEVEMENTS.length}):`]
  for (const u of unlocked) lines.push(`  ${achievementById(u.id)!.name} - ${dayText(u.at)} UTC`)
  const next = nextUp(facts, new Set(unlocked.map(u => u.id)), 3)
  if (next.length === 0) lines.push('All unlocked.')
  else {
    lines.push('Next:')
    for (const n of next) lines.push(`  ${n.name} ${n.value}/${n.goal}`)
  }
  return lines.join('\n')
}

export const achievementsCommand = async ($: EngineInterface): Promise<string> => {
  const pet = await loadPet($)
  if (!pet) return (await loadSpike($)) ? LINKING : 'Hatch the egg first.'
  const out = await getWithin($, await apiBase($), `/api/pet/${pet.serial}`, ACHIEVEMENTS_TIMEOUT_MS)
  if (out.kind === 'offline') return 'Could not reach the nibbl server. Try again later.'
  if (out.kind === 'error') return out.status === 404 ? 'Your nibbl is hidden from the board, so its card is private.' : `The server answered ${out.code}. Try again later.`
  return achievementsText(out.body)
}

export const INSTALL = ['/plugin marketplace add https://getnibbl.pages.dev/marketplace.json', '/plugin install nibbl@nibbl']

export const INVITE_USAGE = 'Usage: /nibbl invite <serial>, for example /nibbl invite 19. Run it before your egg hatches. Or use /nibbl egg <code>.'

// /nibbl invite is an alias of /nibbl egg (0.4.0): no argument and code-shaped arguments go there,
// a plain serial keeps the 0.3.0 behaviour.
export const inviteCommand = async ($: EngineInterface, rest: string): Promise<string> => {
  if (rest === '' || (parseWaveTarget(rest) === null && giftCodeOf(rest) !== null)) return eggCommand($, rest)
  const pet = await loadPet($)
  const hasPet = pet !== null || (await loadSpike($)) !== null
  if (hasPet) return 'Invites work only before your egg hatches.'
  const code = parseWaveTarget(rest)
  if (code === null) return INVITE_USAGE
  await $.store.set(K.inviteCode, code)
  return `Saved. If #${padSerial(code)} exists, your nibbls become Friends when your egg hatches.`
}
