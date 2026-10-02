import { PET_SIZE } from './draw'
import { blankGrid, inBounds, setCell, type Grid } from './grid'
import { C } from './palette'
import { drawGround, SCENE_H, SCENE_W } from './scene'

const CRACKS: [number, number][][] = [
  [],
  [[7, 4], [8, 5], [7, 6]],
  [[7, 4], [8, 5], [7, 6], [9, 7], [10, 8], [9, 9]],
  [[7, 4], [8, 5], [7, 6], [9, 7], [10, 8], [9, 9], [5, 8], [6, 9], [5, 10]],
]

// Center (7.5, 8.5), half-width 5, half-height 6, in doubled integer coordinates.
const insideEgg = (x: number, y: number) => {
  const dx2 = 2 * x - 15
  const dy2 = 2 * y - 17
  return dx2 * dx2 * 36 + dy2 * dy2 * 25 <= 3600
}

export const drawEgg = (cracks: 0 | 1 | 2 | 3): Grid => {
  const egg = blankGrid(PET_SIZE, PET_SIZE)
  for (let y = 0; y < PET_SIZE; y++) {
    for (let x = 0; x < PET_SIZE; x++) {
      if (!insideEgg(x, y)) continue
      const bottomRight = !insideEgg(x + 1, y) || !insideEgg(x, y + 1)
      egg[y][x] = bottomRight ? C.silver : C.white
    }
  }
  for (const [x, y] of [[6, 6], [9, 10], [5, 11]] as const) setCell(egg, x, y, C.sky)
  for (const [x, y] of CRACKS[cracks]) setCell(egg, x, y, C.ink)

  const outlined = egg.map(row => [...row])
  for (let y = 0; y < PET_SIZE; y++) {
    for (let x = 0; x < PET_SIZE; x++) {
      if (egg[y][x] !== null) continue
      const touches = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as const).some(
        ([dx, dy]) => inBounds(egg, x + dx, y + dy) && egg[y + dy][x + dx] !== null,
      )
      if (touches) outlined[y][x] = C.ink
    }
  }
  return outlined
}

export const drawEggScene = (cracks: 0 | 1 | 2 | 3, frame = 0): Grid => {
  const scene = blankGrid(SCENE_W, SCENE_H)
  drawGround(scene)
  const wobble = cracks > 0 && frame % 2 === 1 ? 1 : 0
  const egg = drawEgg(cracks)
  for (let y = 0; y < PET_SIZE - 1; y++) {
    for (let x = 0; x < PET_SIZE; x++) {
      const cell = egg[y][x]
      if (cell !== null) setCell(scene, 8 + x + wobble, y, cell)
    }
  }
  return scene
}
