import { describe, expect, it, vi } from 'vitest'

vi.mock('claude-code', () => ({ atom: (k: unknown, v: unknown) => ({ k, v }) }))

import { SPIKE_KEYS } from '../src/config'
import * as state from '../src/state'

describe('session state keys', () => {
  it('are v1-prefixed, so values the spike left in session state are never read back', () => {
    const keys = Object.values(state).map(a => (a as unknown as { k: { plugin: string; key: string } }).k)
    expect(keys.length).toBeGreaterThan(0)
    for (const k of keys) {
      expect(k.plugin).toBe('nibbl')
      expect(k.key).toMatch(/^v1\./)
      expect(SPIKE_KEYS as readonly string[]).not.toContain(k.key)
    }
  })
})
