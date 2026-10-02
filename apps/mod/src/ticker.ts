import type { EngineInterface } from 'claude-code'

import { BEAT_MS, TICK_MS } from './config'
import { COMMAND_DESCRIPTION, COMMAND_HINT } from './help'
import { rt } from './runtime'
import { editQueue, queueKey } from './store'

// Started from session.start and again from turn.start, since a hot reload drops timers.
// /nibbl is registered first; a rejected registration is retried on the next call, and never
// keeps the ticker from starting.
export const ensureRunning = async ($: EngineInterface): Promise<void> => {
  if (!rt.isRegistered) {
    try {
      await $.command.register({ name: 'nibbl', description: COMMAND_DESCRIPTION, argumentHint: COMMAND_HINT })
      rt.isRegistered = true
    } catch (err) {
      $.ui.log(`nibbl: /nibbl registration failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
  }
  if (rt.ticker) return
  rt.ticker = $.clock.every(TICK_MS, () => {
    void tick($).catch(() => undefined)
  })
}

// A live session refreshes its queue's heartbeat, so no other session adopts it as an orphan.
const beat = async ($: EngineInterface, now: number): Promise<void> => {
  if (now - rt.lastBeat < BEAT_MS) return
  rt.lastBeat = now
  const own = queueKey(await $.session.id())
  await editQueue($, own, q => (q ? { ...q, beat: now } : null))
}

export const tick = async ($: EngineInterface): Promise<void> => {
  await beat($, await $.clock.now())
}
