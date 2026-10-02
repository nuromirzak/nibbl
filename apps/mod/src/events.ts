import { update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { NibblReaction } from '../types'
import { CHECK_COMMAND, COMMIT_COMMAND } from './config'
import { refreshView } from './model'
import { append, emptyQueue, gainFor, localWindows, type ModEventType } from './queue'
import { onActive, onCheckPass, onCommit, onError, onPet } from './reactions'
import { later } from './runtime'
import { reactAtom } from './state'
import { editQueue, loadPet, loadQueues, loadSpike, queueKey } from './store'
import { syncIfDue } from './sync'

export const react = async ($: EngineInterface, change: (r: NibblReaction, now: number) => NibblReaction): Promise<void> => {
  const now = await $.clock.now()
  await update($, reactAtom, r => change(r, now))
}

// Queues one event in this session's queue with the XP it earns locally, and returns that XP.
// An egg queues nothing: the server drops events from before the hatch anyway.
export const recordEvent = async ($: EngineInterface, type: ModEventType): Promise<number> => {
  const pet = await loadPet($)
  const spike = pet ? null : await loadSpike($)
  if (!pet && !spike) return 0
  const now = await $.clock.now()
  const own = queueKey(await $.session.id())
  const lastSyncAt = pet?.lastSyncAt ?? null
  const base = pet ?? { heartsHour: 0, heartsUsed: 0 }
  let gained = 0
  await editQueue($, own, async mine => {
    const others = await loadQueues($)
    delete others[own]
    const current = mine ?? emptyQueue(now)
    gained = gainFor(type, now, localWindows(base, [current, ...Object.values(others)], now, lastSyncAt), lastSyncAt)
    return append(current, type, now, gained)
  })
  await refreshView($, true)
  if (pet) later($, () => syncIfDue($))
  return gained
}

// Only this local regex test ever sees the command text; nothing of it is stored or sent.
export const toolFinished = async ($: EngineInterface, command: string, isError: boolean): Promise<void> => {
  if (isError) {
    await react($, onError)
    await recordEvent($, 'error')
  } else if (CHECK_COMMAND.test(command)) {
    await react($, onCheckPass)
    await recordEvent($, 'check_pass')
  } else {
    await react($, onActive)
  }
  if (!isError && COMMIT_COMMAND.test(command)) {
    await react($, onCommit)
    await recordEvent($, 'commit')
  }
}

export const petPressed = async ($: EngineInterface): Promise<void> => {
  await react($, onPet)
  await recordEvent($, 'pet')
}
