import { drawEggScene, drawScene, genome, levelFromXp, stageForLevel, toCellPairs, type Genome, type Tier } from '@nibbl/core'

import type { NibblPetView, NibblReaction } from '../types'
import { encodeRaster, type RasterCells } from './cells'
import { HATCH_AFTER_TURNS } from './config'
import { hudLines } from './hud'
import { sceneKeyOf, type SceneKey } from './reactions'
import type { Anim } from './runtime'

// Genome is pure in (seed, tier, shiny): computed once per pet, not per frame.
const genomes = new Map<string, Genome>()
export const genomeOf = (seed: number, tier: Tier, shiny: boolean): Genome => {
  const key = `${seed}.${tier}.${shiny ? 1 : 0}`
  let g = genomes.get(key)
  if (!g) {
    g = genome(seed, tier, shiny)
    genomes.set(key, g)
  }
  return g
}

// Cells are cached per visible state, so a repeated frame costs a map lookup.
const cache = new Map<string, RasterCells>()
const remember = (id: string, make: () => RasterCells): RasterCells => {
  let cells = cache.get(id)
  if (!cells) {
    if (cache.size > 512) cache.clear()
    cells = make()
    cache.set(id, cells)
  }
  return cells
}

export type Drawn = { id: string; cells: RasterCells }

export const petCells = (g: Genome, key: SceneKey): Drawn => {
  const id = `${g.seed}.${g.tier}.${g.shiny ? 1 : 0}|${JSON.stringify(key)}`
  return { id, cells: remember(id, () => encodeRaster(toCellPairs(drawScene(g, key)))) }
}

export const eggCracks = (turns: number): 0 | 1 | 2 | 3 =>
  Math.max(0, Math.min(3, Math.floor((turns * 3) / HATCH_AFTER_TURNS))) as 0 | 1 | 2 | 3

export const eggCells = (turns: number, frame: number): Drawn => {
  const cracks = eggCracks(turns)
  const id = `egg|${cracks}|${frame % 2}`
  return { id, cells: remember(id, () => encodeRaster(toCellPairs(drawEggScene(cracks, frame % 2)))) }
}

// What one moment looks like: the scene (id + cells, for blit) and the HUD fingerprint (for redraws).
export type Frame = Drawn & { hud: string }

export const frameOf = (view: NibblPetView | null, turns: number, r: NibblReaction, anim: Anim, now: number, tz: number): Frame => {
  const lines = hudLines(view, turns, r, now, tz)
  const hud = `${lines.status}|${lines.hearts}`
  if (!view) return { ...eggCells(turns, anim.frame), hud }
  const g = genomeOf(view.seed, view.tier, view.shiny)
  return { ...petCells(g, sceneKeyOf(r, stageForLevel(levelFromXp(view.xp).level), anim, now, tz)), hud }
}
