import type { Expression, Stage } from '@nibbl/core'

import type { NibblReaction } from '../types'
import { AWAY_X, BOX_MS, HEART_MS, HOME_X, LOOT_MS, MAX_BUGS, MOOD_MS, NIGHT_FROM_HOUR, NIGHT_TO_HOUR, SLEEP_AFTER_MS } from './config'
import type { Anim } from './runtime'

export const CALM: NibblReaction = { bugs: 0, mood: 'idle', moodUntil: 0, heartUntil: 0, lootUntil: 0, boxUntil: 0, awaySince: 0, lastActiveAt: 0 }

// Every reaction is tied to a real event (principle 1); nothing here runs on a timer.
export const onTurnStart = (r: NibblReaction, now: number): NibblReaction => ({ ...r, awaySince: r.awaySince || now, lastActiveAt: now })
export const onTurnEnd = (r: NibblReaction, now: number, isAnswer: boolean): NibblReaction => ({
  ...r,
  awaySince: 0,
  lootUntil: isAnswer ? now + LOOT_MS : r.lootUntil,
  lastActiveAt: now,
})
export const onError = (r: NibblReaction, now: number): NibblReaction => ({
  ...r,
  bugs: Math.min(MAX_BUGS, r.bugs + 1),
  mood: 'sad',
  moodUntil: now + MOOD_MS,
  lastActiveAt: now,
})
export const onCheckPass = (r: NibblReaction, now: number): NibblReaction => ({ ...r, bugs: 0, mood: 'happy', moodUntil: now + MOOD_MS, lastActiveAt: now })
export const onCommit = (r: NibblReaction, now: number): NibblReaction => ({ ...r, boxUntil: now + BOX_MS, lastActiveAt: now })
export const onPet = (r: NibblReaction, now: number): NibblReaction => ({ ...r, heartUntil: now + HEART_MS, lastActiveAt: now })
export const onActive = (r: NibblReaction, now: number): NibblReaction => ({ ...r, lastActiveAt: now })

export const parseUtcOffset = (stdout: string): number | null => {
  const m = /^([+-])(\d{2})(\d{2})$/.exec(stdout.trim())
  if (!m) return null
  const minutes = Number(m[2]) * 60 + Number(m[3])
  return m[1] === '-' ? -minutes : minutes
}

export const localHour = (now: number, offsetMin: number): number => {
  const minutes = Math.floor(now / 60_000) + offsetMin
  const ofDay = ((minutes % 1440) + 1440) % 1440
  return Math.floor(ofDay / 60)
}

export const isNight = (now: number, offsetMin: number): boolean => {
  const hour = localHour(now, offsetMin)
  return hour >= NIGHT_FROM_HOUR && hour < NIGHT_TO_HOUR
}

export type Look = 'away' | 'oops' | 'loved' | 'yum' | 'shipped' | 'loot' | 'zzz' | 'night' | 'chilling'

export const lookOf = (r: NibblReaction, now: number, offsetMin: number): Look => {
  if (r.awaySince > 0) return 'away'
  if (r.mood === 'sad' && now < r.moodUntil) return 'oops'
  if (now < r.heartUntil) return 'loved'
  if (r.mood === 'happy' && now < r.moodUntil) return 'yum'
  if (now < r.boxUntil) return 'shipped'
  if (now < r.lootUntil) return 'loot'
  if (r.lastActiveAt > 0 && now - r.lastActiveAt > SLEEP_AFTER_MS) return 'zzz'
  if (isNight(now, offsetMin)) return 'night'
  return 'chilling'
}

const STATUS: Record<Exclude<Look, 'away'>, string> = {
  oops: 'oops, a bug',
  loved: 'loved that',
  yum: 'yum, bugs eaten',
  shipped: 'shipped a commit',
  loot: 'back with loot',
  zzz: 'zzz',
  night: 'nightcap on',
  chilling: 'chilling',
}

export const clockText = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = String(total % 60).padStart(2, '0')
  const minutes = Math.floor(total / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

export const statusText = (look: Look, now: number, awaySince: number): string =>
  look === 'away' ? `⛏ on expedition ${clockText(now - awaySince)}` : STATUS[look]

export type SceneKey = {
  stage: Stage
  expression: Expression
  petX: number
  lift: number
  bugs: number
  heart: boolean
  frame: number
  away: boolean
  loot: boolean
  box: boolean
  nightcap: boolean
  zzz: boolean
}

export const sceneKeyOf = (r: NibblReaction, stage: Stage, anim: Anim, now: number, offsetMin: number): SceneKey => {
  const look = lookOf(r, now, offsetMin)
  const isWalking = anim.petX !== (r.awaySince > 0 ? AWAY_X : HOME_X)
  const isSleeping = look === 'zzz'
  const night = isNight(now, offsetMin)
  const hasLoot = now < r.lootUntil
  let expression: Expression = anim.blink ? 'blink' : 'idle'
  if (look === 'oops') expression = 'sad'
  else if (look === 'loved' || look === 'yum') expression = 'happy'
  else if (isSleeping) expression = 'sleep'
  else if (night && anim.frame % 16 < 2) expression = 'surprised' // a yawn
  return {
    stage,
    expression,
    petX: anim.petX,
    // loot and zzz write at fixed scene rows, so the pet never hops while either shows
    lift: isSleeping || hasLoot ? 0 : isWalking ? anim.frame % 2 : Math.floor(anim.frame / 2) % 2,
    bugs: r.bugs,
    heart: now < r.heartUntil,
    frame: anim.frame % 2,
    away: r.awaySince > 0 && !isWalking,
    loot: hasLoot,
    box: now < r.boxUntil,
    nightcap: night,
    zzz: isSleeping,
  }
}

// One tick: a step toward the edge while away (or home after), and a random blink.
export const stepAnim = (anim: Anim, r: NibblReaction, roll: number): Anim => {
  const target = r.awaySince > 0 ? AWAY_X : HOME_X
  const petX = anim.petX < target ? anim.petX + 1 : anim.petX > target ? anim.petX - 1 : anim.petX
  return { frame: (anim.frame + 1) % 100_000, petX, blink: !anim.blink && roll < 0.08 }
}
