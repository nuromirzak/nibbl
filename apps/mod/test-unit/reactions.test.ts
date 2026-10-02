import { describe, expect, it } from 'vitest'
import {
  CALM,
  clockText,
  isNight,
  localHour,
  lookOf,
  onCheckPass,
  onError,
  onPet,
  onTurnEnd,
  onTurnStart,
  parseUtcOffset,
  sceneKeyOf,
  statusText,
  stepAnim,
} from '../src/reactions'

const NOW = Date.UTC(2026, 9, 2, 9, 0) // 14:00 at +05:00
const NIGHT = Date.UTC(2026, 9, 2, 21, 30) // 02:30 at +05:00
const ANIM = { frame: 2, petX: 8, blink: false }

describe('reducers', () => {
  it('adds a bug per error up to 3 and clears them on a passing check', () => {
    let r = CALM
    for (let i = 0; i < 5; i++) r = onError(r, NOW)
    expect(r).toMatchObject({ bugs: 3, mood: 'sad', moodUntil: NOW + 6_000, lastActiveAt: NOW })
    expect(onCheckPass(r, NOW)).toMatchObject({ bugs: 0, mood: 'happy', moodUntil: NOW + 6_000 })
  })

  it('walks off at turn start and comes back with loot only on an answer', () => {
    const away = onTurnStart(CALM, NOW)
    expect(away.awaySince).toBe(NOW)
    expect(onTurnStart(away, NOW + 5).awaySince).toBe(NOW)
    expect(onTurnEnd(away, NOW + 9, true)).toMatchObject({ awaySince: 0, lootUntil: NOW + 9 + 4_000 })
    expect(onTurnEnd(away, NOW + 9, false)).toMatchObject({ awaySince: 0, lootUntil: 0 })
    expect(onPet(CALM, NOW)).toMatchObject({ heartUntil: NOW + 2_000, lastActiveAt: NOW })
  })
})

describe('lookOf', () => {
  it('ranks away, oops, loved, yum, shipped, loot, zzz, night, chilling', () => {
    expect(lookOf({ ...CALM, awaySince: NOW, mood: 'sad', moodUntil: NOW + 1 }, NOW, 300)).toBe('away')
    expect(lookOf({ ...CALM, mood: 'sad', moodUntil: NOW + 1, heartUntil: NOW + 1 }, NOW, 300)).toBe('oops')
    expect(lookOf({ ...CALM, mood: 'happy', moodUntil: NOW + 1, heartUntil: NOW + 1 }, NOW, 300)).toBe('loved')
    expect(lookOf({ ...CALM, mood: 'happy', moodUntil: NOW + 1, boxUntil: NOW + 1 }, NOW, 300)).toBe('yum')
    expect(lookOf({ ...CALM, boxUntil: NOW + 1, lootUntil: NOW + 1 }, NOW, 300)).toBe('shipped')
    expect(lookOf({ ...CALM, lootUntil: NOW + 1 }, NOW, 300)).toBe('loot')
    expect(lookOf({ ...CALM, lastActiveAt: NOW - 3 * 60_000 - 1 }, NOW, 300)).toBe('zzz')
    expect(lookOf({ ...CALM, lastActiveAt: NIGHT - 1 }, NIGHT, 300)).toBe('night')
    expect(lookOf({ ...CALM, mood: 'sad', moodUntil: NOW }, NOW, 300)).toBe('chilling')
  })
})

describe('local time', () => {
  it('turns epoch ms and a UTC offset into the local hour', () => {
    expect(localHour(NIGHT, 300)).toBe(2)
    expect(localHour(NIGHT, -420)).toBe(14)
    expect(localHour(Date.UTC(2026, 9, 2, 1, 0), -120)).toBe(23)
  })

  it('is night from 02:00 to 04:59 local', () => {
    const at = (h: number, m: number) => Date.UTC(2026, 9, 2, h, m) - 300 * 60_000
    expect(isNight(at(2, 0), 300)).toBe(true)
    expect(isNight(at(4, 59), 300)).toBe(true)
    expect(isNight(at(5, 0), 300)).toBe(false)
    expect(isNight(at(1, 59), 300)).toBe(false)
  })

  it('parses date +%z', () => {
    expect(parseUtcOffset('+0500\n')).toBe(300)
    expect(parseUtcOffset('-0730')).toBe(-450)
    expect(parseUtcOffset('garbage')).toBeNull()
  })
})

describe('status text', () => {
  it('shows the expedition clock', () => {
    expect(clockText(0)).toBe('0:00')
    expect(clockText(65_000)).toBe('1:05')
    expect(clockText(3_725_000)).toBe('1:02:05')
    expect(statusText('away', NOW + 65_000, NOW)).toBe('⛏ on expedition 1:05')
    expect(statusText('oops', NOW, 0)).toBe('oops, a bug')
  })
})

describe('animation and scene keys', () => {
  it('walks to the edge while away, then back home', () => {
    let anim = ANIM
    const away = { ...CALM, awaySince: NOW }
    for (let i = 0; i < 12; i++) anim = stepAnim(anim, away, 0.5)
    expect(anim.petX).toBe(16)
    for (let i = 0; i < 3; i++) anim = stepAnim(anim, CALM, 0.5)
    expect(anim.petX).toBe(13)
    expect(stepAnim({ ...ANIM, blink: false }, CALM, 0.01).blink).toBe(true)
    expect(stepAnim({ ...ANIM, blink: true }, CALM, 0.01).blink).toBe(false)
  })

  it('hides the pet only once it reached the edge', () => {
    const away = { ...CALM, awaySince: NOW }
    expect(sceneKeyOf(away, 'baby', { ...ANIM, petX: 12 }, NOW, 300).away).toBe(false)
    expect(sceneKeyOf(away, 'baby', { ...ANIM, petX: 16 }, NOW, 300).away).toBe(true)
  })

  it('maps looks to expressions and overlays', () => {
    expect(sceneKeyOf({ ...CALM, mood: 'sad', moodUntil: NOW + 1, bugs: 2 }, 'baby', ANIM, NOW, 300)).toMatchObject({ expression: 'sad', bugs: 2 })
    expect(sceneKeyOf({ ...CALM, lastActiveAt: NOW - 4 * 60_000 }, 'baby', ANIM, NOW, 300)).toMatchObject({ expression: 'sleep', lift: 0, zzz: true })
    expect(sceneKeyOf({ ...CALM, lastActiveAt: NIGHT }, 'teen', { ...ANIM, frame: 0 }, NIGHT, 300)).toMatchObject({ expression: 'surprised', nightcap: true })
    expect(sceneKeyOf({ ...CALM, lastActiveAt: NIGHT }, 'teen', ANIM, NIGHT, 300)).toMatchObject({ expression: 'idle', nightcap: true })
    expect(sceneKeyOf({ ...CALM, heartUntil: NOW + 1 }, 'adult', ANIM, NOW, 300)).toMatchObject({ expression: 'happy', heart: true })
    expect(sceneKeyOf({ ...CALM, lootUntil: NOW + 1, boxUntil: NOW + 1 }, 'adult', ANIM, NOW, 300)).toMatchObject({ loot: true, box: true })
  })
})

describe('lift safety', () => {
  it('never hops while loot or zzz show, in any reaction state', () => {
    const states = [
      CALM,
      { ...CALM, awaySince: NOW },
      { ...CALM, lootUntil: NOW + 1 },
      { ...CALM, lootUntil: NOW + 1, awaySince: NOW },
      { ...CALM, lootUntil: NOW + 1, boxUntil: NOW + 1, heartUntil: NOW + 1 },
      { ...CALM, lastActiveAt: NOW - 4 * 60_000 },
      { ...CALM, lastActiveAt: NOW - 4 * 60_000, lootUntil: NOW + 1 },
      { ...CALM, mood: 'sad' as const, moodUntil: NOW + 1, bugs: 3, lootUntil: NOW + 1 },
    ]
    for (const r of states)
      for (let frame = 0; frame < 20; frame++)
        for (const petX of [8, 12, 16]) {
          const key = sceneKeyOf(r, 'adult', { frame, petX, blink: false }, NOW, 300)
          if (key.loot || key.zzz) expect(key.lift).toBe(0)
        }
  })
})
