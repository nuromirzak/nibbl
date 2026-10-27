import { expect, test } from 'claude-code/testing'

import { BAND, MACHINE_HASH, TOKEN_A, answer, end, harness, hatchedStore, nibbl, start } from './harness.ts'

const named = (over: Record<string, unknown> = {}) => hatchedStore({ name: 'Pixel', ...over })
const LOOK = { seed: 777, tier: 'epic', shiny: false, level: 12 }
const CODE = 'ABCDE-FGHJK'

// One sync and the answered turn after it (a queued visit starts on that answered turn).
const syncThenAnswer = async ($: Parameters<typeof answer>[0], h: ReturnType<typeof harness>) => {
  await h.clock.advance(61_000)
  await answer($)
  await end($)
}

test('a wave with a look makes no toast; the visit starts on the next answered turn and ends after 90 s', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = { waves: [{ from: 14, name: 'Ziutek', ...LOOK }] }
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  const calm = String((await ui.find({ type: 'Raster' }))?.props.cells)
  await answer($)
  await end($)
  expect(h.toasts.filter(t => /waved at/.test(t))).toEqual([])
  expect(await nibbl($)).toContain('last wave: Ziutek #000014 waved at you')
  // Synced, but no answered turn yet: nobody visits.
  await h.clock.advance(5_000)
  expect(await ui.find({ type: 'Text', text: 'sunbathing' })).toBeDefined()

  await answer($)
  expect(h.toasts.filter(t => /waved at/.test(t))).toEqual([])
  await h.clock.advance(600)
  expect(await ui.find({ type: 'Text', text: 'loved that' })).toBeDefined() // the heart at the start
  await h.clock.advance(2_000)
  expect(await ui.find({ type: 'Text', text: 'Ziutek came to say hi ♥' })).toBeDefined()
  // The owner steps aside and the friend stands in the scene.
  expect(String((await ui.find({ type: 'Raster' }))?.props.cells)).not.toBe(calm)
  await h.clock.advance(60_000)
  expect(await ui.find({ type: 'Text', text: 'Ziutek came to say hi ♥' })).toBeDefined()
  await h.clock.advance(28_000)
  expect(await ui.find({ type: 'Text', text: 'sunbathing' })).toBeDefined()
  await ui.unmount()
})

test('the guest queue keeps 5, drops the oldest, and starts one visit at a time', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  const wave = (n: number) => ({ from: 100 + n, name: `G${n}`, ...LOOK, seed: LOOK.seed + n })
  h.server.syncExtra = { waves: [1, 2, 3, 4, 5].map(wave) }
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  await answer($)
  await end($) // syncs G1..G5
  h.server.syncExtra = { waves: [6, 7].map(wave) }
  await syncThenAnswer($, h) // this answered turn starts G1; its sync adds G6 and G7, so G2 is dropped
  await h.clock.advance(2_500)
  expect(await ui.find({ type: 'Text', text: 'G1 came to say hi ♥' })).toBeDefined()
  // A visit is running: more answered turns start nothing new.
  await answer($)
  await h.clock.advance(10_000)
  expect(await ui.find({ type: 'Text', text: 'G1 came to say hi ♥' })).toBeDefined()
  const seen: string[] = ['G1']
  for (let i = 0; i < 5; i++) {
    await h.clock.advance(91_000)
    await answer($)
    await h.clock.advance(2_500)
    for (const g of [1, 2, 3, 4, 5, 6, 7]) if (await ui.find({ type: 'Text', text: `G${g} came to say hi ♥` })) seen.push(`G${g}`)
  }
  expect(seen).toEqual(['G1', 'G3', 'G4', 'G5', 'G6', 'G7'])
  await h.clock.advance(91_000)
  await answer($)
  await h.clock.advance(2_500)
  expect(await ui.find({ type: 'Text', text: /came to say hi/ })).toBeUndefined()
  await ui.unmount()
})

test('a wave without a look keeps the toast, and so does one with a malformed look', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = {
    waves: [
      { from: 14, name: 'Ziutek' },
      { from: 15, name: 'Bad', seed: 'x', tier: 'mythic', shiny: 'no', level: 0 },
    ],
  }
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  await answer($)
  await end($)
  await answer($)
  expect(h.toasts.filter(t => /waved at/.test(t))).toEqual(['2 nibbls waved at Pixel ♥'])
  await h.clock.advance(3_000)
  expect(await ui.find({ type: 'Text', text: /came to say hi/ })).toBeUndefined()
  await ui.unmount()
})

test('a mixed sync toasts the waves without a look and visits for the rest', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = { waves: [{ from: 14, name: 'Ziutek' }, { from: 15, name: null, ...LOOK }] }
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  await answer($)
  await end($)
  await answer($)
  expect(h.toasts.filter(t => /waved at/.test(t))).toEqual(['Ziutek #000014 waved at Pixel ♥'])
  await h.clock.advance(2_500)
  expect(await ui.find({ type: 'Text', text: '#000015 came to say hi ♥' })).toBeDefined()
  await ui.unmount()
})

test('/nibbl and the band say how many nibbls are coding today', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = { active: 12 }
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await nibbl($)).not.toContain('coding today')
  await answer($)
  await end($)
  expect(await nibbl($)).toContain('12 nibbls coding today')
  const texts: string[] = []
  for (let i = 0; i < 4; i++) {
    await h.clock.advance(15_000)
    texts.push((await ui.find({ type: 'Text', text: '12 nibbls coding today' })) ? 'active' : (await ui.find({ type: 'Text', text: 'sunbathing' })) ? 'time' : 'other')
  }
  expect(texts.filter(t => t === 'other')).toEqual([])
  expect(new Set(texts)).toEqual(new Set(['active', 'time']))
  expect(texts[0]).not.toBe(texts[1])
  expect(texts[1]).not.toBe(texts[2])
  await ui.unmount()
})

test('one nibbl coding is not shown in the band, and a bad active is ignored', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = { active: 1 }
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  await answer($)
  await end($)
  for (let i = 0; i < 3; i++) {
    await h.clock.advance(15_000)
    expect(await ui.find({ type: 'Text', text: 'sunbathing' })).toBeDefined()
  }
  expect(await nibbl($)).toContain('1 nibbl coding today')
  await ui.unmount()
})

test('a malformed active is ignored', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = { active: -3 }
  await start($)
  await answer($)
  await end($)
  expect(await nibbl($)).not.toContain('coding today')
})

test('/nibbl badge prints the README markdown with no network call', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  const before = h.calls.length
  expect(await nibbl($, 'badge')).toBe(
    '[![nibbl](https://getnibbl.pages.dev/p/000042/badge.svg)](https://getnibbl.pages.dev/p/000042)\nPaste it into your GitHub profile README (the repo named after your username).',
  )
  expect(h.calls.length).toBe(before)
  expect((await nibbl($, 'share')).split('\n').at(-1)).toBe('Profile badge: /nibbl badge')
})

test('/nibbl badge on an egg', async ($, on) => {
  harness(on)
  await start($)
  expect(await nibbl($, 'badge')).toBe('Hatch the egg first.')
})

test('/nibbl egg lists a ready, a locked and a hatched egg', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  h.server.gift = { eggs: [{ milestone: 10, status: 'ready', code: 'ABCDEFGHJK' }, { milestone: 25, status: 'locked' }] }
  expect(await nibbl($, 'egg')).toBe(
    [
      'Egg 1 (level 10): ABCDE-FGHJK ready, give it to a friend',
      'Egg 2 (level 25): locked until level 25',
      'Your friend installs nibbl, then runs /nibbl egg ABCDE-FGHJK before their egg hatches.',
      '  /plugin marketplace add https://getnibbl.pages.dev/marketplace.json',
      '  /plugin install nibbl@nibbl',
    ].join('\n'),
  )
  const post = h.calls.filter(c => c.path === '/api/gift').at(-1)!
  expect(post.body).toEqual({ serial: 42, token: TOKEN_A })
  h.server.gift = { eggs: [{ milestone: 10, status: 'hatched', by: { serial: 31, name: 'Ziutek' } }, { milestone: 25, status: 'locked' }] }
  expect(await nibbl($, 'egg')).toBe('Egg 1 (level 10): hatched as Ziutek #000031\nEgg 2 (level 25): locked until level 25')
  h.server.gift = { eggs: [{ milestone: 10, status: 'hatched', by: { serial: 31, name: null } }, { milestone: 25, status: 'ready', code: 'zzzzz-99999' }] }
  const text = await nibbl($, 'egg')
  expect(text).toContain('Egg 1 (level 10): hatched as #000031')
  expect(text).toContain('Egg 2 (level 25): ZZZZZ-99999 ready, give it to a friend')
  expect(text).toContain('runs /nibbl egg ZZZZZ-99999 before')
})

test('/nibbl egg offline, hidden, a 401 retried once, and junk answers', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  h.net.offline = true
  expect(await nibbl($, 'egg')).toBe('Could not reach the nibbl server. Try again later.')
  h.net.offline = false
  expect(await nibbl($, 'egg')).toBe('Your nibbl is hidden from the board, so it cannot lay gift eggs.')
  h.server.gift = { eggs: [{ milestone: 10, status: 'locked' }, { milestone: 25, status: 'locked' }] }
  h.respondOnce('/api/gift', { status: 401, body: { error: 'unauthorized' } })
  const gifts = h.calls.filter(c => c.path === '/api/gift').length
  expect(await nibbl($, 'egg')).toBe('Egg 1 (level 10): locked until level 10\nEgg 2 (level 25): locked until level 25')
  expect(h.calls.filter(c => c.path === '/api/gift').length - gifts).toBe(2)
  expect(h.hatches()).toHaveLength(1)
  h.respondOnce('/api/gift', { status: 401, body: { error: 'unauthorized' } })
  h.respondOnce('/api/gift', { status: 401, body: { error: 'unauthorized' } })
  expect(await nibbl($, 'egg')).toBe("Could not reach your pet's account. Try /nibbl egg again later.")
  h.respondOnce('/api/gift', { status: 200, body: { eggs: 'many' } })
  expect(await nibbl($, 'egg')).toBe('The server answered something unexpected. Try again later.')
  h.respondOnce('/api/gift', { status: 500, body: { error: 'boom' } })
  expect(await nibbl($, 'egg')).toBe('The server answered boom. Try again later.')
})

test('a gift code typed on an egg rides on the egg hatch once, and is forgotten', async ($, on) => {
  const h = harness(on)
  await start($)
  expect(await nibbl($, 'egg')).toMatch(/^Gift eggs: a nibbl lays an egg for a friend at level 10/)
  expect(await nibbl($, 'egg nope')).toBe('Usage: /nibbl egg <code>, for example /nibbl egg ABCDE-FGHJK. Run it before your egg hatches.')
  expect(await nibbl($, 'egg abcde fghjk')).toBe('Saved. When your egg hatches it becomes the child of that nibbl and inherits its mark when it can.')
  expect(h.data['v1.giftCode']).toBe('ABCDEFGHJK')
  for (let i = 0; i < 10; i++) await answer($)
  await h.clock.advance(5_000)
  await h.clock.settle()
  expect(h.hatches()).toHaveLength(1)
  expect(h.hatches()[0]!.body).toEqual({ machineHash: MACHINE_HASH, gift: 'ABCDEFGHJK' })
  expect(h.data['v1.giftCode']).toBeUndefined()
  expect(await nibbl($, `egg ${CODE}`)).toBe('Gift eggs work only before your egg hatches.')
})

test('a stale gift code never rides on a re-authentication hatch, and an import forgets it', async ($, on) => {
  const h = harness(on, { store: { ...hatchedStore({ token: 'Z'.repeat(43) }), 'v1.giftCode': 'ABCDEFGHJK' } })
  await start($)
  await answer($)
  await end($)
  expect(h.hatches()[0]!.body).toEqual({ machineHash: MACHINE_HASH })
})

test('an import forgets a waiting gift code', async ($, on) => {
  const h = harness(on, { store: { ...hatchedStore(), 'v1.giftCode': 'ABCDEFGHJK' } })
  await start($)
  expect(await nibbl($, `import nibbl1:99:${'C'.repeat(43)} replace`)).toMatch(/now lives on this machine/)
  expect(h.data['v1.giftCode']).toBeUndefined()
})

test('/nibbl invite is an alias: no argument and a code go to the egg paths, a serial stays legacy', async ($, on) => {
  const h = harness(on)
  await start($)
  expect(await nibbl($, 'invite')).toMatch(/^Gift eggs: /)
  expect(await nibbl($, `invite ${CODE}`)).toMatch(/^Saved\. When your egg hatches/)
  expect(h.data['v1.giftCode']).toBe('ABCDEFGHJK')
  expect(await nibbl($, 'invite 19')).toBe('Saved. If #000019 exists, your nibbls become Friends when your egg hatches.')
  expect(await nibbl($, 'invite nope')).toMatch(/^Usage: \/nibbl invite <serial>/)
  for (let i = 0; i < 10; i++) await answer($)
  await h.clock.advance(5_000)
  await h.clock.settle()
  expect(h.hatches()[0]!.body).toEqual({ machineHash: MACHINE_HASH, invite: 19, gift: 'ABCDEFGHJK' })
  expect(await nibbl($, `invite ${CODE}`)).toBe('Gift eggs work only before your egg hatches.')
  expect(await nibbl($, 'invite 19')).toBe('Invites work only before your egg hatches.')
})

test('a gift egg that hatched at a friend toasts with the mark, or without it', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = { invites: [{ serial: 31, name: 'Ziutek', gift: true, mark: { motif: 'star', spot: 'cheek' } }] }
  await start($)
  await answer($)
  await end($)
  await answer($)
  expect(h.toasts).toContain("Your egg hatched at a friend's: Ziutek #000031 has your mark ♥")
  h.server.syncExtra = { invites: [{ serial: 32, name: null, gift: true }] }
  await syncThenAnswer($, h)
  await answer($)
  expect(h.toasts).toContain("Your egg hatched at a friend's: #000032 is your nibbl's child ♥")
  h.server.syncExtra = { invites: [{ serial: 33, name: null }] }
  await syncThenAnswer($, h)
  await answer($)
  expect(h.toasts).toContain("Your friend's nibbl #000033 hatched. You are Friends now ♥")
})
