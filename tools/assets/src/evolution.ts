import { C, drawScene, type Expression, type Grid, type Stage } from '@nibbl/core'
import { Canvas } from './canvas'
import { B } from './colors'
import type { Frame } from './encode'
import { BYTE, HEART_SPRITE, pet, stamp } from './pets'

// Same handheld as hero.ts, so the launch assets read as one set.
const W = 640
const H = 360
const SCALE = 8
const PET_X = 8
const SHELL = { x: 144, y: 24, w: 352, h: 280 }
const LCD = { x: SHELL.x + 32, y: SHELL.y + 44, w: 32 * SCALE + 32, h: 16 * SCALE + 24 }
const SCREEN = { x: LCD.x + 16, y: LCD.y + 12 }

const frameBase = (caption: string): Canvas => {
  const c = new Canvas(W, H)
  c.box(SHELL.x, SHELL.y, SHELL.w, SHELL.h, B.shell, B.shell3)
  c.box(LCD.x, LCD.y, LCD.w, LCD.h, B.lcd1, B.lcd2, null)
  c.text('nibbl', SHELL.x + 32, SHELL.y + 14, 2, B.shell3)
  c.text(caption, SHELL.x + 32, LCD.y + LCD.h + 26, 2, B.lcd4)
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

const scene = (stage: Stage, expression: Expression, lift = 0, heartY: number | null = null): Grid => {
  const g = drawScene(pet(BYTE), { stage, expression, petX: PET_X, lift })
  if (heartY !== null) stamp(g, HEART_SPRITE, PET_X + 15, heartY)
  return g
}

export const evolutionFrames = (): Frame[] => {
  const frames: Frame[] = []
  const push = (canvas: Canvas, ms: number) => frames.push({ canvas, ms })
  const idle = (stage: Stage, caption: string) => {
    push(withScene(caption, scene(stage, 'idle')), 500)
    push(withScene(caption, scene(stage, 'idle', 1)), 240)
    push(withScene(caption, scene(stage, 'idle')), 500)
    push(withScene(caption, scene(stage, 'blink')), 120)
  }
  const evolve = (from: Stage, to: Stage, caption: string) => {
    for (let i = 0; i < 3; i++) {
      push(withScene(caption, scene(from, 'happy', i % 2)), 110)
      push(flash(caption, C.white), 70)
    }
    push(flash(caption, B.lcd1), 60)
    push(flash(caption, C.white), 90)
    push(withScene(caption, scene(to, 'happy')), 220)
  }
  const heart = (stage: Stage, caption: string) => {
    for (const [y, ms] of [[4, 110], [3, 130], [2, 150], [1, 180], [0, 260]] as const) {
      push(withScene(caption, scene(stage, 'happy', y % 2, y)), ms)
    }
  }

  idle('baby', 'Byte  lvl 9')
  idle('baby', 'Byte  lvl 9')
  evolve('baby', 'teen', 'lvl 10  evolved!')
  idle('teen', 'Byte  teen')
  heart('teen', 'Byte  teen  ♥')
  idle('teen', 'Byte  lvl 24')
  evolve('teen', 'adult', 'lvl 25  evolved!')
  idle('adult', 'Byte  adult')
  heart('adult', 'Byte  adult  ♥')
  push(withScene('Byte  adult', scene('adult', 'idle')), 900)
  return frames
}
