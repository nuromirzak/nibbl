import { describe, expect, it } from 'vitest'
import {
  ACHIEVEMENTS,
  ZERO_TOTALS,
  achievementById,
  nextUp,
  unlockedIds,
  type AchievementFacts,
} from '../src/achievements'

const facts = (o: Partial<AchievementFacts> = {}): AchievementFacts => ({
  ...ZERO_TOTALS,
  level: 1,
  friends: false,
  weekWins: 0,
  ...o,
})

describe('achievements', () => {
  it('has 15 unique ids', () => {
    expect(ACHIEVEMENTS).toHaveLength(15)
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(15)
    expect(achievementById('teen')?.name).toBe('Growing Up')
    expect(achievementById('nope')).toBeUndefined()
  })

  it('descriptions have no em dashes', () => {
    for (const a of ACHIEVEMENTS) expect(a.desc).not.toContain('—')
  })

  it('unlocks nothing at zero', () => {
    expect(unlockedIds(facts())).toEqual([])
  })

  it('threshold edges', () => {
    expect(unlockedIds(facts({ checks: 99 }))).toEqual(['first-bite'])
    expect(unlockedIds(facts({ checks: 100 }))).toEqual(['first-bite', 'bug-hunter'])
    expect(unlockedIds(facts({ commits: 99 }))).toEqual([])
    expect(unlockedIds(facts({ commits: 100 }))).toEqual(['committed'])
    expect(unlockedIds(facts({ turns: 1000 }))).toEqual(['pair'])
    expect(unlockedIds(facts({ activeDays: 7 }))).toEqual(['regular'])
    expect(unlockedIds(facts({ wavesSent: 25 }))).toEqual(['social'])
    expect(unlockedIds(facts({ errors: 100 }))).toEqual(['stubborn'])
  })

  it('teen and adult come from level', () => {
    expect(unlockedIds(facts({ level: 9 }))).toEqual([])
    expect(unlockedIds(facts({ level: 10 }))).toEqual(['teen'])
    expect(unlockedIds(facts({ level: 25 }))).toEqual(['teen', 'adult'])
  })

  it('friends and week flags', () => {
    expect(unlockedIds(facts({ friends: true, weekWins: 1 }))).toEqual(['friends', 'week'])
  })

  it('nextUp orders by ratio and excludes owned', () => {
    const f = facts({ checks: 50, commits: 90, level: 5 })
    const have = new Set(['first-bite'])
    const r = nextUp(f, have)
    expect(r.map((x) => x.id)).toEqual(['committed', 'bug-hunter', 'teen'])
    expect(r[0]).toEqual({ id: 'committed', name: 'Committed', value: 90, goal: 100 })
    expect(nextUp(f, have, 1)).toHaveLength(1)
    expect(nextUp(f, new Set(ACHIEVEMENTS.map((a) => a.id)))).toEqual([])
  })
})
