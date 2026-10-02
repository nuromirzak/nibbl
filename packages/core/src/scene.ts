import { drawPet, PET_SIZE, type Expression, type Stage } from './draw'
import type { Genome } from './genome'
import { blankGrid, inBounds, setCell, type Grid } from './grid'
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
  // Reactions, all off by default so every existing scene draws exactly as before.
  away?: boolean // off on an expedition: no pet, shadow or pet effects; ground, bugs and hearts stay
  loot?: boolean // a sparkle in the pet's top-right corner, back from an expedition
  box?: boolean // a box held in front of the pet (a commit)
  nightcap?: boolean // a sleeping cap over the top of the head (02:00-05:00 local)
  zzz?: boolean // a Z bobbing in the pet's top-right corner while it sleeps
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

const LOOT: [number, number, number][] = [[1, 0, C.yellow], [0, 1, C.yellow], [1, 1, C.white], [2, 1, C.yellow], [1, 2, C.yellow]]
const BOX: [number, number, number][] = [
  [0, 0, C.orange], [1, 0, C.yellow], [2, 0, C.yellow], [3, 0, C.orange],
  [0, 1, C.orange], [1, 1, C.orange], [2, 1, C.orange], [3, 1, C.orange],
  [0, 2, C.red], [1, 2, C.red], [2, 2, C.red], [3, 2, C.red],
]
const ZED: [number, number][] = [[0, 0], [1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2]]
// Rows 0-3 of columns 13-15 are never part of a pet (draw.ts), so loot and the Z always find sky there.
const CORNER_X = 13

const paintSky = (scene: Grid, x: number, y: number, color: number): void => {
  if (inBounds(scene, x, y) && scene[y][x] === null) scene[y][x] = color
}

// The pet's top row and the middle column of that row, ignoring the corner a shiny sparkle uses.
const crownOf = (pet: Grid): { top: number; mid: number } | null => {
  for (let y = 0; y < pet.length; y++) {
    const xs: number[] = []
    for (let x = 0; x < pet[y].length; x++) if (pet[y][x] !== null && !(y <= 3 && x >= CORNER_X)) xs.push(x)
    if (xs.length > 0) return { top: y, mid: Math.floor((xs[0] + xs[xs.length - 1]) / 2) }
  }
  return null
}

const drawNightcap = (scene: Grid, pet: Grid, petX: number, lift: number): void => {
  const crown = crownOf(pet)
  if (!crown) return
  const y = crown.top - lift
  const x = petX + crown.mid
  for (let dx = -1; dx <= 1; dx++) setCell(scene, x + dx, y, C.blue)
  for (let dx = -2; dx <= 2; dx++) setCell(scene, x + dx, y + 1, C.blue)
  setCell(scene, x + 2, y, C.white)
}

export const drawScene = (g: Genome, opts: SceneOpts = {}): Grid => {
  const scene = blankGrid(SCENE_W, SCENE_H)
  drawGround(scene)
  const petX = clamp(opts.petX ?? 6, 0, SCENE_W - PET_SIZE)
  const lift = clamp(opts.lift ?? 0, 0, 3)
  const frame = clamp(opts.frame ?? 0, 0, 1_000_000)
  const isHome = opts.away !== true

  if (isHome) {
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
    if (opts.nightcap) drawNightcap(scene, pet, petX, lift)
    if (opts.box) for (const [dx, dy, color] of BOX) setCell(scene, petX + 11 + dx, GROUND - 4 + dy, color)
  }

  const bugs = clamp(opts.bugs ?? 0, 0, 3)
  for (let i = 0; i < bugs; i++) {
    const bx = SCENE_W - 6 - i * 6
    for (const [dx, dy, color] of BUG) setCell(scene, bx + dx, GROUND - 2 + dy, color)
  }

  if (opts.heart) for (const [dx, dy] of HEART) setCell(scene, SCENE_W - 8 + dx, 2 + dy, C.red)

  if (isHome) {
    if (opts.loot) for (const [dx, dy, color] of LOOT) paintSky(scene, petX + CORNER_X + dx, 1 + dy, color)
    if (opts.zzz) for (const [dx, dy] of ZED) paintSky(scene, petX + CORNER_X + dx, (frame % 2) + dy, C.white)
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
  }
  return scene
}
