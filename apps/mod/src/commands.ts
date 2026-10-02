import { read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { exportCommand, importCommand, nameCommand } from './account'
import { apiBase } from './api'
import { K } from './config'
import { petPressed, recordEvent } from './events'
import { HELP, splitArgs } from './help'
import { eggStatsText, heartsBar, heartsLeftOf, oddsText, statsText } from './hud'
import { ensureLoaded, refreshView } from './model'
import { countEvents } from './queue'
import { genomeOf } from './scene'
import { eggAtom, hiddenAtom } from './state'
import { loadPet, loadQueues } from './store'

const statsCommand = async ($: EngineInterface): Promise<string> => {
  const view = await refreshView($)
  if (!view) return eggStatsText(await read($, eggAtom))
  const pet = await loadPet($)
  const pending = countEvents(Object.values(await loadQueues($)))
  return statsText(view, genomeOf(view.seed, view.tier, view.shiny), await $.clock.now(), {
    base: await apiBase($),
    pending,
    lastSyncAt: pet?.lastSyncAt ?? null,
  })
}

const oddsCommand = async ($: EngineInterface): Promise<string> => {
  const view = await refreshView($)
  return oddsText(view, view ? genomeOf(view.seed, view.tier, view.shiny) : null)
}

// The hide event feeds the "hide rate" guardrail metric (docs/product-principles.md).
const hideCommand = async ($: EngineInterface): Promise<string> => {
  const isHidden = !(await read($, hiddenAtom))
  await update($, hiddenAtom, () => isHidden)
  await $.store.set(K.hidden, isHidden)
  if (isHidden) await recordEvent($, 'hide')
  return isHidden ? 'Nibbl is hidden. It keeps living and syncing; /nibbl hide brings it back.' : 'Nibbl is back.'
}

// The band's [♥] takes a click or its hotkey only while the band holds the focus (ctrl+x tab, or a
// click in the fullscreen terminal); this verb pets it from the prompt anywhere.
const petCommand = async ($: EngineInterface): Promise<string> => {
  const before = await refreshView($)
  if (!before) return 'The egg wobbles. It hatches after a few more turns.'
  const hadHeart = heartsLeftOf(before, await $.clock.now()) > 0
  await petPressed($)
  if (!hadHeart) return `${before.name} loves it ♥  no XP left this hour, hearts come back next hour.`
  const after = (await refreshView($)) ?? before
  return `${after.name} loves it ♥  hearts this hour: ${heartsBar(heartsLeftOf(after, await $.clock.now()))}`
}

export const runCommand = async ($: EngineInterface, args: string): Promise<string> => {
  await ensureLoaded($)
  const { verb, rest } = splitArgs(args)
  if (verb === '') return statsCommand($)
  if (verb === 'pet') return petCommand($)
  if (verb === 'odds') return oddsCommand($)
  if (verb === 'hide') return hideCommand($)
  if (verb === 'name') return nameCommand($, 'name', rest)
  if (verb === 'label') return nameCommand($, 'label', rest)
  if (verb === 'export') return exportCommand($)
  if (verb === 'import') return importCommand($, rest)
  return HELP
}
