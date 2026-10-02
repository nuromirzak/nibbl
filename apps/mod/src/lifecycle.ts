import { update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { recordEvent } from './events'
import { ensureLoaded } from './model'
import { parseUtcOffset } from './reactions'
import { rt } from './runtime'
import { tzAtom } from './state'
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

export const start = async ($: EngineInterface): Promise<void> => {
  await ensureLoaded($)
  await readTimezone($)
  await ensureRunning($)
}

export const onAnsweredTurn = async ($: EngineInterface): Promise<void> => {
  await recordEvent($, 'turn')
}
