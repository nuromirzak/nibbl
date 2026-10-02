import { read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { BEAT_MS, TICK_MS } from './config'
import { COMMAND_DESCRIPTION, COMMAND_HINT } from './help'
import { hudKey, hudLines } from './hud'
import { stepAnim } from './reactions'
import { rt } from './runtime'
import { frameOf } from './scene'
import { eggAtom, petAtom, reactAtom, tzAtom } from './state'
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

// Every 500 ms: advance the animation, then repaint the mounted Raster in place with $.ui.blit
// (no render pass). Only a change of the HUD text itself (expedition seconds, a mood wearing off,
// sleep, the hour's hearts refilling, XP or egg turns) asks for a redraw. The comparison is on every
// HUD line, not only frameOf's status|hearts fingerprint, so a title, level or XP bar never goes stale.
export const tick = async ($: EngineInterface): Promise<void> => {
  const now = await $.clock.now()
  await beat($, now)
  const r = await read($, reactAtom)
  rt.anim = stepAnim(rt.anim, r, Math.random())
  const band = rt.band
  if (!band) return
  const view = await read($, petAtom)
  const turns = await read($, eggAtom)
  const tz = await read($, tzAtom)
  if (hudKey(hudLines(view, turns, r, now, tz)) !== band.hud) {
    $.ui.invalidate('ui.render')
    return
  }
  if (band.sceneId === null) return
  const frame = frameOf(view, turns, r, rt.anim, now, tz)
  if (frame.id === band.sceneId) return
  const painted = await $.ui.blit({ requestId: band.requestId, key: 'scene', cells: frame.cells.cells })
  if (painted.deny !== undefined) {
    // Unmounted, resized or not ours any more: wait for the next render to say where it is.
    rt.band = null
    return
  }
  band.sceneId = frame.id
}
