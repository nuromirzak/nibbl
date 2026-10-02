import { expect, test } from 'claude-code/testing'

import { answer, end, harness, hatchedStore, LINUX_HASH, MACHINE_HASH, nibbl, START, start, subagentAnswer, TOKEN_A, WINDOWS_HASH } from './harness.ts'

// What the local-only spike left in the owner's store (Byte, before decision 0015 bound it to #13).
const SPIKE_STORE = {
  pet: { seed: 4125214855, tier: 'common', shiny: false, hatchedAt: START - 86_400_000, xp: 290, name: 'Byte' },
  eggTurns: 0,
  windows: { '491': { turn: 3 } },
  lastScoredAt: START - 1_000,
  mode: 'raster',
}
const BYTE = { serial: 13, seed: 4125214855, tier: 'common', genesis: true, hatchedAt: START - 86_400_000, name: 'Byte', xp: 290, level: 8 }

test('the egg hatches after 10 answered main-loop turns; subagent turns do not count', async ($, on) => {
  const h = harness(on)
  await start($)
  expect(await nibbl($)).toBe('Egg: 0/10 answered turns. It hatches after 10.')
  for (let i = 0; i < 9; i++) await answer($)
  await subagentAnswer($)
  expect(await nibbl($)).toBe('Egg: 9/10 answered turns. It hatches after 10.')
  expect(h.hatches()).toHaveLength(0)
  await answer($)
  await h.clock.advance(1_500)
  expect(h.hatches()).toHaveLength(1)
  const call = h.hatches()[0]!
  expect(call.url).toBe('https://getnibbl.pages.dev/api/hatch')
  expect(call.headers['content-type']).toBe('application/json')
  expect(call.body).toEqual({ machineHash: MACHINE_HASH })
  expect(h.toasts.some(t => /^Nibbl hatched! #000042 · rare · Genesis · rarest: .+ [\d.]+% odds$/.test(t))).toBe(true)
  const stats = await nibbl($)
  expect(stats).toMatch(/^Nibbl #000042\n/)
  expect(stats).toContain('card: https://getnibbl.pages.dev/p/42')
  expect(stats).toContain('leaderboard: https://getnibbl.pages.dev/leaderboard/?me=42')
  // Nothing was queued before the hatch, so there is nothing to sync yet.
  expect(h.syncs()).toHaveLength(0)
})

for (const [machine, hash] of [['linux', LINUX_HASH], ['windows', WINDOWS_HASH]] as const) {
  test(`the machine hash uses the ${machine} machine id`, async ($, on) => {
    const h = harness(on, { machine })
    await start($)
    for (let i = 0; i < 10; i++) await answer($)
    await h.clock.advance(1_500)
    expect(h.hatches()[0]!.body).toEqual({ machineHash: hash })
  })
}

test('with no platform id, a fresh egg hatches under a stored install id, which also re-authenticates that pet', { timeoutMs: 20_000 }, async ($, on) => {
  const h = harness(on, { machine: 'none' })
  await start($)
  for (let i = 0; i < 10; i++) await answer($)
  await h.clock.advance(1_500)
  expect(await nibbl($)).toMatch(/^Nibbl #000042\n/)
  h.server.token = 'D'.repeat(43)
  await answer($)
  await end($)
  const [first, second] = h.hatches()
  expect(first!.body.machineHash).toMatch(/^[0-9a-f]{64}$/)
  expect(first!.body.machineHash).not.toBe(MACHINE_HASH)
  expect(second!.body.machineHash).toBe(first!.body.machineHash)
  expect(await nibbl($)).toMatch(/0 events waiting/)
})

test('the first platform hash is cached and reused when ioreg fails later', { timeoutMs: 20_000 }, async ($, on) => {
  const h = harness(on)
  await start($)
  for (let i = 0; i < 10; i++) await answer($)
  await h.clock.advance(1_500)
  expect(h.hatches()).toHaveLength(1)
  h.host.machine = 'none'
  h.server.token = 'D'.repeat(43)
  await answer($)
  await end($)
  expect(h.hatches()).toHaveLength(2)
  expect(h.hatches()[1]!.body).toEqual({ machineHash: MACHINE_HASH })
  expect(await nibbl($)).toMatch(/0 events waiting/)
})

test('with no platform id, the spike pet is never adopted under a random install id', { timeoutMs: 20_000 }, async ($, on) => {
  const h = harness(on, { machine: 'none', store: SPIKE_STORE, pet: BYTE })
  await start($)
  await h.clock.settle()
  await answer($)
  await h.clock.settle()
  await h.clock.advance(61_000)
  await answer($)
  await h.clock.settle()
  expect(h.hatches()).toHaveLength(0)
  expect(h.toasts).toEqual([])
  const stats = await nibbl($)
  expect(stats).toMatch(/^Byte · syncing\n/)
  expect(stats).toMatch(/296 xp/)
})

test('with no platform id, a 401 never re-hatches a platform-bound pet under an install id', async ($, on) => {
  const h = harness(on, { machine: 'none', store: hatchedStore({ token: 'Z'.repeat(43) }), pet: { serial: 77 } })
  await start($)
  await answer($)
  await end($)
  expect(h.calls.map(c => c.path)).toEqual(['/api/sync'])
  expect(h.toasts.some(t => /another machine/.test(t))).toBe(false)
  const stats = await nibbl($)
  expect(stats).toMatch(/^Nibbl #000042\n/)
  expect(stats).toMatch(/1 event waiting/)
})

test("the spike's pet keeps living offline and is adopted from the server once it answers", { timeoutMs: 20_000 }, async ($, on) => {
  const h = harness(on, { store: SPIKE_STORE, pet: BYTE })
  h.net.offline = true
  await start($)
  await h.clock.settle()
  expect(h.hatches()).toHaveLength(1)
  let stats = await nibbl($)
  expect(stats).toMatch(/^Byte · syncing\n/)
  expect(stats).toMatch(/290 xp/)
  await answer($)
  await h.clock.settle()
  expect(await nibbl($)).toMatch(/293 xp/)

  h.net.offline = false
  await h.clock.advance(61_000)
  await answer($)
  await h.clock.settle()
  expect(h.hatches()).toHaveLength(2)
  expect(h.hatches().every(c => c.body.machineHash === MACHINE_HASH)).toBe(true)
  expect(h.toasts).toContain('Byte is now #000013, synced with the nibbl server.')
  await end($)
  expect(h.syncs().flatMap(c => (c.body.events as { type: string }[]).map(e => e.type))).toEqual(['turn', 'turn'])
  stats = await nibbl($)
  expect(stats).toMatch(/^Byte #000013\n/)
  expect(stats).toMatch(/296 xp/)
  expect(stats).toMatch(/0 events waiting/)
})

test('a 401 on sync re-hatches by machineHash, takes the new token and resends once', async ($, on) => {
  const h = harness(on, { store: hatchedStore({ token: 'Z'.repeat(43) }) })
  await start($)
  await answer($)
  await end($)
  expect(h.calls.map(c => c.path)).toEqual(['/api/sync', '/api/hatch', '/api/sync'])
  expect(h.calls[1]!.body).toEqual({ machineHash: MACHINE_HASH })
  expect(h.calls[2]!.body.token).toBe(TOKEN_A)
  expect(h.toasts).toEqual([])
  expect(await nibbl($)).toMatch(/0 events waiting/)
})

test('a pet that moved to another machine leaves a fresh egg here', async ($, on) => {
  const h = harness(on, { store: hatchedStore({ token: 'Z'.repeat(43) }), pet: { serial: 77 } })
  await start($)
  await answer($)
  await end($)
  expect(h.calls.map(c => c.path)).toEqual(['/api/sync', '/api/hatch'])
  expect(h.toasts).toContain('Nibbl #000042 now lives on another machine. A new egg appeared here.')
  expect(await nibbl($)).toBe('Egg: 0/10 answered turns. It hatches after 10.')
})

test('a hatch rate limit keeps the egg and retries after retryAt', { timeoutMs: 20_000 }, async ($, on) => {
  const h = harness(on)
  await start($)
  h.respondOnce('/api/hatch', { status: 429, body: { error: 'hatch_rate_limited', retryAt: START + 120_000 } })
  for (let i = 0; i < 10; i++) await answer($)
  await h.clock.advance(1_500)
  expect(h.hatches()).toHaveLength(1)
  expect(h.toasts).toEqual([])
  await answer($)
  await h.clock.advance(1_500)
  expect(h.hatches()).toHaveLength(1)
  expect(await nibbl($)).toBe('Egg: 10/10 answered turns. It hatches after 10.')
  await h.clock.advance(120_000)
  await answer($)
  await h.clock.advance(1_500)
  expect(h.hatches()).toHaveLength(2)
  expect(await nibbl($)).toMatch(/^Nibbl #000042/)
})

test('corrupt store values fall back to an egg and re-hatch', async ($, on) => {
  const h = harness(on, { store: { 'v1.pet': { serial: 'x', token: 1 }, 'v1.q.sess-a': 'junk', 'v1.egg': 'NaN', 'v1.syncWait': 'later' } })
  await start($)
  expect(await nibbl($)).toBe('Egg: 0/10 answered turns. It hatches after 10.')
  for (let i = 0; i < 10; i++) await answer($)
  await h.clock.advance(1_500)
  expect(h.hatches()).toHaveLength(1)
  expect(await nibbl($)).toMatch(/^Nibbl #000042/)
})
