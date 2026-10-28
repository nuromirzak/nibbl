// Gift eggs (0.4.0): a hatched pet lays one egg at level 10 and one at level 25, each a one-time code
// for a friend. /nibbl egg lists them; /nibbl egg <code> (also /nibbl invite <code>) is how the friend
// enters one before their own egg hatches.
import type { EngineInterface } from 'claude-code'

import { apiBase, postWithin, type ApiOutcome } from './api'
import { K } from './config'
import { INSTALL } from './growth'
import { hatchNow } from './hatch'
import type { ServerPet } from './pet'
import { giftCodeOf, giftCodeText, labelOf } from './social'
import { loadPet, loadSpike } from './store'

const LINKING = 'Your nibbl is still linking to the server. Try again in a minute.'

export const EGG_USAGE = 'Usage: /nibbl egg <code>, for example /nibbl egg ABCDE-FGHJK. Run it before your egg hatches.'

export const EGG_HELP = [
  'Gift eggs: a nibbl lays an egg for a friend at level 10 and another at level 25.',
  'Got a code from a friend? Run /nibbl egg <code> before your egg hatches.',
  'Your own eggs show here once your egg has hatched.',
].join('\n')

export type GiftEgg = { milestone: 10 | 25; status: 'ready' | 'hatched' | 'locked'; code: string | null; by: { serial: number; name: string | null } | null }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// Lenient reading of POST /api/gift: unknown milestones and statuses are dropped, a "ready" egg without
// a valid code counts as not available yet.
export const parseGiftEggs = (body: Record<string, unknown>): GiftEgg[] => {
  const out: GiftEgg[] = []
  if (!Array.isArray(body.eggs)) return out
  for (const e of body.eggs) {
    if (!isObj(e) || (e.milestone !== 10 && e.milestone !== 25) || out.some(o => o.milestone === e.milestone)) continue
    const code = giftCodeOf(e.code)
    const by = isObj(e.by) && typeof e.by.serial === 'number' && Number.isInteger(e.by.serial) && e.by.serial >= 1
      ? { serial: e.by.serial, name: typeof e.by.name === 'string' && e.by.name.length > 0 ? e.by.name : null }
      : null
    const status = e.status === 'ready' && code !== null ? 'ready' : e.status === 'hatched' ? 'hatched' : 'locked'
    out.push({ milestone: e.milestone, status, code: status === 'ready' ? code : null, by })
  }
  return out.sort((a, b) => a.milestone - b.milestone)
}

export const giftEggsText = (eggs: readonly GiftEgg[]): string => {
  const lines: string[] = []
  for (const e of eggs) {
    const head = `Egg ${e.milestone === 10 ? 1 : 2} (level ${e.milestone}):`
    if (e.status === 'ready') lines.push(`${head} ${giftCodeText(e.code!)} ready, give it to a friend`)
    else if (e.status === 'hatched') lines.push(`${head} hatched as ${e.by ? labelOf(e.by.name, e.by.serial) : 'a friend\'s nibbl'}`)
    else lines.push(`${head} locked until level ${e.milestone}`)
  }
  const ready = eggs.find(e => e.status === 'ready')
  if (ready) lines.push(`Your friend installs nibbl, then runs /nibbl egg ${giftCodeText(ready.code!)} before their egg hatches.`, ...INSTALL.map(l => `  ${l}`))
  return lines.join('\n')
}

const listEggs = async ($: EngineInterface, pet: ServerPet): Promise<string> => {
  const base = await apiBase($)
  const call = (p: ServerPet): Promise<ApiOutcome> => postWithin($, base, '/api/gift', { serial: p.serial, token: p.token })
  let out = await call(pet)
  if (out.kind === 'error' && out.status === 401) {
    const result = await hatchNow($, 'reauth')
    const fresh = result === 'hatched' ? await loadPet($) : null
    if (fresh) out = await call(fresh)
  }
  if (out.kind === 'offline') return 'Could not reach the nibbl server. Try again later.'
  if (out.kind === 'error' && out.status === 401) return "Could not reach your pet's account. Try /nibbl egg again later."
  if (out.kind === 'error' && out.status === 404) return 'Your nibbl is hidden from the board, so it cannot lay gift eggs.'
  if (out.kind === 'error') return `The server answered ${out.code}. Try again later.`
  const eggs = parseGiftEggs(out.body)
  return eggs.length === 0 ? 'The server answered something unexpected. Try again later.' : giftEggsText(eggs)
}

// /nibbl egg: your eggs (hatched pet), or how to enter a friend's code (egg).
export const eggCommand = async ($: EngineInterface, rest: string): Promise<string> => {
  const pet = await loadPet($)
  const hasPet = pet !== null || (await loadSpike($)) !== null
  if (rest === '') {
    if (pet) return listEggs($, pet)
    return hasPet ? LINKING : EGG_HELP
  }
  const code = giftCodeOf(rest)
  if (code === null) return EGG_USAGE
  if (hasPet) return 'Gift eggs work only before your egg hatches.'
  await $.store.set(K.giftCode, code)
  return 'Saved. When your egg hatches it becomes the child of that nibbl and inherits its mark when it can.'
}
