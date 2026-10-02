import { read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { apiBase } from './api'
import { K } from './config'
import { recordEvent } from './events'
import { HELP, splitArgs } from './help'
import { eggStatsText, oddsText, statsText } from './hud'
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

export const runCommand = async ($: EngineInterface, args: string): Promise<string> => {
  await ensureLoaded($)
  const { verb } = splitArgs(args)
  if (verb === '') return statsCommand($)
  if (verb === 'odds') return oddsCommand($)
  if (verb === 'hide') return hideCommand($)
  return HELP
}
