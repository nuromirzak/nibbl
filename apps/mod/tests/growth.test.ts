import { expect, test } from 'claude-code/testing'

import { MACHINE_HASH, TOKEN_A, answer, end, harness, hatchedStore, nibbl, start } from './harness.ts'

const NOT_SHOWN = { 'v1.greetDay': 0 }
const named = (over: Record<string, unknown> = {}) => hatchedStore({ name: 'Pixel', ...over })
const GREETING = /Pixel|green checks|tests green|Let's finish|One commit|Still up|bugs are sleeping/

test('the first answered turn of the day greets a hatched pet once', async ($, on) => {
  const h = harness(on, { store: { ...named(), ...NOT_SHOWN }, pet: { name: 'Pixel' } })
  await start($)
  await answer($)
  expect(h.toasts).toHaveLength(1)
  expect(h.toasts[0]).toMatch(GREETING)
  expect(h.toasts[0]).not.toMatch(/[{}]/)
  await answer($)
  expect(h.toasts).toHaveLength(1)
})

test('the day turns at local midnight, +05:00', async ($, on) => {
  // 23:58 local is 18:58 UTC; local midnight is 19:00 UTC
  const h = harness(on, { store: { ...named(), ...NOT_SHOWN }, pet: { name: 'Pixel' }, utcOffset: '+0500', now: Date.UTC(2026, 9, 2, 18, 58) })
  await start($)
  await answer($)
  expect(h.toasts).toHaveLength(1)
  await h.clock.advance(60_000) // 23:59 local
  await answer($)
  expect(h.toasts).toHaveLength(1)
  await h.clock.advance(2 * 60_000) // 00:01 local
  await answer($)
  expect(h.toasts).toHaveLength(2)
})

test('the day turns at local midnight, -07:00', async ($, on) => {
  // 23:58 local is 06:58 UTC the next day; local midnight is 07:00 UTC
  const h = harness(on, { store: { ...named(), ...NOT_SHOWN }, pet: { name: 'Pixel' }, utcOffset: '-0700', now: Date.UTC(2026, 9, 3, 6, 58) })
  await start($)
  await answer($)
  expect(h.toasts).toHaveLength(1)
  await h.clock.advance(60_000)
  await answer($)
  expect(h.toasts).toHaveLength(1)
  await h.clock.advance(2 * 60_000)
  await answer($)
  expect(h.toasts).toHaveLength(2)
})

test('an egg is not greeted, nor is the turn it hatches on or the rest of that day', async ($, on) => {
  const h = harness(on)
  await start($)
  for (let i = 0; i < 10; i++) await answer($)
  expect(h.toasts).toEqual([])
  await h.clock.advance(5_000)
  await h.clock.settle()
  expect(h.toasts.filter(t => /hatched!/.test(t))).toHaveLength(1)
  await answer($)
  expect(h.toasts).toHaveLength(1)
})

test('/nibbl shows the stage of a baby', async ($, on) => {
  harness(on, { store: hatchedStore(), now: Date.UTC(2026, 9, 2, 4, 0), utcOffset: '+0500' }) // 09:00 local
  await start($)
  expect(await nibbl($)).toContain('stage: baby (teen at level 10)')
})

test('reaching level 10 toasts the evolution instead of the level', async ($, on) => {
  const h = harness(on, { store: named({ xp: 922 }), pet: { name: 'Pixel', xp: 922 } })
  await start($)
  await answer($)
  expect(h.toasts).toContain('Pixel evolved into a teen! Show it off: /nibbl share')
  expect(h.toasts.filter(t => /reached level/.test(t))).toEqual([])
  expect(await nibbl($)).toContain('stage: teen (since level 10)')
})

test('/nibbl share prints the card, a ready line and an X link, with no network call', async ($, on) => {
  const h = harness(on, { store: named({ xp: 925 }), pet: { name: 'Pixel', xp: 925 } })
  await start($)
  const before = h.calls.length
  const text = await nibbl($, 'share')
  const [card, line, post] = text.split('\n')
  expect(card).toBe('card: https://getnibbl.pages.dev/p/42')
  expect(line).toBe('Meet Pixel, my nibbl #000042, a rare teen. It eats my bugs in Claude Code. https://getnibbl.pages.dev/p/42')
  expect(post!.startsWith('Post it: https://x.com/intent/post?text=')).toBe(true)
  expect(decodeURIComponent(post!.split('text=')[1]!)).toBe(line)
  expect(h.calls.length).toBe(before)
})

test('/nibbl share falls back to "my nibbl" without a name, and needs a hatched pet', async ($, on) => {
  harness(on, { store: hatchedStore() })
  await start($)
  expect((await nibbl($, 'share')).split('\n')[1]).toBe('Meet my nibbl #000042, a rare baby. It eats my bugs in Claude Code. https://getnibbl.pages.dev/p/42')
})

test('/nibbl share on an egg', async ($, on) => {
  harness(on)
  await start($)
  expect(await nibbl($, 'share')).toBe('Hatch the egg first, then share it.')
})

const PUBLIC = {
  serial: 42,
  name: null,
  level: 9,
  totals: { turns: 20, checks: 63, commits: 3, errors: 0, pets: 2, wavesSent: 0, activeDays: 2 },
  achievements: [{ id: 'first-bite', at: Date.UTC(2026, 9, 1, 12) }, { id: 'from-the-future', at: 1 }],
  invitedBy: null,
  friends: 0,
  weekWins: 0,
}

test('/nibbl achievements lists unlocked ones with UTC dates and the next three with progress', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  h.server.publicPet = PUBLIC
  await start($)
  const text = await nibbl($, 'achievements')
  expect(text).toContain('Achievements (1 of 15):')
  expect(text).toContain('First Bite - 2026-10-01 UTC')
  expect(text).not.toContain('from-the-future')
  expect(text).toMatch(/Next:\n {2}Growing Up 9\/10\n {2}Bug Hunter 63\/100\n {2}All Grown Up 9\/25$/)
  const get = h.calls.find(c => c.path === '/api/pet/42')!
  expect(get.method).toBe('GET')
  expect(get.raw).toBe('')
})

test('/nibbl achievements offline, unknown to the server, and on an egg', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  h.net.offline = true
  expect(await nibbl($, 'achievements')).toBe('Could not reach the nibbl server. Try again later.')
  h.net.offline = false
  expect(await nibbl($, 'achievements')).toBe('Your nibbl is hidden from the board, so its card is private.')
})

test('/nibbl achievements on an egg', async ($, on) => {
  harness(on)
  await start($)
  expect(await nibbl($, 'achievements')).toBe('Hatch the egg first.')
})

test('/nibbl invite on a hatched pet says how a friend joins, and refuses a serial', async ($, on) => {
  harness(on, { store: hatchedStore() })
  await start($)
  const text = await nibbl($, 'invite')
  expect(text).toContain('Ask a friend to install nibbl and run /nibbl invite 42 before their egg hatches.')
  expect(text).toContain('/plugin marketplace add https://getnibbl.pages.dev/marketplace.json')
  expect(text).toContain('/plugin install nibbl@nibbl')
  expect(await nibbl($, 'invite 19')).toBe('Invites work only before your egg hatches.')
})

test('an invite entered on an egg rides on the hatch once and is forgotten', async ($, on) => {
  const h = harness(on)
  await start($)
  expect(await nibbl($, 'invite nope')).toMatch(/^Usage: \/nibbl invite <serial>/)
  expect(await nibbl($, 'invite #19')).toBe('Saved. If #000019 exists, your nibbls become Friends when your egg hatches.')
  for (let i = 0; i < 10; i++) await answer($)
  await h.clock.advance(5_000)
  await h.clock.settle()
  expect(h.hatches()).toHaveLength(1)
  expect(h.hatches()[0]!.body).toEqual({ machineHash: MACHINE_HASH, invite: 19 })
  expect(await nibbl($, 'invite 19')).toBe('Invites work only before your egg hatches.')
})

test('a hatch without an entered invite sends none, and a re-hatch never sends one', async ($, on) => {
  const plain = harness(on)
  await start($)
  for (let i = 0; i < 10; i++) await answer($)
  await plain.clock.advance(5_000)
  await plain.clock.settle()
  expect(plain.hatches()[0]!.body).toEqual({ machineHash: MACHINE_HASH })
})

test('a stale invite code never rides on a re-authentication hatch', async ($, on) => {
  const h = harness(on, { store: { ...hatchedStore({ token: 'Z'.repeat(43) }), 'v1.inviteCode': 19 } })
  await start($)
  await answer($)
  await end($)
  expect(h.hatches()[0]!.body).toEqual({ machineHash: MACHINE_HASH })
  expect(h.syncs().at(-1)!.body.token).toBe(TOKEN_A)
})

test('week, achievement, invite and wave news show one per answered turn, most important first', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = {
    waves: [{ from: 14, name: 'Ziutek' }],
    unlocked: ['bug-hunter'],
    invites: [{ serial: 27, name: null }],
    weekWin: { week: '2026-W43', gain: 1240 },
  }
  await start($)
  await answer($)
  await end($)
  expect(h.toasts).toEqual([])
  expect(await nibbl($)).toContain('news waiting: 4')
  const shown: string[] = []
  for (let i = 0; i < 5; i++) {
    const n = h.toasts.length
    await answer($)
    const fresh = h.toasts.slice(n).filter(t => !/reached level/.test(t))
    expect(fresh.length).toBeLessThanOrEqual(1)
    shown.push(...fresh)
  }
  shown.splice(4)
  expect(shown).toEqual([
    'Pixel is the Nibbl of the Week! https://getnibbl.pages.dev/week',
    '🏆 Pixel unlocked Bug Hunter',
    "Your friend's nibbl #000027 hatched. You are Friends now ♥",
    'Ziutek #000014 waved at Pixel ♥',
  ])
  expect(await nibbl($)).not.toContain('news waiting')
})

// teen and adult are announced by the evolution toast, so they are left out of the achievement toast.
test('several unlocks and several invites are aggregated', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = { unlocked: ['bug-hunter', 'first-bite', 'teen'], invites: [{ serial: 5, name: 'A' }, { serial: 6, name: null }] }
  await start($)
  await answer($)
  await end($)
  await answer($)
  await answer($)
  expect(h.toasts).toEqual(['Pixel unlocked 2 achievements', '2 friends hatched their nibbls. You are Friends now ♥'])
})

test('malformed unlocked, invites and weekWin are ignored', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = { unlocked: ['not-an-achievement', 7], invites: [{ serial: 'x' }, 'y'], weekWin: { week: 'soon', gain: 'lots' } }
  await start($)
  await answer($)
  await end($)
  await answer($)
  await answer($)
  const news = () => h.toasts.filter(t => !/reached level|maker/.test(t))
  expect(news()).toEqual([])
  expect(await nibbl($)).not.toContain('news waiting')
  h.server.syncExtra = { unlocked: 'bug-hunter', invites: 5, weekWin: [] }
  await h.clock.advance(61_000)
  await answer($)
  await end($)
  await answer($)
  expect(news()).toEqual([])
})

test('the greeting waits behind more important news and a maker note waits behind the greeting', async ($, on) => {
  const h = harness(on, { store: { ...named(), ...NOT_SHOWN }, pet: { name: 'Pixel' } })
  h.server.syncExtra = { unlocked: ['bug-hunter'] }
  await start($)
  await answer($) // greeting shows
  expect(h.toasts).toHaveLength(1)
  await end($)
  await answer($)
  await answer($) // the third answered turn queues a note
  await answer($)
  const shown = h.toasts.filter(t => !/reached level/.test(t))
  expect(shown[1]).toBe('🏆 Pixel unlocked Bug Hunter')
  expect(shown[2]).toMatch(/^✉ from the maker: /)
})
