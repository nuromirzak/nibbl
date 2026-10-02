import { read } from 'claude-code'
import type { Register } from 'claude-code'

import { runCommand } from './commands'
import { MIN_FULL_COLUMNS, MIN_FULL_ROWS, SESSION_END_WAIT_MS } from './config'
import { petPressed, react, toolFinished } from './events'
import { hudKey, hudLines } from './hud'
import { onAnsweredTurn, start } from './lifecycle'
import { ensureLoaded } from './model'
import { onActive, onTurnEnd, onTurnStart } from './reactions'
import { rt, withTimeout } from './runtime'
import { frameOf } from './scene'
import { eggAtom, hiddenAtom, petAtom, reactAtom, tzAtom } from './state'
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

  // The band. It never writes state while drawing; the ticker repaints the Raster with blit.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, hiddenAtom))) {
      rt.band = null
      return next(e)
    }
    const now = await $.clock.now()
    const view = await read($, petAtom)
    const turns = await read($, eggAtom)
    const r = await read($, reactAtom)
    const tz = await read($, tzAtom)
    const frame = frameOf(view, turns, r, rt.anim, now, tz)
    const lines = hudLines(view, turns, r, now, tz)
    const isFull = e.surface === 'terminal' && e.props.maxRows >= MIN_FULL_ROWS && e.props.bodyColumns >= MIN_FULL_COLUMNS
    rt.band = { requestId: e.requestId, sceneId: isFull ? frame.id : null, hud: hudKey(lines) }
    const { Box, Text, Button } = $.ui.resolve(e)

    if (isFull && e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      const scene = <Raster key="scene" columns={frame.cells.columns} rows={frame.cells.rows} cells={frame.cells.cells} />
      if (!view) {
        return (
          <Box flexDirection="row" justifyContent="flex-end" alignItems="center" width={e.props.bodyColumns}>
            <Box flexDirection="column" alignItems="flex-end" marginRight={1}>
              <Text color="#ffcd75" bold>{lines.title}</Text>
              <Text>{lines.xp}</Text>
              <Text dimColor italic>{lines.status}</Text>
            </Box>
            {scene}
          </Box>
        )
      }
      return (
        <Box flexDirection="row" justifyContent="flex-end" alignItems="center" width={e.props.bodyColumns}>
          <Box flexDirection="column" alignItems="flex-end" marginRight={1}>
            <Text color="#ef7d57" bold>{lines.title}</Text>
            <Text>{lines.xp}</Text>
            <Text color="#b13e53">{lines.hearts}</Text>
            <Text dimColor italic>{lines.status}</Text>
            <Button key="pet" label="♥" hotkey="p" onPress={() => {}} />
          </Box>
          {scene}
        </Box>
      )
    }

    if (!view) {
      return (
        <Box flexDirection="row" width={e.props.bodyColumns}>
          <Text>{lines.compact}</Text>
        </Box>
      )
    }
    return (
      <Box flexDirection="row" width={e.props.bodyColumns}>
        <Text>{lines.compact}</Text>
        <Text> </Text>
        <Button key="pet" label="♥" hotkey="p" onPress={() => {}} />
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
