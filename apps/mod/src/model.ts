import { HOUR_MS, levelFromXp } from '@nibbl/core'
import { read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { NibblPetView } from '../types'
import { K } from './config'
import { viewOf } from './pet'
import { heartsUsedAt, localWindows, pendingGain } from './queue'
import { eggAtom, hiddenAtom, loadedAtom, petAtom } from './state'
import { loadEggTurns, loadPet, loadQueues, loadSpike } from './store'

// Rebuilds what the band draws from the store: server XP plus every queued event's local gain.
export const refreshView = async ($: EngineInterface, announce = false): Promise<NibblPetView | null> => {
  const now = await $.clock.now()
  const pet = await loadPet($)
  const spike = pet ? null : await loadSpike($)
  const queues = Object.values(await loadQueues($))
  const hour = Math.floor(now / HOUR_MS)
  let view: NibblPetView | null = null
  if (pet) view = viewOf(pet, pet.xp + pendingGain(queues), hour, heartsUsedAt(localWindows(pet, queues, now, pet.lastSyncAt), now))
  else if (spike) view = viewOf(spike, spike.xp + pendingGain(queues), hour, heartsUsedAt(localWindows({ heartsHour: hour, heartsUsed: 0 }, queues, now, null), now))
  const prev = await read($, petAtom)
  await update($, petAtom, () => view)
  if (announce && prev && view && prev.serial === view.serial) {
    const was = levelFromXp(prev.xp).level
    const is = levelFromXp(view.xp).level
    if (is > was) $.ui.toast(`${view.name} reached level ${is}!`)
  }
  return view
}

export const ensureLoaded = async ($: EngineInterface): Promise<void> => {
  if (await read($, loadedAtom)) return
  const isHidden = (await $.store.get(K.hidden)) === true
  const turns = await loadEggTurns($)
  await update($, hiddenAtom, () => isHidden)
  await update($, eggAtom, () => turns)
  await refreshView($)
  await update($, loadedAtom, () => true)
}
