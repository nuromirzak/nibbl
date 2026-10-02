import { HOUR_MS } from '@nibbl/core'
import type { EngineInterface } from 'claude-code'

import { apiBase, backoff, holdUntil, postWithin, type Wait } from './api'
import { CONFLICT_RETRY_MS, K, TRIM_AFTER_413 } from './config'
import { hatchNow } from './hatch'
import { refreshView } from './model'
import type { ServerPet } from './pet'
import { countEvents, isOrphan, isSyncDue, keepNewest, removeUpTo, sendable, takeBatch, toWire } from './queue'
import { rt } from './runtime'
import { editQueue, loadPet, loadQueues, loadWait, queueKey, releaseLease, savePet, tryLease } from './store'

export type SyncReason = 'schedule' | 'hatch' | 'session-end'
export type SyncResult = 'synced' | 'empty' | 'waiting' | 'busy' | 'no-pet' | 'failed'

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

const fail = async ($: EngineInterface, reason: SyncReason, code: string, next: Wait): Promise<SyncResult> => {
  await $.store.set(K.syncWait, next)
  $.ui.log(`nibbl: sync (${reason}) failed with ${code}; next try after ${new Date(next.until).toISOString()}`, { to: 'debug' })
  return 'failed'
}

const clearSent = async ($: EngineInterface, upTo: Readonly<Record<string, number>>): Promise<void> => {
  for (const [key, n] of Object.entries(upTo)) await editQueue($, key, q => (q ? removeUpTo(q, n) : null))
}

const send = async ($: EngineInterface, sid: string, pet: ServerPet, now: number, reason: SyncReason, mayReauth = true): Promise<SyncResult> => {
  const own = queueKey(sid)
  const all = await loadQueues($)
  // Empty queues of sessions that ended are garbage.
  for (const [key, q] of Object.entries(all)) if (key !== own && q.events.length === 0 && isOrphan(q, now)) await $.store.delete(key)
  const batch = takeBatch(sendable(all, own, now))
  if (batch.events.length === 0) return 'empty'
  const wait = await loadWait($, K.syncWait)
  const out = await postWithin($, await apiBase($), '/api/sync', { serial: pet.serial, token: pet.token, events: toWire(batch.events) })
  if (out.kind === 'offline') return fail($, reason, `offline (${out.reason})`, backoff(wait, now))
  if (out.kind === 'ok') {
    const { xp, level, heartsLeft } = out.body
    if (!isCount(xp) || !isCount(level) || !isCount(heartsLeft)) return fail($, reason, 'bad_shape', backoff(wait, now))
    const latest = await loadPet($)
    if (!latest || latest.serial !== pet.serial) {
      // An import or a move swapped the pet while this was in flight; they dropped the old pet's
      // queues, so neither these numbers nor a clear may touch the new one.
      $.ui.log(`nibbl: sync (${reason}) answer for #${pet.serial} ignored: the pet here changed`, { to: 'debug' })
      await $.store.delete(K.syncWait)
      return 'synced'
    }
    await savePet($, {
      ...latest,
      xp,
      level,
      heartsHour: Math.floor(now / HOUR_MS),
      heartsUsed: Math.min(5, Math.max(0, 5 - heartsLeft)),
      lastSyncAt: now,
    })
    await clearSent($, batch.upTo)
    await $.store.delete(K.syncWait)
    return 'synced'
  }
  if ((out.status === 401 || out.code === 'invalid_token' || out.code === 'invalid_serial') && mayReauth) {
    // The token was rotated (a reinstall, another session's re-hatch) or lost: re-hatch by machineHash,
    // which returns this machine's pet with a fresh token, and resend once.
    const result = await hatchNow($, 'reauth', { isLeased: true })
    if (result === 'moved') return 'failed'
    const fresh = result === 'hatched' ? await loadPet($) : null
    return fresh ? send($, sid, fresh, now, reason, false) : fail($, reason, out.code, backoff(wait, now))
  }
  if (out.status === 409) return fail($, reason, out.code, holdUntil(wait, now + CONFLICT_RETRY_MS))
  if (out.status === 429) return fail($, reason, out.code, holdUntil(wait, Math.max(now + 1_000, out.retryAt ?? now + CONFLICT_RETRY_MS)))
  if (out.status === 413) {
    for (const key of Object.keys(batch.upTo)) await editQueue($, key, q => (q ? keepNewest(q, TRIM_AFTER_413) : null))
    return fail($, reason, out.code, backoff(wait, now))
  }
  if (out.status === 400 && out.code === 'invalid_events') {
    // These can never be accepted; drop them instead of resending forever.
    await clearSent($, batch.upTo)
    $.ui.log(`nibbl: sync (${reason}) dropped a batch the server called invalid_events`, { to: 'debug' })
    return 'failed'
  }
  return fail($, reason, out.code, backoff(wait, now))
}

export const syncNow = async ($: EngineInterface, reason: SyncReason): Promise<SyncResult> => {
  if (rt.isSyncing) return 'busy'
  rt.isSyncing = true
  let owner: string | null = null
  try {
    const pet = await loadPet($)
    if (!pet) return 'no-pet'
    const now = await $.clock.now()
    const wait = await loadWait($, K.syncWait)
    if (wait && wait.until > now) return 'waiting'
    const sid = await $.session.id()
    if (!(await tryLease($, sid, now))) return 'busy'
    owner = sid
    const result = await send($, sid, pet, now, reason)
    if (result === 'synced') await refreshView($, true)
    return result
  } finally {
    if (owner !== null) await releaseLease($, owner)
    rt.isSyncing = false
  }
}

export const syncIfDue = async ($: EngineInterface): Promise<SyncResult | 'not-due'> => {
  const pet = await loadPet($)
  if (!pet) return 'no-pet'
  const now = await $.clock.now()
  const mine = sendable(await loadQueues($), queueKey(await $.session.id()), now)
  return isSyncDue(pet.lastSyncAt, countEvents(Object.values(mine)), now) ? syncNow($, 'schedule') : 'not-due'
}
