import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import {
  heartsLeft,
  pruneWindows,
  rollFromBytes,
  scoreEvents,
  traitOdds,
  type EventType,
  type Windows,
} from '@nibbl/core'

import type { NibblPet, NibblSceneMode, NibblWindows } from '../types'
import type { Run } from './cells'
import {
  CHECK_COMMAND,
  COMMIT_COMMAND,
  DEFAULT_X,
  eggCracks,
  eggDrawing,
  expressionFor,
  genomeOf,
  HATCH_AFTER_TURNS,
  HATCH_DELAY_MS,
  HEART_MS,
  heartsBar,
  levelOf,
  liftFor,
  MAX_BUGS,
  MAX_NAME,
  MIN_FULL_ROWS,
  MOOD_MS,
  pct,
  pickLook,
  rarestLine,
  petDrawing,
  spikeHatchBytes,
  stageForLevel,
  TICK_MS,
  WALK_MAX_X,
  xpBar,
} from './logic'

const loaded = atom({ plugin: 'nibbl', key: 'loaded' } as const, false)
const frame = atom({ plugin: 'nibbl', key: 'frame' } as const, 0)
const hidden = atom({ plugin: 'nibbl', key: 'hidden' } as const, false)
const working = atom({ plugin: 'nibbl', key: 'working' } as const, false)
const pet = atom({ plugin: 'nibbl', key: 'pet' } as const, null as NibblPet | null)
const eggTurns = atom({ plugin: 'nibbl', key: 'eggTurns' } as const, 0)
const mood = atom({ plugin: 'nibbl', key: 'mood' } as const, 'idle' as 'idle' | 'happy' | 'sad')
const moodUntil = atom({ plugin: 'nibbl', key: 'moodUntil' } as const, 0)
const bugs = atom({ plugin: 'nibbl', key: 'bugs' } as const, 0)
const heartUntil = atom({ plugin: 'nibbl', key: 'heartUntil' } as const, 0)
const lastActiveAt = atom({ plugin: 'nibbl', key: 'lastActiveAt' } as const, 0)
const windows = atom({ plugin: 'nibbl', key: 'windows' } as const, {} as NibblWindows)
const petX = atom({ plugin: 'nibbl', key: 'petX' } as const, DEFAULT_X)
const dir = atom({ plugin: 'nibbl', key: 'dir' } as const, 1)
const blink = atom({ plugin: 'nibbl', key: 'blink' } as const, false)
const mode = atom({ plugin: 'nibbl', key: 'mode' } as const, 'raster' as NibblSceneMode)

const STORE = { pet: 'pet', eggTurns: 'eggTurns', windows: 'windows', lastScoredAt: 'lastScoredAt', mode: 'mode' } as const
const MODES: readonly NibblSceneMode[] = ['raster', 'text', 'client']

const isPet = (v: unknown): v is NibblPet =>
  typeof v === 'object' && v !== null && typeof (v as NibblPet).seed === 'number' && typeof (v as NibblPet).tier === 'string'

// Module-level only for what may be lost on a hot reload: the ticker handle and a hatch guard.
const runtime: { ticker: { cancel: () => void } | null; isHatching: boolean } = { ticker: null, isHatching: false }

const ensureLoaded = async ($: EngineInterface): Promise<void> => {
  if (await read($, loaded)) return
  const savedPet = await $.store.get(STORE.pet)
  const savedTurns = Number((await $.store.get(STORE.eggTurns)) ?? 0)
  const savedWindows = await $.store.get(STORE.windows)
  const savedMode = await $.store.get(STORE.mode)
  await update($, pet, () => (isPet(savedPet) ? savedPet : null))
  await update($, eggTurns, () => (Number.isFinite(savedTurns) ? savedTurns : 0))
  await update($, windows, () => (savedWindows && typeof savedWindows === 'object' ? (savedWindows as NibblWindows) : {}))
  if (MODES.includes(savedMode as NibblSceneMode)) await update($, mode, () => savedMode as NibblSceneMode)
  await update($, loaded, () => true)
  if (!isPet(savedPet) && savedTurns >= HATCH_AFTER_TURNS) await hatch($)
}

const markActive = async ($: EngineInterface): Promise<number> => {
  const now = await $.clock.now()
  await update($, lastActiveAt, () => now)
  return now
}

const feel = async ($: EngineInterface, next: 'happy' | 'sad', ms: number): Promise<void> => {
  const now = await $.clock.now()
  await update($, mood, () => next)
  await update($, moodUntil, () => now + ms)
}

const savePet = async ($: EngineInterface, p: NibblPet | null): Promise<void> => {
  await update($, pet, () => p)
  if (p) await $.store.set(STORE.pet, p)
  else await $.store.delete(STORE.pet)
}

// Scores one event like the server will: hourly caps from the local windows,
// lastSyncAt = the previous scoring time. Returns how many events were accepted.
const score = async ($: EngineInterface, type: EventType): Promise<number> => {
  const current = await read($, pet)
  if (!current) return 0
  const now = await $.clock.now()
  const last = await $.store.get(STORE.lastScoredAt)
  const before = (await read($, windows)) as unknown as Windows
  const result = scoreEvents([{ type, at: now }], before, now, typeof last === 'number' ? last : null)
  const kept = pruneWindows(result.windows, now) as unknown as NibblWindows
  await update($, windows, () => kept)
  await $.store.set(STORE.windows, kept)
  await $.store.set(STORE.lastScoredAt, now)
  if (result.xpGained > 0) {
    const xp = current.xp + result.xpGained
    const was = levelOf(current.xp).level
    const is = levelOf(xp).level
    await savePet($, { ...current, xp })
    if (is > was) $.ui.toast(`${current.name} reached level ${is}!`)
  }
  return result.accepted
}

const hatch = async ($: EngineInterface): Promise<void> => {
  if (runtime.isHatching || (await read($, pet))) return
  runtime.isHatching = true
  try {
    const now = await $.clock.now()
    const roll = rollFromBytes(spikeHatchBytes(now))
    const born: NibblPet = { seed: roll.seed, tier: roll.tier, shiny: roll.shiny, hatchedAt: now, xp: 0, name: 'Byte' }
    await savePet($, born)
    await $.store.delete(STORE.eggTurns)
    await update($, eggTurns, () => 0)
    $.ui.toast(`${born.name} hatched! rarest: ${rarestLine(genomeOf(born.seed, born.tier, born.shiny))}`)
  } finally {
    runtime.isHatching = false
  }
}

const tick = async ($: EngineInterface): Promise<void> => {
  await update($, frame, n => (n + 1) % 100_000)
  if (await read($, working)) {
    const x = await read($, petX)
    let d = await read($, dir)
    if (x + d < 0 || x + d > WALK_MAX_X) d = -d
    await update($, dir, () => d)
    await update($, petX, () => x + d)
  }
  const isBlinking = await read($, blink)
  const shouldBlink = !isBlinking && Math.random() < 0.08
  if (isBlinking || shouldBlink) await update($, blink, () => shouldBlink)
}

// Started from session.start and again from turn.start, since a hot reload drops timers.
const ensureRunning = async ($: EngineInterface): Promise<void> => {
  if (runtime.ticker) return
  runtime.ticker = $.clock.every(TICK_MS, () => {
    void tick($)
  })
  await $.command.register({
    name: 'nibbl',
    description: 'Nibbl spike: /nibbl, /nibbl name <text>, /nibbl hide, /nibbl mode raster|text|client, /nibbl reset',
    argumentHint: '[name <text> | hide | mode <m> | reset]',
  })
}

const petPressed = async ($: EngineInterface): Promise<void> => {
  await ensureLoaded($)
  const now = await markActive($)
  const current = await read($, pet)
  if (!current) {
    $.ui.toast('The egg wiggles. Keep working to hatch it.')
    return
  }
  const accepted = await score($, 'pet')
  await feel($, 'happy', HEART_MS)
  if (accepted > 0) await update($, heartUntil, () => now + HEART_MS)
  else $.ui.toast(`${current.name} is all petted out this hour.`)
}

const statsText = async ($: EngineInterface): Promise<string> => {
  const current = await read($, pet)
  if (!current) {
    const turns = await read($, eggTurns)
    return `Egg: ${turns}/${HATCH_AFTER_TURNS} answered turns, hatches after ${HATCH_AFTER_TURNS}.`
  }
  const g = genomeOf(current.seed, current.tier, current.shiny)
  const lv = levelOf(current.xp)
  const now = await $.clock.now()
  const left = heartsLeft((await read($, windows)) as unknown as Windows, now)
  const looks = traitOdds(g)
    .map(t => `${t.gene} ${t.value} (${pct(t.probability)}%)`)
    .join(', ')
  return [
    `${current.name} #local · ${current.tier}${current.shiny ? ' · shiny' : ''}`,
    `lvl ${lv.level}, ${current.xp} xp (${lv.intoLevel}/${lv.toNext} to next)`,
    `hearts left this hour: ${left}/5`,
    `bugs ${await read($, bugs)}`,
    `traits: ${looks}`,
    `rarest trait: ${rarestLine(g)}`,
    `seed ${current.seed >>> 0}, hatched ${new Date(current.hatchedAt).toISOString()} (spike: local random roll)`,
  ].join('\n')
}

const reset = async ($: EngineInterface): Promise<void> => {
  for (const key of await $.store.keys()) await $.store.delete(key)
  await update($, pet, () => null)
  await update($, eggTurns, () => 0)
  await update($, windows, () => ({}))
  await update($, bugs, () => 0)
  await update($, mood, () => 'idle' as const)
  await update($, moodUntil, () => 0)
  await update($, heartUntil, () => 0)
  await update($, petX, () => DEFAULT_X)
  await update($, hidden, () => false)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await ensureLoaded($)
    await markActive($)
    await ensureRunning($)
    return next(e)
  })

  on('command.run', { command: 'nibbl' }, async ($, e) => {
    await ensureLoaded($)
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    if (verb === 'name') {
      const name = rest.join(' ').trim()
      const current = await read($, pet)
      if (!current) return { text: 'Hatch the egg first, then name it.' }
      if (name.length === 0 || name.length > MAX_NAME) return { text: `A name is 1 to ${MAX_NAME} characters.` }
      await savePet($, { ...current, name })
      return { text: `Renamed to ${name}.` }
    }
    if (verb === 'hide') {
      const was = await read($, hidden)
      await update($, hidden, () => !was)
      return { text: was ? 'Nibbl is back.' : 'Nibbl is hidden. /nibbl hide brings it back.' }
    }
    if (verb === 'mode') {
      const want = rest[0] as NibblSceneMode
      if (!MODES.includes(want)) return { text: `Modes: ${MODES.join(', ')}.` }
      await update($, mode, () => want)
      await $.store.set(STORE.mode, want)
      return { text: `Scene drawn with ${want}.` }
    }
    if (verb === 'reset') {
      await reset($)
      return { text: `Back to an egg. It hatches after ${HATCH_AFTER_TURNS} answered turns.` }
    }
    return { text: await statsText($) }
  })

  on('turn.start', async ($, e, next) => {
    await ensureLoaded($)
    await ensureRunning($)
    await markActive($)
    await update($, working, () => true)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    await ensureLoaded($)
    await markActive($)
    await update($, working, () => false)
    if (e.reason === 'answer') {
      if (await read($, pet)) {
        await score($, 'turn')
      } else {
        const turns = (await read($, eggTurns)) + 1
        await update($, eggTurns, () => turns)
        await $.store.set(STORE.eggTurns, turns)
        if (turns >= HATCH_AFTER_TURNS) {
          $.clock.after(HATCH_DELAY_MS, () => {
            void hatch($)
          })
        }
      }
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    await ensureLoaded($)
    await markActive($)
    const command = e.tool === 'Bash' ? String((e as { command?: unknown }).command ?? '') : ''
    if (ran.isError === true) {
      await update($, bugs, n => Math.min(MAX_BUGS, n + 1))
      await feel($, 'sad', MOOD_MS)
      await score($, 'error')
    } else if (command && CHECK_COMMAND.test(command)) {
      await update($, bugs, () => 0)
      await feel($, 'happy', MOOD_MS)
      await score($, 'check_pass')
    }
    if (ran.isError !== true && COMMIT_COMMAND.test(command)) await score($, 'commit')
    return ran
  })

  // RISK #2 probe: the Client scene posts { pet: true } on a click.
  on('ui.message', async ($, e, next) => {
    const data = e.data as { pet?: unknown } | null
    if (e.element === 'scene' && data && data.pet === true) {
      await petPressed($)
      return {}
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, hidden))) return next(e)

    const now = await $.clock.now()
    const tickNo = await read($, frame)
    const current = await read($, pet)
    const isCompact = e.props.maxRows < MIN_FULL_ROWS
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const sceneMode = await read($, mode)

    const petButton = <Button key="pet" label="♥" hotkey="p" onPress={() => void petPressed($)} />

    // Draws the scene per mode; Raster exists on the terminal table alone.
    const sceneOf = (drawing: { raster: { columns: number; rows: number; cells: string }; runs: Run[][] }) => {
      if (e.surface === 'terminal') {
        const t = $.ui.resolve(e)
        if (sceneMode === 'raster') {
          const { Raster } = t
          return <Raster key="scene" columns={drawing.raster.columns} rows={drawing.raster.rows} cells={drawing.raster.cells} />
        }
        if (sceneMode === 'client') {
          const { Client } = t
          return <Client key="scene" module="./scene-client.js" props={{ runs: drawing.runs }} width={drawing.raster.columns} height={drawing.raster.rows} />
        }
      }
      return (
        <Box flexDirection="column">
          {drawing.runs.map(row => (
            <Box flexDirection="row">
              {row.map(run => (
                <Text {...(run.color ? { color: run.color } : {})} {...(run.backgroundColor ? { backgroundColor: run.backgroundColor } : {})}>
                  {run.text}
                </Text>
              ))}
            </Box>
          ))}
        </Box>
      )
    }

    if (!current) {
      const turns = await read($, eggTurns)
      const hud = `Egg · hatches after ${HATCH_AFTER_TURNS} turns`
      const progress = `turns ${Math.min(turns, HATCH_AFTER_TURNS)}/${HATCH_AFTER_TURNS}${turns >= HATCH_AFTER_TURNS ? ' · hatching!' : ''}`
      if (isCompact) {
        return (
          <Box flexDirection="row" width={e.props.bodyColumns}>
            <Text color="#ffcd75">{hud}</Text>
            <Text dimColor> · {progress}</Text>
          </Box>
        )
      }
      return (
        <Box flexDirection="row" justifyContent="flex-end" alignItems="center" width={e.props.bodyColumns}>
          <Box flexDirection="column" alignItems="flex-end" marginRight={1}>
            <Text color="#ffcd75" bold>{hud}</Text>
            <Text dimColor>{progress}</Text>
            <Text dimColor italic>cracks: {eggCracks(turns)}/3</Text>
          </Box>
          {sceneOf(eggDrawing(turns, tickNo))}
        </Box>
      )
    }

    const g = genomeOf(current.seed, current.tier, current.shiny)
    const lv = levelOf(current.xp)
    const isWorking = (await read($, working)) || e.props.isWorking
    const look = pickLook({
      isWorking,
      mood: await read($, mood),
      moodUntil: await read($, moodUntil),
      lastActiveAt: await read($, lastActiveAt),
      now,
    })
    const heart = now < (await read($, heartUntil))
    const left = heartsLeft((await read($, windows)) as unknown as Windows, now)
    const title = `${current.name} #local · ${current.tier}${current.shiny ? ' · shiny' : ''}`
    const xpLine = `lvl ${lv.level}  ${xpBar(lv.intoLevel, lv.toNext)} ${lv.intoLevel}/${lv.toNext}`
    const hearts = heartsBar(left)

    if (isCompact) {
      return (
        <Box flexDirection="row" width={e.props.bodyColumns}>
          <Text color="#ef7d57" bold>{current.name}</Text>
          <Text dimColor> lvl {lv.level} </Text>
          <Text color="#b13e53">{hearts}</Text>
          <Text dimColor italic> {look} </Text>
          {petButton}
        </Box>
      )
    }

    const drawing = petDrawing(g, {
      stage: stageForLevel(lv.level),
      expression: expressionFor(look, await read($, blink), heart),
      petX: await read($, petX),
      lift: liftFor(look, tickNo),
      bugs: await read($, bugs),
      heart,
      frame: tickNo,
    })

    return (
      <Box flexDirection="row" justifyContent="flex-end" alignItems="center" width={e.props.bodyColumns}>
        <Box flexDirection="column" alignItems="flex-end" marginRight={1}>
          <Text color="#ef7d57" bold>{title}</Text>
          <Text>{xpLine}</Text>
          <Text color="#b13e53">{hearts}</Text>
          <Text dimColor italic>{look}</Text>
          {petButton}
        </Box>
        {sceneOf(drawing)}
      </Box>
    )
  })
}
