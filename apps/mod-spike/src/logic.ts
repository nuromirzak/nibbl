import {
  drawEggScene,
  drawScene,
  genome,
  levelFromXp,
  rarestTrait,
  stageForLevel,
  type Expression,
  type Genome,
  type Tier,
} from '@nibbl/core'

import { drawingOf, type SceneDrawing } from './cells'

export const HATCH_AFTER_TURNS = 3
export const HATCH_DELAY_MS = 1500
export const TICK_MS = 500
export const MOOD_MS = 6000
export const HEART_MS = 2000
export const SLEEP_AFTER_MS = 3 * 60 * 1000
export const MAX_BUGS = 3
export const MAX_NAME = 16
export const MIN_FULL_ROWS = 8
export const WALK_MAX_X = 16
export const DEFAULT_X = 8

export const CHECK_COMMAND = /\b(test|vitest|jest|pytest|tsc|lint|build)\b/
export const COMMIT_COMMAND = /\bgit\s+commit\b/

export type Look = 'working' | 'chilling' | 'zzz' | 'oops' | 'yay'

export const pickLook = (s: {
  isWorking: boolean
  mood: 'idle' | 'happy' | 'sad'
  moodUntil: number
  lastActiveAt: number
  now: number
}): Look => {
  if (s.mood !== 'idle' && s.now < s.moodUntil) return s.mood === 'sad' ? 'oops' : 'yay'
  if (s.isWorking) return 'working'
  if (s.lastActiveAt > 0 && s.now - s.lastActiveAt > SLEEP_AFTER_MS) return 'zzz'
  return 'chilling'
}

export const expressionFor = (look: Look, blink: boolean, heart: boolean): Expression => {
  if (look === 'oops') return 'sad'
  if (look === 'yay' || heart) return 'happy'
  if (look === 'zzz') return 'sleep'
  return blink ? 'blink' : 'idle'
}

// Breathing: a slow 0/1 lift while idle; a step bounce every tick while walking.
export const liftFor = (look: Look, frame: number): number => {
  if (look === 'zzz') return 0
  if (look === 'working') return frame % 2
  return Math.floor(frame / 2) % 2
}

export const xpBar = (into: number, toNext: number, width = 5): string => {
  const filled = toNext > 0 ? Math.min(width, Math.round((width * into) / toNext)) : 0
  return '▓'.repeat(filled) + '░'.repeat(width - filled)
}

export const heartsBar = (left: number, max = 5): string => '♥'.repeat(left) + '♡'.repeat(Math.max(0, max - left))

export const pct = (p: number): string => {
  const v = p * 100
  return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)
}

// SPIKE ONLY: Math.random mixed with the clock. Not unpredictable and not fair; the real
// hatch rolls on the server from HMAC bytes. Good enough to see random pets locally.
export const spikeHatchBytes = (now: number, rand: () => number = Math.random): Uint8Array => {
  const out = new Uint8Array(12)
  let mix = ((now >>> 0) ^ Math.floor(now / 0x100000000)) >>> 0
  for (let i = 0; i < out.length; i++) {
    out[i] = (Math.floor(rand() * 256) ^ (mix >>> ((i % 4) * 8))) & 255
    mix = Math.imul(mix ^ out[i]!, 0x01000193) >>> 0
  }
  return out
}

// Genome is pure in (seed, tier, shiny): computed once per pet, not per render.
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

export const rarestLine = (g: Genome): string => {
  const t = rarestTrait(g)
  const label = t.gene === 'mark' || t.gene === 'shiny' ? t.value : `${t.value} ${t.gene}`
  return `${label} ${pct(t.probability)}% odds`
}

export type SceneKey = {
  stage: ReturnType<typeof stageForLevel>
  expression: Expression
  petX: number
  lift: number
  bugs: number
  heart: boolean
  frame: number
}

// Scenes are cached per visible state; frame only matters through frame % 2 (twinkles).
const scenes = new Map<string, SceneDrawing>()
const remember = (key: string, make: () => SceneDrawing): SceneDrawing => {
  let d = scenes.get(key)
  if (!d) {
    if (scenes.size > 512) scenes.clear()
    d = make()
    scenes.set(key, d)
  }
  return d
}

export const petDrawing = (g: Genome, k: SceneKey): SceneDrawing =>
  remember(
    `${g.seed}.${g.tier}.${g.shiny ? 1 : 0}|${k.stage}|${k.expression}|${k.petX}|${k.lift}|${k.bugs}|${k.heart ? 1 : 0}|${k.frame % 2}`,
    () => drawingOf(drawScene(g, { ...k, frame: k.frame % 2 })),
  )

export const eggCracks = (turns: number): 0 | 1 | 2 | 3 =>
  Math.max(0, Math.min(3, Math.floor((turns * 3) / HATCH_AFTER_TURNS))) as 0 | 1 | 2 | 3

export const eggDrawing = (turns: number, frame: number): SceneDrawing => {
  const cracks = eggCracks(turns)
  return remember(`egg|${cracks}|${frame % 2}`, () => drawingOf(drawEggScene(cracks, frame % 2)))
}

export const levelOf = (xp: number) => levelFromXp(xp)
export { stageForLevel }
