import { expect, test } from 'claude-code/testing'

import { answer, bash, end, harness, hatchedStore, nibbl, START, start, TOKEN_A } from './harness.ts'

test('turns queue with optimistic xp, a session end sends them, and only a 200 clears them', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  await answer($)
  await answer($)
  await h.clock.settle()
  expect(h.syncs()).toHaveLength(0)
  let stats = await nibbl($)
  expect(stats).toMatch(/lvl 1, 6 xp/)
  expect(stats).toMatch(/sync: 2 events waiting, last sync 2026-10-02 09:00 UTC/)

  await end($)
  expect(h.syncs()).toHaveLength(1)
  const sent = h.syncs()[0]!
  expect(sent.url).toBe('https://getnibbl.pages.dev/api/sync')
  expect(sent.headers['content-type']).toBe('application/json')
  expect(sent.body).toEqual({ serial: 42, token: TOKEN_A, events: [{ type: 'turn', at: START }, { type: 'turn', at: START }] })
  stats = await nibbl($)
  expect(stats).toMatch(/lvl 1, 6 xp/)
  expect(stats).toMatch(/sync: 0 events waiting/)
})

test('a level-up toasts once', async ($, on) => {
  const h = harness(on, { store: hatchedStore({ xp: 9 }), pet: { xp: 9 } })
  await start($)
  await answer($)
  await end($)
  expect(h.toasts.filter(t => t === 'Nibbl reached level 2!')).toHaveLength(1)
})

test('offline keeps every event and backs off a minute before trying again', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  await answer($)
  h.respondOnce('/api/sync', 'offline')
  await end($)
  expect(h.syncs()).toHaveLength(1)
  expect(await nibbl($)).toMatch(/1 event waiting/)
  await end($)
  expect(h.syncs()).toHaveLength(1)
  await h.clock.advance(61_000)
  await end($)
  expect(h.syncs()).toHaveLength(2)
  expect(await nibbl($)).toMatch(/0 events waiting/)
})

test('409, 429 and an HTML 502 each wait the right time, and nothing is lost', { timeoutMs: 20_000 }, async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  await answer($)
  h.respondOnce('/api/sync', { status: 409, body: { error: 'sync_conflict' } })
  await end($)
  await h.clock.advance(29_000)
  await end($)
  expect(h.syncs()).toHaveLength(1)
  await h.clock.advance(2_000)
  h.respondOnce('/api/sync', { status: 429, body: { error: 'sync_too_soon', retryAt: START + 41_000 } })
  await end($)
  expect(h.syncs()).toHaveLength(2)
  await h.clock.advance(5_000)
  await end($)
  expect(h.syncs()).toHaveLength(2)
  await h.clock.advance(6_000)
  h.respondOnce('/api/sync', { status: 502, text: '<html><body>error code: 1027</body></html>' })
  await end($)
  expect(h.syncs()).toHaveLength(3)
  expect(await nibbl($)).toMatch(/1 event waiting/)
  await h.clock.advance(61_000)
  await end($)
  expect(h.syncs()).toHaveLength(4)
  expect(h.syncs().every(c => (c.body.events as unknown[]).length === 1)).toBe(true)
  expect(await nibbl($)).toMatch(/0 events waiting/)
})

test('the offline queue keeps the newest 1000 events', { timeoutMs: 20_000 }, async ($, on) => {
  const events = Array.from({ length: 999 }, (_, i) => ({ type: 'error', at: START - 999_000 + i * 1_000, n: i + 1, g: 0 }))
  const h = harness(on, { store: { ...hatchedStore(), 'v1.q.sess-a': { beat: START, next: 1000, events } } })
  h.net.offline = true
  await start($)
  for (let i = 0; i < 6; i++) {
    await answer($)
    await h.clock.settle()
  }
  expect(await nibbl($)).toMatch(/sync: 1000 events waiting/)
  h.net.offline = false
  await h.clock.advance(61_000)
  await end($)
  const sent = h.syncs().at(-1)!.body.events as { type: string; at: number }[]
  expect(sent).toHaveLength(1000)
  expect(sent[0]).toEqual({ type: 'error', at: START - 994_000 })
  expect(sent.slice(-6).map(e => e.type)).toEqual(['turn', 'turn', 'turn', 'turn', 'turn', 'turn'])
  expect(await nibbl($)).toMatch(/0 events waiting/)
})

test('payloads carry only types and times, never commands, paths, prompts or outputs', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  await bash($, 'pnpm vitest run /Users/me/secret-project')
  await bash($, 'git commit -m "secret message"')
  await bash($, 'cat test.txt')
  await bash($, 'ls build/')
  await bash($, 'git log --grep commit')
  await bash($, 'npm run fail')
  await answer($)
  await end($)
  const sent = h.syncs()[0]!
  expect(sent.raw).not.toMatch(/secret|Users|vitest|message|test\.txt|build|grep|fail|boom|done/)
  const events = sent.body.events as Record<string, unknown>[]
  for (const e of events) expect(Object.keys(e).sort()).toEqual(['at', 'type'])
  expect(events.map(e => e.type)).toEqual(['check_pass', 'commit', 'error', 'turn'])
  expect(Object.keys(sent.body).sort()).toEqual(['events', 'serial', 'token'])
})

test('two sessions on one machine: a live lease blocks, each sends only its own queue, orphans ride along', { timeoutMs: 30_000 }, async ($, on) => {
  const other = { beat: START, next: 3, events: [{ type: 'turn', at: START - 2_000, n: 1, g: 3 }, { type: 'turn', at: START - 1_000, n: 2, g: 3 }] }
  const h = harness(on, { store: { ...hatchedStore(), 'v1.lease': { owner: 'sess-b', until: START + 60_000 }, 'v1.q.sess-b': other } })
  await start($)
  await answer($)
  await end($)
  expect(h.syncs()).toHaveLength(0)
  await h.clock.advance(61_000)
  await end($)
  expect(h.syncs()).toHaveLength(1)
  expect(h.syncs()[0]!.body.events).toEqual([{ type: 'turn', at: START }])
  // sess-b stops beating; 15 minutes later its queue is an orphan and goes with ours.
  await h.clock.advance(15 * 60_000)
  await answer($)
  await end($)
  expect(h.syncs()).toHaveLength(2)
  expect((h.syncs()[1]!.body.events as { at: number }[]).map(e => e.at)).toEqual([START - 2_000, START - 1_000, START + 61_000 + 15 * 60_000])
  expect(await nibbl($)).toMatch(/0 events waiting/)
})

test('a sync is due after 2.5 h of activity', async ($, on) => {
  const h = harness(on, { store: hatchedStore({ lastSyncAt: START - 150 * 60_000 }) })
  await start($)
  await answer($)
  await h.clock.settle()
  expect(h.syncs()).toHaveLength(1)
})

test('/nibbl hide toggles, persists and queues one hide event', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  expect(await nibbl($, 'hide')).toMatch(/hidden/)
  expect(await nibbl($, 'hide')).toBe('Nibbl is back.')
  await end($)
  expect(h.syncs()[0]!.body.events).toEqual([{ type: 'hide', at: START }])
})

test('the apiBase option points the mod at another server', { options: { apiBase: 'https://staging.example.dev' } }, async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  await answer($)
  await end($)
  expect(h.syncs()[0]!.url).toBe('https://staging.example.dev/api/sync')
})

test('NIBBL_API wins over the option, for pnpm -C apps/api dev', { options: { apiBase: 'https://staging.example.dev' } }, async ($, on) => {
  const h = harness(on, { store: hatchedStore(), env: { NIBBL_API: 'http://localhost:8787' } })
  await start($)
  await answer($)
  await end($)
  expect(h.syncs()[0]!.url).toBe('http://localhost:8787/api/sync')
})

test('/nibbl odds and unknown verbs', async ($, on) => {
  harness(on, { store: hatchedStore() })
  await start($)
  const odds = await nibbl($, 'odds')
  expect(odds).toContain('common 40% · uncommon 30% · rare 18% · epic 9% · legendary 3%')
  expect(odds).toMatch(/rarest: .+% odds/)
  expect(await nibbl($, 'dance')).toMatch(/\/nibbl hide/)
})
