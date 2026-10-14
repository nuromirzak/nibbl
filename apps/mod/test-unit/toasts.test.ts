import { describe, expect, it } from 'vitest'

import { TOAST_PRIORITY, nextIndex, parseToastQueue, withToast, type QueuedToast } from '../src/toasts'

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
  it('reads a stored queue leniently', () => {
    expect(parseToastQueue([{ kind: 'wave', text: 'a' }, { kind: 'bogus', text: 'b' }, { kind: 'note', text: '' }, 3, null, { kind: 'note' }])).toEqual([{ kind: 'wave', text: 'a' }])
    expect(parseToastQueue('x')).toEqual([])
  })
})
