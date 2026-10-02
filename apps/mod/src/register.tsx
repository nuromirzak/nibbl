import type { Register } from 'claude-code'

import { runCommand } from './commands'
import { SESSION_END_WAIT_MS } from './config'
import { petPressed, react, toolFinished } from './events'
import { onAnsweredTurn, start } from './lifecycle'
import { ensureLoaded } from './model'
import { onActive, onTurnEnd, onTurnStart } from './reactions'
import { rt, withTimeout } from './runtime'
import { syncNow } from './sync'

export const register: Register = (on, options) => {
  rt.options = options

  on('session.start', async ($, e, next) => {
    await start($)
    await react($, onActive)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await start($)
    await react($, onTurnStart)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    await ensureLoaded($)
    const isAnswer = e.reason === 'answer'
    await react($, (r, now) => onTurnEnd(r, now, isAnswer))
    if (isAnswer) await onAnsweredTurn($)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    // Only the main loop feeds the pet, as with turns: subagent tool calls are not counted.
    if (ran.deny !== undefined || e.agentId !== undefined) return ran
    await ensureLoaded($)
    const command = e.tool === 'Bash' ? String((e as { command?: unknown }).command ?? '') : ''
    await toolFinished($, command, ran.isError === true)
    return ran
  })

  // The render-time `$` is dead once a render hook returns, so the [♥] Button's press lands here.
  on('ui.press', { plugin: 'nibbl', element: 'pet' }, async ($, e, next) => {
    await ensureLoaded($)
    await petPressed($)
    return next(e)
  })

  on('command.run', { command: 'nibbl' }, async ($, e) => ({ text: await runCommand($, e.args) }))

  // Exits must stay fast: wait for the last sync at most 2.5 s (and never past the chain's budget).
  on('session.end', async ($, e, next) => {
    try {
      await withTimeout($, Math.max(0, Math.min(SESSION_END_WAIT_MS, next.budget.remainingMs - 250)), syncNow($, 'session-end'))
    } catch (err) {
      $.ui.log(`nibbl: session end: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    return next(e)
  })
}
