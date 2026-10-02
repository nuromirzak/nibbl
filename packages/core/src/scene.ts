import { drawPet, PET_SIZE, type Expression, type Stage } from './draw'
import type { Genome } from './genome'
import { blankGrid, setCell, type Grid } from './grid'
import { C } from './palette'

export const SCENE_W = 32
export const SCENE_H = 16
const GROUND = SCENE_H - 1

export type SceneOpts = {
  stage?: Stage
  expression?: Expression
  petX?: number
  lift?: number
  bugs?: number
  heart?: boolean
  frame?: number
}

// Non-finite input (NaN, Infinity from a bad option) maps to min so a scene always draws.
const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : min

const BUG: [number, number, number][] = [
  [0, 0, C.lime], [4, 0, C.lime], [2, 0, C.ink], [1, 1, C.lime], [2, 1, C.lime], [3, 1, C.lime],
]
const HEART: [number, number][] = [
  [1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3],
]

export const drawGround = (scene: Grid): void => {
  for (let x = 0; x < SCENE_W; x++) scene[GROUND][x] = x % 2 === 0 ? C.slate : C.dusk
}

export const drawScene = (g: Genome, opts: SceneOpts = {}): Grid => {
  const scene = blankGrid(SCENE_W, SCENE_H)
  drawGround(scene)
  const petX = clamp(opts.petX ?? 6, 0, SCENE_W - PET_SIZE)
  const lift = clamp(opts.lift ?? 0, 0, 3)
  const frame = clamp(opts.frame ?? 0, 0, 1_000_000)

  for (let x = petX + 4; x <= petX + 11; x++) setCell(scene, x, GROUND - 1, C.dusk)

  const pet = drawPet(g, opts.stage ?? 'adult', opts.expression ?? 'idle')
  for (let y = 0; y < PET_SIZE; y++) {
    const sy = y - lift
    if (sy < 0 || sy >= GROUND) continue
    for (let x = 0; x < PET_SIZE; x++) {
      const cell = pet[y][x]
      if (cell !== null) scene[sy][petX + x] = cell
    }
  }

  const bugs = clamp(opts.bugs ?? 0, 0, 3)
  for (let i = 0; i < bugs; i++) {
    const bx = SCENE_W - 6 - i * 6
    for (const [dx, dy, color] of BUG) setCell(scene, bx + dx, GROUND - 2 + dy, color)
  }

  if (opts.heart) for (const [dx, dy] of HEART) setCell(scene, SCENE_W - 8 + dx, 2 + dy, C.red)

  if (g.tier === 'legendary') {
    const on = frame % 2 === 0
    setCell(scene, petX + 1, on ? 2 : 5, C.yellow)
    setCell(scene, petX + 14, on ? 5 : 2, C.white)
  }
  if (g.shiny) {
    // A second twinkle beside the pet's own corner sparkle, only on empty sky.
    const [x, y] = frame % 2 === 0 ? [petX + 15, 2] : [petX + 13, 0]
    if (scene[y][x] === null) scene[y][x] = C.white
  }
  return scene
}
