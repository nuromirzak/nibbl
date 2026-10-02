import { C, SCENE_H, SCENE_W, drawEggScene, drawScene, type Expression, type Grid } from '@nibbl/core'
import { Canvas } from './canvas'
import { B } from './colors'
import type { Frame } from './encode'
import { BYTE, HEART_SPRITE, pet, stamp } from './pets'

const W = 640
const H = 360
const SCALE = 8
const PET_X = 8

const SHELL = { x: 144, y: 24, w: 352, h: 280 }
const LCD = { x: SHELL.x + 32, y: SHELL.y + 44, w: SCENE_W * SCALE + 32, h: SCENE_H * SCALE + 24 }
const SCREEN = { x: LCD.x + 16, y: LCD.y + 12 }

const frameBase = (caption: string): Canvas => {
  const c = new Canvas(W, H)
  c.box(SHELL.x, SHELL.y, SHELL.w, SHELL.h, B.shell, B.shell3)
  c.box(LCD.x, LCD.y, LCD.w, LCD.h, B.lcd1, B.lcd2, null)
  c.text('nibbl', SHELL.x + 32, SHELL.y + 14, 2, B.shell3)
  c.text(caption, SHELL.x + 32, LCD.y + LCD.h + 26, 2, B.lcd4)
  // Three device buttons, the first one in the accent color like the landing device.
  for (const [i, color] of [B.shell3, B.shell3, 3].entries()) {
    c.box(SHELL.x + SHELL.w - 104 + i * 28, LCD.y + LCD.h + 24, 16, 16, color, B.shell3, null, 2)
  }
  return c
}

const withScene = (caption: string, scene: Grid): Canvas => {
  const c = frameBase(caption)
  c.grid(scene, SCREEN.x, SCREEN.y, SCALE)
  return c
}

const flash = (caption: string, color: number): Canvas => {
  const c = frameBase(caption)
  c.rect(LCD.x, LCD.y, LCD.w, LCD.h, color)
  return c
}

const BURST: [number, number, number][] = [
  [15, 1, C.yellow], [16, 1, C.yellow], [10, 4, C.white], [21, 4, C.white], [7, 9, C.yellow], [24, 9, C.yellow],
  [11, 12, C.white], [20, 12, C.white], [15, 6, C.white], [16, 6, C.white], [15, 7, C.yellow], [16, 7, C.yellow],
]

const burst = (caption: string): Canvas => {
  const scene = drawEggScene(0).map(row => row.map(() => null as number | null))
  const ground = drawEggScene(0)[SCENE_H - 1]
  scene[SCENE_H - 1] = [...ground]
  for (const [x, y, color] of BURST) scene[y][x] = color
  return withScene(caption, scene)
}

const babyScene = (expression: Expression, lift = 0, heartY: number | null = null): Grid => {
  const scene = drawScene(pet(BYTE), { stage: 'baby', expression, petX: PET_X, lift })
  if (heartY !== null) stamp(scene, HEART_SPRITE, PET_X + 13, heartY)
  return scene
}

export const heroFrames = (): Frame[] => {
  const name = 'Byte #000042'
  const frames: Frame[] = []
  const push = (canvas: Canvas, ms: number) => frames.push({ canvas, ms })
  const egg = (cracks: 0 | 1 | 2 | 3, frame: number, caption: string, ms: number) =>
    push(withScene(caption, drawEggScene(cracks, frame)), ms)

  egg(0, 0, 'turns 7/10', 700)
  egg(0, 0, 'turns 8/10', 700)
  for (let i = 0; i < 4; i++) egg(1, i, 'turns 9/10', 140)
  egg(1, 0, 'turns 9/10', 300)
  for (let i = 0; i < 4; i++) egg(2, i, 'turns 10/10', 120)
  for (let i = 0; i < 6; i++) egg(3, i, 'hatching...', 90)
  push(flash('hatching...', C.white), 80)
  push(flash('hatching...', B.lcd1), 60)
  push(flash('hatching...', C.white), 80)
  push(burst(name), 160)

  const blinkCycle = () => {
    push(withScene(name, babyScene('idle')), 520)
    push(withScene(name, babyScene('idle', 1)), 260)
    push(withScene(name, babyScene('idle')), 520)
    push(withScene(name, babyScene('blink')), 130)
  }
  blinkCycle()
  blinkCycle()
  // A heart pops when the pet is petted: happy face, heart floats up and fades out.
  for (const [y, ms] of [[4, 120], [3, 140], [2, 160], [1, 200], [0, 300]] as const) {
    push(withScene(`${name}  ♥`, babyScene('happy', y % 2, y)), ms)
  }
  push(withScene(`${name}  ♥`, babyScene('happy')), 600)
  blinkCycle()
  push(withScene(name, babyScene('idle')), 600)
  return frames
}

