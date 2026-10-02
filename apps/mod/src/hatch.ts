import { update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { apiBase, backoff, holdUntil, postWithin } from './api'
import { K } from './config'
import { rarestLine, tierText } from './hud'
import { machineHash } from './identity'
import { refreshView } from './model'
import { displayName, fromOwnerView, padSerial } from './pet'
import { rt } from './runtime'
import { genomeOf } from './scene'
import { eggAtom } from './state'
import { dropQueues, forgetSpike, loadPet, loadWait, releaseLease, savePet, tryLease } from './store'

export type HatchWhy = 'egg' | 'spike' | 'reauth'
export type HatchResult = 'hatched' | 'moved' | 'waiting' | 'busy' | 'failed'

// POST /api/hatch {machineHash}: the same machine always gets the same pet with a fresh token.
export const hatchNow = async ($: EngineInterface, why: HatchWhy, opts: { isLeased?: boolean } = {}): Promise<HatchResult> => {
  if (rt.isHatching) return 'busy'
  rt.isHatching = true
  let owner: string | null = null
  try {
    const now = await $.clock.now()
    const wait = await loadWait($, K.hatchWait)
    if (wait && wait.until > now) return 'waiting'
    if (!opts.isLeased) {
      const sid = await $.session.id()
      if (!(await tryLease($, sid, now))) return 'busy'
      owner = sid
    }
    const out = await postWithin($, await apiBase($), '/api/hatch', { machineHash: await machineHash($) })
    if (out.kind !== 'ok') {
      // hatch_rate_limited and rehatch_rate_limited say when; everything else backs off.
      const next = out.kind === 'error' && out.status === 429 && out.retryAt !== null ? holdUntil(wait, out.retryAt) : backoff(wait, now)
      await $.store.set(K.hatchWait, next)
      $.ui.log(`nibbl: hatch failed with ${out.kind === 'error' ? out.code : out.reason}; next try after ${new Date(next.until).toISOString()}`, { to: 'debug' })
      return 'failed'
    }
    const fresh = fromOwnerView(out.body, out.body.token, now)
    if (!fresh) {
      await $.store.set(K.hatchWait, backoff(wait, now))
      $.ui.log('nibbl: hatch answered an unexpected shape', { to: 'debug' })
      return 'failed'
    }
    await $.store.delete(K.hatchWait)
    const old = await loadPet($)
    if (why === 'reauth' && old && old.serial !== fresh.serial) {
      // The old pet was imported on another machine; this one starts over with an egg.
      await $.store.delete(K.pet)
      await dropQueues($)
      await $.store.set(K.egg, 0)
      await update($, eggAtom, () => 0)
      await refreshView($)
      $.ui.toast(`${displayName(old.name)} #${padSerial(old.serial)} now lives on another machine. A new egg appeared here.`)
      return 'moved'
    }
    const isSame = old !== null && old.serial === fresh.serial
    await savePet($, isSame && old ? { ...fresh, heartsHour: old.heartsHour, heartsUsed: old.heartsUsed, lastSyncAt: old.lastSyncAt } : fresh)
    await $.store.delete(K.egg)
    await forgetSpike($)
    await update($, eggAtom, () => 0)
    await refreshView($)
    const name = displayName(fresh.name)
    if (why === 'egg') {
      $.ui.toast(`${name} hatched! #${padSerial(fresh.serial)} · ${tierText(fresh)} · rarest: ${rarestLine(genomeOf(fresh.seed, fresh.tier, fresh.shiny))}`)
    }
    if (why === 'spike') $.ui.toast(`${name} is now #${padSerial(fresh.serial)}, synced with the nibbl server.`)
    return 'hatched'
  } finally {
    if (owner !== null) await releaseLease($, owner)
    rt.isHatching = false
  }
}
