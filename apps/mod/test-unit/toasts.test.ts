import { describe, expect, it } from 'vitest'

import { achievementToastText } from '../src/social'
import { TOAST_PRIORITY, nextIndex, parseToastQueue, withAchievements, withToast, type QueuedToast } from '../src/toasts'

const q = (...kinds: QueuedToast['kind'][]): QueuedToast[] => kinds.map((kind, i) => ({ kind, text: `${kind}${i}` }))

describe('toast queue', () => {
  it('orders hatch, evolution, week, achievement, invite, wave, greeting, note, update', () => {
    expect(TOAST_PRIORITY).toEqual(['hatch', 'evolution', 'week', 'achievement', 'invite', 'wave', 'greeting', 'note', 'update'])
  })
  it('shows the highest priority first and the oldest among equals', () => {
    expect(nextIndex(q('note', 'greeting', 'update'))).toBe(1)
    expect(nextIndex(q('update', 'wave', 'achievement', 'week', 'note'))).toBe(3)
    expect(nextIndex(q('wave', 'wave'))).toBe(0)
    expect(nextIndex([])).toBe(-1)
  })
  it('drops the same text twice and caps the queue', () => {
    const a = withToast([], 'wave', 'hi')
    expect(withToast(a, 'wave', 'hi')).toEqual(a)
    let items: QueuedToast[] = []
    for (let i = 0; i < 30; i++) items = withToast(items, 'note', `n${i}`)
    expect(items).toHaveLength(12)
    expect(items.at(-1)!.text).toBe('n29')
  })
  it('evicts the lowest-priority oldest item past the cap, not just the oldest', () => {
    let items: QueuedToast[] = [{ kind: 'week', text: 'crown' }]
    for (let i = 0; i < 11; i++) items = withToast(items, 'note', `n${i}`)
    items = withToast(items, 'wave', 'w')
    expect(items).toHaveLength(12)
    expect(items.map(t => t.text)).toContain('crown')
    expect(items.map(t => t.text)).not.toContain('n0')
    expect(items.map(t => t.text)).toContain('n1')
    expect(items.map(t => t.text)).toContain('w')
  })
  it('merges unlock items into one aggregated item', () => {
    let items = withAchievements([], ['first-bite'], 'Pixel', achievementToastText)
    expect(items).toEqual([{ kind: 'achievement', text: '🏆 Pixel unlocked First Bite', ids: ['first-bite'], me: 'Pixel' }])
    items = withAchievements(withToast(items, 'wave', 'hi'), ['bug-hunter', 'first-bite'], 'Pixel', achievementToastText)
    expect(items.filter(t => t.kind === 'achievement')).toEqual([{ kind: 'achievement', text: 'Pixel unlocked 2 achievements', ids: ['first-bite', 'bug-hunter'], me: 'Pixel' }])
    expect(items).toHaveLength(2)
  })
  it('reads a stored queue leniently', () => {
    expect(parseToastQueue([{ kind: 'wave', text: 'a' }, { kind: 'bogus', text: 'b' }, { kind: 'note', text: '' }, 3, null, { kind: 'note' }])).toEqual([{ kind: 'wave', text: 'a' }])
    expect(parseToastQueue('x')).toEqual([])
  })
})
