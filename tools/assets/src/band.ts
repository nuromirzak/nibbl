import { C, SCENE_H, SCENE_W, drawScene, type Expression } from '@nibbl/core'
import { Canvas } from './canvas'
import { B } from './colors'
import type { Frame } from './encode'
import { BUG_SPRITE, BYTE, HEART_SPRITE, pet, stamp } from './pets'

// A mock Claude Code terminal at GitHub README width: log on top, the nibbl band above the
// prompt (HUD left, 32x16 scene right), story: Claude works, a test fails, the fix passes.
const W = 880
const H = 452
const T = 2 // text scale: 12 px per character
const LINE = 22
const SCALE = 7
const TERM = { x: 16, y: 12, w: 844, h: 420 }
const LOG = { x: TERM.x + 20, y: TERM.y + 52, lines: 8 }
const BAND = { y: TERM.y + 236, h: 136 }
const SCENE = { x: TERM.x + TERM.w - 20 - SCENE_W * SCALE, y: BAND.y + 12 }
const BUG_X = SCENE_W - 6
const BUG_GROUND = SCENE_H - 3

type Seg = [text: string, color: number]
type Line = Seg[]

type State = {
  log: Line[]
  petX: number
  lift: number
  expression: Expression
  bugY: number | null
  heartY: number | null
  xp: number
  status: Seg
}

const tool = (name: string, arg: string): Line => [['● ', C.lime], [name, C.white], [`(${arg})`, B.text]]
const result = (text: string, color: number): Line => [['  ⎿ ', C.slate], [text, color]]

const bar = (pct: number) => {
  const on = Math.round((pct / 100) * 9)
  return '▓'.repeat(on) + '░'.repeat(9 - on)
}

const render = (s: State): Canvas => {
  const c = new Canvas(W, H)
  c.box(TERM.x, TERM.y, TERM.w, TERM.h, B.term, B.termLine)
  // Title bar.
  for (let i = 0; i < 3; i++) c.rect(TERM.x + 16 + i * 16, TERM.y + 12, 8, 8, C.dusk)
  c.text('claude  ~/projects/api', TERM.x + 72, TERM.y + 8, T, C.slate)
  c.rect(TERM.x, TERM.y + 32, TERM.w, 4, B.termLine)

  const visible = s.log.slice(-LOG.lines)
  visible.forEach((line, i) => {
    let x = LOG.x
    for (const [text, color] of line) x = c.text(text, x, LOG.y + i * LINE, T, color)
  })

  // Band: transparent scene over the terminal's own background, HUD as plain text.
  c.rect(TERM.x, BAND.y - 4, TERM.w, 4, B.termLine)
  c.rect(TERM.x, BAND.y, TERM.w, BAND.h, B.night)
  const hx = TERM.x + 20
  let hy = BAND.y + 22
  let x = c.text('Byte #000042', hx, hy, T, C.white)
  c.text(' · night coder', x, hy, T, C.slate)
  hy += 24
  x = c.text('lvl 7  ', hx, hy, T, C.white)
  x = c.text(bar(s.xp), x, hy, T, C.green)
  c.text(` ${s.xp}%`, x, hy, T, B.text)
  hy += 24
  x = c.text('♥♥♥', hx, hy, T, C.red)
  c.text('♡♡', x, hy, T, C.slate)
  hy += 24
  c.text(s.status[0], hx, hy, T, s.status[1])

  const scene = drawScene(pet(BYTE), { stage: 'baby', petX: s.petX, lift: s.lift, expression: s.expression })
  if (s.bugY !== null) stamp(scene, BUG_SPRITE, BUG_X, s.bugY)
  if (s.heartY !== null) stamp(scene, HEART_SPRITE, s.petX + 13, s.heartY)
  c.grid(scene, SCENE.x, SCENE.y, SCALE)

  // Prompt row under the band.
  const py = BAND.y + BAND.h
  c.rect(TERM.x, py, TERM.w, 4, B.termLine)
  c.text('›', TERM.x + 20, py + 14, T, C.silver)
  c.rect(TERM.x + 44, py + 12, 10, 20, C.silver)
  return c
}

export const bandFrames = (): Frame[] => {
  const frames: Frame[] = []
  const s: State = {
    log: [[['› ', C.silver], ['fix the failing session test', C.white]], []],
    petX: 3,
    lift: 0,
    expression: 'idle',
    bugY: null,
    heartY: null,
    xp: 62,
    status: ['on expedition 0:00', C.silver],
  }
  const push = (ms: number) => frames.push({ canvas: render(s), ms })
  let seconds = 0
  const tick = () => {
    seconds++
    s.status = [`on expedition 0:${String(seconds).padStart(2, '0')}`, C.silver]
  }
  const walk = (to: number, ms = 130) => {
    while (s.petX !== to) {
      s.petX += Math.sign(to - s.petX)
      s.lift = s.lift === 0 ? 1 : 0
      push(ms)
    }
    s.lift = 0
  }

  push(600)
  s.log.push(tool('Read', 'src/session.ts'))
  tick()
  walk(8)
  s.log.push(result('Read 88 lines', C.slate))
  tick()
  walk(11)
  s.log.push(tool('Bash', 'pnpm test'))
  tick()
  walk(9)
  push(300)

  // A tool error drops a bug onto the scene; the pet notices.
  s.log.push(result('✗ 1 failed  TypeError: session is undefined', B.err))
  s.status = ['a bug landed on the scene', B.err]
  for (let y = 0; y <= BUG_GROUND; y += 2) {
    s.bugY = Math.min(y, BUG_GROUND)
    push(60)
  }
  s.bugY = BUG_GROUND
  s.expression = 'surprised'
  push(400)
  s.expression = 'sad'
  push(1100)

  s.log.push([], tool('Update', 'src/session.ts'))
  s.expression = 'idle'
  s.status = ['on expedition 0:07', C.silver]
  push(700)
  s.log.push(result('+2 -1', C.slate), tool('Bash', 'pnpm test'))
  push(800)
  s.log.push(result('✓ 12 passed', C.lime))
  s.status = ['tests pass! dinner time', C.lime]
  push(300)
  walk(14, 110)

  // The pet nibbles the bug: it vanishes, the pet is happy, a heart floats, XP ticks up.
  s.expression = 'surprised'
  push(160)
  s.bugY = null
  s.expression = 'happy'
  s.xp = 68
  s.log.push([['  nibbl: Byte nibbled 1 bug (+5 xp)', C.slate]])
  s.status = ['nom. +5 xp', C.lime]
  for (const y of [4, 3, 2, 1, 0]) {
    s.heartY = y
    s.lift = y % 2
    push(150)
  }
  s.lift = 0
  push(900)
  s.heartY = null
  s.expression = 'idle'
  push(700)
  s.expression = 'blink'
  push(140)
  s.expression = 'idle'
  push(1000)
  return frames
}
