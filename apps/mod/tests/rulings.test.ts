// Behaviour the controller ruled on for Task 6, beyond the plan's sync tests.
import { expect, mock, test } from 'claude-code/testing'

import { answer, bash, end, harness, hatchedStore, nibbl, start, START, subagentAnswer, TOKEN_A, turnStart } from './harness.ts'

type Raise = { tool: { call: (e: unknown) => Promise<unknown> }; session: { start: (e: unknown) => Promise<unknown> } }

test('subagent turns and tool calls feed nothing', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  await turnStart($)
  await subagentAnswer($)
  await ($ as unknown as Raise).tool.call({ tool: 'Bash', command: 'npm run fail', agentId: 'sub-1' })
  await ($ as unknown as Raise).tool.call({ tool: 'Bash', command: 'git commit -m x', agentId: 'sub-1' })
  expect(await nibbl($)).toMatch(/sync: 0 events waiting/)
  await end($)
  expect(h.syncs()).toHaveLength(0)
})

test('a 401 keeps every event and backs off; the token never reaches a toast or command text', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  await answer($)
  h.respondOnce('/api/sync', { status: 401, body: { error: 'unauthorized' } })
  await end($)
  expect(h.syncs()).toHaveLength(1)
  const stats = await nibbl($)
  expect(stats).toMatch(/1 event waiting/)
  expect(stats).not.toContain(TOKEN_A)
  expect(h.toasts.join('\n')).not.toContain(TOKEN_A)
  await end($)
  expect(h.syncs()).toHaveLength(1)
  await h.clock.advance(61_000)
  await end($)
  expect(h.syncs()).toHaveLength(2)
  expect(await nibbl($)).toMatch(/0 events waiting/)
})

test('a 413 keeps the newest 500 events and backs off', { timeoutMs: 20_000 }, async ($, on) => {
  const events = Array.from({ length: 800 }, (_, i) => ({ type: 'error', at: START - 800_000 + i * 1_000, n: i + 1, g: 0 }))
  const h = harness(on, { store: { ...hatchedStore(), 'v1.q.sess-a': { beat: START, next: 801, events } } })
  await start($)
  h.respondOnce('/api/sync', { status: 413, body: { error: 'payload_too_large' } })
  await end($)
  expect(h.syncs()).toHaveLength(1)
  expect(await nibbl($)).toMatch(/500 events waiting/)
  await h.clock.advance(61_000)
  await end($)
  const sent = h.syncs().at(-1)!.body.events as { at: number }[]
  expect(sent).toHaveLength(500)
  expect(sent[0]!.at).toBe(START - 500_000)
})

test('a 503 with a JSON body backs off without losing events', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  await answer($)
  h.respondOnce('/api/sync', { status: 503, body: { error: 'unavailable' } })
  await end($)
  expect(await nibbl($)).toMatch(/1 event waiting/)
  await h.clock.advance(30_000)
  await end($)
  expect(h.syncs()).toHaveLength(1)
})

// Its own small world instead of harness(): the engine allows one store.set hook per test.
test('an idle live session keeps beating, so its queue is never adopted as an orphan', { timeoutMs: 20_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const data: Record<string, unknown> = { ...hatchedStore() }
  const beats: number[] = []
  on('store.get', ($, e) => ({ value: data[e.key] }))
  on('store.set', ($, e) => {
    data[e.key] = e.value
    const v = e.value as { beat?: unknown }
    if (e.key === 'v1.q.sess-a' && typeof v.beat === 'number') beats.push(v.beat)
    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    delete data[e.key]
    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(data) }))
  on('session.id', () => ({ value: 'sess-a' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'nibbl' } }))
  on('tool.call', () => ({ result: 'boom', text: 'boom', isError: true as const }))
  await start($)
  await bash($, 'npm run fail')
  await clock.advance(20 * 60_000)
  const q = data['v1.q.sess-a'] as { beat: number; events: unknown[] }
  // The error still waits (no sync ran), yet the heartbeat is fresh: no other session may adopt it.
  expect(q.events).toHaveLength(1)
  expect(START + 20 * 60_000 - q.beat).toBeLessThan(15 * 60_000)
  expect(beats.length).toBeGreaterThan(2)
})

test('a rejected /nibbl registration is retried at the next start', async ($, on) => {
  harness(on, { store: hatchedStore() })
  let tries = 0
  on('command.register', () => {
    tries++
    return tries === 1 ? { deny: 'not yet' } : { value: { command: 'nibbl' } }
  })
  await start($)
  expect(tries).toBe(1)
  await ($ as unknown as Raise).session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  expect(tries).toBe(2)
  await turnStart($)
  expect(tries).toBe(2)
})
