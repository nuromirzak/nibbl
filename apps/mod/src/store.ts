import type { EngineInterface } from 'claude-code'

import { isWait, type Wait } from './api'
import { K, LEASE_MS, QUEUE_PREFIX, SPIKE_KEYS } from './config'
import { isServerPet, spikePetOf, type ServerPet, type SpikePet } from './pet'
import { queueOf, type Queue } from './queue'
import { rt } from './runtime'

export const loadPet = async ($: EngineInterface): Promise<ServerPet | null> => {
  const v = await $.store.get(K.pet)
  return isServerPet(v) ? v : null
}

export const savePet = async ($: EngineInterface, pet: ServerPet): Promise<void> => {
  await $.store.set(K.pet, pet)
}

export const loadSpike = async ($: EngineInterface): Promise<SpikePet | null> => spikePetOf(await $.store.get(K.spikePet))

export const forgetSpike = async ($: EngineInterface): Promise<void> => {
  for (const key of SPIKE_KEYS) await $.store.delete(key)
}

// The egg's answered turns; a spike egg's count carries over until the first v1 write.
export const loadEggTurns = async ($: EngineInterface): Promise<number> => {
  for (const key of [K.egg, K.spikeEggTurns]) {
    const turns = await $.store.get(key)
    if (typeof turns === 'number' && Number.isInteger(turns) && turns >= 0) return turns
  }
  return 0
}

export const loadWait = async ($: EngineInterface, key: string): Promise<Wait | null> => {
  const v = await $.store.get(key)
  return isWait(v) ? v : null
}

export const queueKey = (sid: string): string => `${QUEUE_PREFIX}${sid}`

export const loadQueues = async ($: EngineInterface): Promise<Record<string, Queue>> => {
  const out: Record<string, Queue> = {}
  for (const key of await $.store.keys()) {
    if (!key.startsWith(QUEUE_PREFIX)) continue
    const q = queueOf(await $.store.get(key))
    if (q) out[key] = q
  }
  return out
}

export const dropQueues = async ($: EngineInterface): Promise<void> => {
  for (const key of await $.store.keys()) if (key.startsWith(QUEUE_PREFIX)) await $.store.delete(key)
}

// Every write to a queue key goes through one chain, so an append and a post-sync clear in this
// process never interleave between their get and set. Returning null deletes the key.
export const editQueue = (
  $: EngineInterface,
  key: string,
  edit: (q: Queue | null) => Queue | null | Promise<Queue | null>,
): Promise<Queue | null> => {
  const run = rt.queueChain.then(async () => {
    const next = await edit(queueOf(await $.store.get(key)))
    if (next) await $.store.set(key, next)
    else await $.store.delete(key)
    return next
  })
  rt.queueChain = run.catch(() => undefined)
  return run
}

type Lease = { owner: string; until: number }
const isLease = (v: unknown): v is Lease =>
  typeof v === 'object' && v !== null && typeof (v as Lease).owner === 'string' && Number.isFinite((v as Lease).until)

// Best effort across processes ($.store has no compare-and-set): write, then read back to see who won.
export const tryLease = async ($: EngineInterface, owner: string, now: number): Promise<boolean> => {
  const held = await $.store.get(K.lease)
  if (isLease(held) && held.owner !== owner && held.until > now) return false
  await $.store.set(K.lease, { owner, until: now + LEASE_MS })
  const check = await $.store.get(K.lease)
  return isLease(check) && check.owner === owner
}

export const releaseLease = async ($: EngineInterface, owner: string): Promise<void> => {
  const held = await $.store.get(K.lease)
  if (isLease(held) && held.owner === owner) await $.store.delete(K.lease)
}
