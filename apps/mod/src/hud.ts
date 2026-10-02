import { CAPS_PER_HOUR, HOUR_MS, SHINY_BP, TIER_BP, TIERS, levelFromXp, rarestTrait, traitOdds, type Genome } from '@nibbl/core'

import type { NibblPetView, NibblReaction } from '../types'
import { HATCH_AFTER_TURNS } from './config'
import { padSerial } from './pet'
import { lookOf, statusText } from './reactions'

export const xpBar = (into: number, toNext: number, width = 5): string => {
  const filled = toNext > 0 ? Math.min(width, Math.round((width * into) / toNext)) : 0
  return '▓'.repeat(filled) + '░'.repeat(width - filled)
}

export const heartsBar = (left: number, max = CAPS_PER_HOUR.pet): string => '♥'.repeat(left) + '♡'.repeat(Math.max(0, max - left))

export const pct = (p: number): string => {
  const v = p * 100
  return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)
}

export const rarestLine = (g: Genome): string => {
  const t = rarestTrait(g)
  const label = t.gene === 'mark' || t.gene === 'shiny' ? t.value : `${t.value} ${t.gene}`
  return `${label} ${pct(t.probability)}% odds`
}

export const tierText = (p: { tier: string; shiny: boolean; genesis: boolean }): string =>
  `${p.tier}${p.shiny ? ' · shiny' : ''}${p.genesis ? ' · Genesis' : ''}`

export const titleOf = (p: NibblPetView): string =>
  p.serial === null ? `${p.name} · syncing` : `${p.name} #${padSerial(p.serial)}${p.label ? ` · ${p.label}` : ''}`

export const xpLineOf = (xp: number): string => {
  const lv = levelFromXp(xp)
  return `lvl ${lv.level}  ${xpBar(lv.intoLevel, lv.toNext)} ${lv.intoLevel}/${lv.toNext}`
}

export const heartsLeftOf = (p: NibblPetView, now: number): number =>
  Math.floor(now / HOUR_MS) === p.heartsHour ? Math.max(0, CAPS_PER_HOUR.pet - p.heartsUsed) : CAPS_PER_HOUR.pet

export type HudLines = { title: string; xp: string; hearts: string; status: string; compact: string }

export const hudLines = (view: NibblPetView | null, turns: number, r: NibblReaction, now: number, tz: number): HudLines => {
  if (!view) {
    const shown = Math.min(turns, HATCH_AFTER_TURNS)
    const status = turns >= HATCH_AFTER_TURNS ? 'hatching...' : 'keep working to hatch it'
    return { title: 'Egg', xp: `turns ${shown}/${HATCH_AFTER_TURNS}`, hearts: '', status, compact: `Egg · turns ${shown}/${HATCH_AFTER_TURNS} · ${status}` }
  }
  const hearts = heartsBar(heartsLeftOf(view, now))
  const status = statusText(lookOf(r, now, tz), now, r.awaySince)
  const short = view.serial === null ? view.name : `${view.name} #${padSerial(view.serial)}`
  return { title: titleOf(view), xp: xpLineOf(view.xp), hearts, status, compact: `${short} · lvl ${levelFromXp(view.xp).level} ${hearts} · ${status}` }
}

export const utcText = (at: number): string => `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`

export const cardUrl = (base: string, serial: number): string => `${base}/p/${serial}`
export const boardUrl = (base: string, serial: number): string => `${base}/leaderboard/?me=${serial}`

export type SyncInfo = { base: string; pending: number; lastSyncAt: number | null }

export const statsText = (view: NibblPetView, g: Genome, now: number, sync: SyncInfo): string => {
  const lv = levelFromXp(view.xp)
  const lines = [
    titleOf(view),
    tierText(view),
    `lvl ${lv.level}, ${view.xp} xp (${lv.intoLevel}/${lv.toNext} to next)  ${xpBar(lv.intoLevel, lv.toNext)}`,
    `hearts this hour: ${heartsBar(heartsLeftOf(view, now))}`,
    `rarest trait: ${rarestLine(g)}`,
  ]
  if (view.serial === null) lines.push('not on the server yet: it links on the next hatch call')
  else lines.push(`card: ${cardUrl(sync.base, view.serial)}`, `leaderboard: ${boardUrl(sync.base, view.serial)}`)
  const waiting = `${sync.pending} event${sync.pending === 1 ? '' : 's'} waiting`
  lines.push(`sync: ${waiting}, ${sync.lastSyncAt === null ? 'never synced' : `last sync ${utcText(sync.lastSyncAt)}`}`)
  return lines.join('\n')
}

export const eggStatsText = (turns: number): string =>
  `Egg: ${Math.min(turns, HATCH_AFTER_TURNS)}/${HATCH_AFTER_TURNS} answered turns. It hatches after ${HATCH_AFTER_TURNS}.`

export const oddsText = (view: NibblPetView | null, g: Genome | null): string => {
  const lines = [
    'Hatch odds (rolled on the server, the same for everyone):',
    TIERS.map(t => `${t} ${TIER_BP[t] / 100}%`).join(' · '),
    `shiny ${SHINY_BP / 100}% on top of any tier`,
  ]
  if (!view || !g) return [...lines, 'Your egg shows its traits when it hatches.'].join('\n')
  lines.push(`${view.name}'s traits:`)
  for (const t of traitOdds(g)) lines.push(`  ${t.gene} ${t.value} ${pct(t.probability)}%`)
  lines.push(`rarest: ${rarestLine(g)}`)
  return lines.join('\n')
}
