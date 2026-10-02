import { update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { HATCH_AFTER_TURNS, HATCH_DELAY_MS, K } from './config'
import { recordEvent } from './events'
import { hatchNow, type HatchResult } from './hatch'
import { ensureLoaded } from './model'
import { parseUtcOffset } from './reactions'
import { later, rt } from './runtime'
import { eggAtom, tzAtom } from './state'
import { loadEggTurns, loadPet, loadSpike } from './store'
import { syncNow } from './sync'
import { ensureRunning } from './ticker'

// The runtime's own time zone data can be wrong (seen: UTC+6 for Almaty, which is UTC+5),
// so the machine's `date +%z` wins; Windows has none and keeps the runtime's offset.
export const readTimezone = async ($: EngineInterface): Promise<void> => {
  if (rt.tzRead) return
  rt.tzRead = true
  let offset = -new Date(await $.clock.now()).getTimezoneOffset()
  try {
    const out = await $.process.run(['date', '+%z'], { timeoutMs: 3_000 })
    const parsed = out.exitCode === 0 ? parseUtcOffset(out.stdout) : null
    if (parsed !== null) offset = parsed
  } catch {
    // no date(1)
  }
  await update($, tzAtom, () => offset)
}

// Hatch (or adopt the spike's pet), then send what queued up meanwhile. Rechecks at run time,
// since a session start and a turn can both schedule one.
export const hatchAndSync = async ($: EngineInterface, why: 'egg' | 'spike'): Promise<HatchResult> => {
  if (await loadPet($)) return 'busy'
  const result = await hatchNow($, why)
  if (result === 'hatched') await syncNow($, 'hatch')
  return result
}

// Migration from the local-only spike: its pet is adopted from the server right away.
export const maybeMigrate = async ($: EngineInterface): Promise<void> => {
  if (!(await loadPet($)) && (await loadSpike($))) later($, () => hatchAndSync($, 'spike'))
}

export const start = async ($: EngineInterface): Promise<void> => {
  await ensureLoaded($)
  await readTimezone($)
  await ensureRunning($)
  await maybeMigrate($)
}

export const onAnsweredTurn = async ($: EngineInterface): Promise<void> => {
  const pet = await loadPet($)
  const spike = pet ? null : await loadSpike($)
  if (pet || spike) {
    await recordEvent($, 'turn')
    if (spike) later($, () => hatchAndSync($, 'spike'))
    return
  }
  const turns = (await loadEggTurns($)) + 1
  await $.store.set(K.egg, turns)
  await update($, eggAtom, () => turns)
  // At 10 and on every later turn until it works (hatchNow honors its own backoff).
  if (turns >= HATCH_AFTER_TURNS) {
    $.clock.after(HATCH_DELAY_MS, () => {
      void hatchAndSync($, 'egg').catch(err => $.ui.log(`nibbl: hatch: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' }))
    })
  }
}
