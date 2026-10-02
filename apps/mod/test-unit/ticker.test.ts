import { describe, expect, it, vi } from 'vitest'

const CALM_R = vi.hoisted(() => ({ bugs: 0, mood: 'idle', moodUntil: 0, heartUntil: 0, lootUntil: 0, boxUntil: 0, awaySince: 0, lastActiveAt: 0 }))

vi.mock('claude-code', () => ({ read: vi.fn(async (_s: unknown, a: { k: { key: string }; v: unknown }) => (a.k.key === 'react' ? CALM_R : a.v)), update: vi.fn(), atom: (k: unknown, v: unknown) => ({ k, v }) }))

import { rt } from '../src/runtime'
import { tick } from '../src/ticker'

describe('tick', () => {
  it('asks for a redraw when the blit is denied, and forgets the band', async () => {
    const invalidate = vi.fn()
    const $ = {
      clock: { now: async () => 0 },
      session: { id: async () => 's' },
      store: { get: async () => null, set: async () => undefined, delete: async () => undefined, keys: async () => [] },
      ui: { invalidate, blit: async () => ({ deny: 'unmounted' }) },
    }
    rt.band = { requestId: 'band', sceneId: 'stale', hud: '' }
    const [hud, state] = [await import('../src/hud'), await import('../src/state')]
    rt.band.hud = hud.hudKey(hud.hudLines(state.petAtom.v as never, state.eggAtom.v as never, CALM_R as never, 0, state.tzAtom.v as never))
    await tick($ as never)
    expect(invalidate).toHaveBeenCalledWith('ui.render')
    expect(rt.band).toBeNull()
  })
})
