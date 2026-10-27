import { expect, test } from 'claude-code/testing'

import { answer, end, harness, hatchedStore, nibbl, START, start } from './harness.ts'

const DAY = 86_400_000
const NOTE = /^✉ from the maker: /
const noteToasts = (toasts: string[]) => toasts.filter(t => NOTE.test(t))
const named = (over: Record<string, unknown> = {}) => hatchedStore({ name: 'Pixel', ...over })

const HOURS = 3_600_000
const turns = async ($: Parameters<typeof answer>[0], n: number) => {
  for (let i = 0; i < n; i++) await answer($)
}

test('a maker note needs 3 answered turns in the session', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  await start($)
  await turns($, 2)
  expect(noteToasts(h.toasts)).toHaveLength(0)
  await turns($, 1)
  expect(noteToasts(h.toasts)).toHaveLength(1)
  expect(h.toasts.find(t => NOTE.test(t))).not.toMatch(/[{}]/)
})

test('after a note the next one waits 48 h', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  await start($)
  await turns($, 8)
  expect(noteToasts(h.toasts)).toHaveLength(1)
})

test('48 h minus an hour since the last note: no note; 48 h plus an hour: a note', async ($, on) => {
  const early = harness(on, { store: { ...named(), 'v1.noteIdx': 1, 'v1.noteAt': START - 47 * HOURS } })
  await start($)
  await turns($, 4)
  expect(noteToasts(early.toasts)).toHaveLength(0)
})

test('a note comes when the last one is over 48 h old, and the index advances', async ($, on) => {
  const h = harness(on, { store: { ...named(), 'v1.noteIdx': 1, 'v1.noteAt': START - 49 * HOURS }, pet: { name: 'Pixel' } })
  await start($)
  await turns($, 3)
  expect(noteToasts(h.toasts)).toHaveLength(1)
  expect(await nibbl($, 'notes')).toMatch(/^Notes from the maker \(2 of 19\):\n1\. .+\n2\. /)
})

test('after the 20th note nothing more arrives', async ($, on) => {
  const h = harness(on, { store: { ...named(), 'v1.noteIdx': 20, 'v1.noteAt': START - 400 * HOURS } })
  await start($)
  await turns($, 5)
  expect(noteToasts(h.toasts)).toHaveLength(0)
})

test('the last note is the 20th and is delivered last', async ($, on) => {
  const h = harness(on, { store: { ...hatchedStore({ name: null }), 'v1.noteIdx': 19, 'v1.noteAt': START - 400 * HOURS } })
  await start($)
  await turns($, 5)
  expect(noteToasts(h.toasts)).toHaveLength(1)
  expect(noteToasts(h.toasts)[0]).toMatch(/Still here\?/)
  expect(await nibbl($, 'notes')).toMatch(/\(20 of 20\)/)
})

test('the first note is always note 1', async ($, on) => {
  const h = harness(on, { store: hatchedStore({ name: null }), pet: { name: null } })
  await start($)
  await turns($, 3)
  expect(noteToasts(h.toasts)[0]).toMatch(/^✉ from the maker: Hi, I made nibbl\./)
})

test('no note on the hatch turn: 3 answered turns after the hatch, egg turns not counted', async ($, on) => {
  const h = harness(on, { store: { 'v1.noteAt': START - 400 * HOURS } })
  await start($)
  for (let i = 0; i < 10; i++) await answer($)
  await h.clock.advance(5_000)
  await h.clock.settle()
  expect(h.toasts.some(t => /hatched!/.test(t))).toBe(true)
  expect(noteToasts(h.toasts)).toHaveLength(0)
  await turns($, 2)
  expect(noteToasts(h.toasts)).toHaveLength(0)
  await turns($, 1)
  expect(noteToasts(h.toasts)).toHaveLength(1)
})

test('an egg gets no note, and a pet in a fresh session counts its own turns', async ($, on) => {
  const h = harness(on)
  await start($)
  for (let i = 0; i < 3; i++) await answer($)
  expect(noteToasts(h.toasts)).toHaveLength(0)
  expect(await nibbl($, 'notes')).toMatch(/Hatch the egg first/)
})

test('all 20 notes are distinct, with placeholders filled', async ($, on) => {
  harness(on, { store: { ...hatchedStore({ name: null }), 'v1.noteIdx': 20, 'v1.noteAt': START }, pet: { name: null } })
  await start($)
  const list = await nibbl($, 'notes')
  const lines = list.split('\n')
  expect(lines[0]).toBe('Notes from the maker (20 of 20):')
  const notes = lines.slice(1).map(l => l.replace(/^\d+\. /, ''))
  expect(notes).toHaveLength(20)
  expect(new Set(notes).size).toBe(20)
  const all = notes.join('\n')
  expect(all).not.toMatch(/[{}]/)
  expect(notes[0]).toMatch(/^Hi, I made nibbl/)
  expect(notes[19]).toMatch(/^Still here\?/)
  expect(all).toContain('#000042 is yours forever')
  expect(all).toContain('getnibbl.pages.dev/p/42.')
  expect(all).toContain('/nibbl wave <serial>')
  expect(await nibbl($)).toContain(`last note: ${notes[19]}`)
})

test('/nibbl notes lists what arrived, in order', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  await start($)
  expect(await nibbl($, 'notes')).toMatch(/^No notes yet/)
  for (let i = 0; i < 3; i++) await answer($)
  const first = h.toasts.find(t => NOTE.test(t))!.replace(NOTE, '')
  expect(await nibbl($, 'notes')).toBe(`Notes from the maker (1 of 19):\n1. ${first}`)
})

test('/nibbl wave: every outcome has its own copy', async ($, on) => {
  const h = harness(on, { store: named() })
  await start($)
  expect(await nibbl($, 'wave')).toMatch(/^Usage: \/nibbl wave <serial>/)
  expect(await nibbl($, 'wave abc')).toMatch(/^Usage/)
  expect(await nibbl($, 'wave 42')).toBe("You can't wave at yourself.")
  expect(await nibbl($, 'wave #000042')).toBe("You can't wave at yourself.")
  expect(h.calls.filter(c => c.path === '/api/wave')).toHaveLength(0)

  expect(await nibbl($, 'wave 16')).toBe('You waved at Ziutek ♥')
  expect(h.calls.find(c => c.path === '/api/wave')!.body).toEqual({ serial: 42, token: 'A'.repeat(43), to: 16 })
  expect(await nibbl($, 'wave #16')).toBe('You already waved at #000016 today.')
  expect(await nibbl($, 'wave 000019')).toBe('You waved at #000019 ♥')
  expect(await nibbl($, 'wave 77')).toBe('No nibbl #000077 to wave at.')

  h.respondOnce('/api/wave', { status: 429, body: { error: 'wave_limit', retryAt: START + DAY } })
  expect(await nibbl($, 'wave 16')).toBe("That's 10 waves today. More tomorrow.")
  h.respondOnce('/api/wave', { status: 400, body: { error: 'self_wave' } })
  expect(await nibbl($, 'wave 16')).toBe("You can't wave at yourself.")
  h.net.offline = true
  expect(await nibbl($, 'wave 16')).toBe('Could not reach the nibbl server. Try again later.')
})

test('/nibbl wave re-authenticates once on a 401', async ($, on) => {
  const h = harness(on, { store: named() })
  await start($)
  h.respondOnce('/api/wave', { status: 401, body: { error: 'unauthorized' } })
  expect(await nibbl($, 'wave 16')).toBe('You waved at Ziutek ♥')
  expect(h.hatches()).toHaveLength(1)
  expect(h.calls.filter(c => c.path === '/api/wave')).toHaveLength(2)
})

test('waves arriving with a sync make one toast and show in /nibbl', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = { waves: [{ from: 14, name: 'Ziutek' }] }
  await start($)
  await answer($)
  await end($)
  expect(await nibbl($)).toContain('last wave: Ziutek #000014 waved at you')
  await answer($) // the queued toast shows on the next answered turn
  expect(h.toasts.filter(t => /waved at/.test(t))).toEqual(['Ziutek #000014 waved at Pixel ♥'])

  h.server.syncExtra = { waves: [{ from: 15, name: null }, { from: 16, name: 'A' }, { from: 17, name: 'B' }] }
  await h.clock.advance(61_000)
  await answer($)
  await end($)
  await answer($)
  expect(h.toasts.filter(t => /waved at/.test(t))).toEqual(['Ziutek #000014 waved at Pixel ♥', '3 nibbls waved at Pixel ♥'])
})

test('the rank line shows the next nibbl above, and top of the board when there is none', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = { rank: { pos: 14, total: 26, above: { serial: 19, name: null, tier: 'rare', xp: 1522 } } }
  await start($)
  await answer($)
  await end($)
  expect(await nibbl($)).toContain('rank 14 of 26 · next: #000019 (1522 xp, 1519 ahead) · /nibbl wave 19')
  expect(h.toasts.filter(t => /top 10|#1 on/.test(t))).toHaveLength(0)

  h.server.syncExtra = { rank: { pos: 1, total: 26, above: null } }
  await h.clock.advance(61_000)
  await answer($)
  await end($)
  expect(await nibbl($)).toContain('rank 1 of 26 · top of the board')
})

test('the first rank seen only seeds the best rank, with no toast even at #1 or top 10', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = { rank: { pos: 1, total: 26, above: null } }
  await start($)
  await answer($)
  await end($)
  expect(h.toasts.filter(t => /top 10|#1 on/.test(t))).toHaveLength(0)
  expect(await nibbl($)).toContain('rank 1 of 26')
})

test('rank is requested once, then not again for 24 h, and v rides in every sync', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = { rank: { pos: 5, total: 26, above: { serial: 19, name: null, tier: 'rare', xp: 900 } } }
  await start($)
  await answer($)
  await end($)
  expect(h.syncs()[0]!.body.rank).toBe(true)
  await h.clock.advance(61_000)
  await answer($)
  await end($)
  expect(h.syncs()).toHaveLength(2)
  expect('rank' in h.syncs()[1]!.body).toBe(false)
  expect(typeof h.syncs()[1]!.body.v).toBe('string')
})

test('a rankAt 25 h old asks again', async ($, on) => {
  const h = harness(on, { store: { ...named(), 'v1.rankAt': START - 25 * HOURS } })
  await start($)
  await answer($)
  await end($)
  expect(h.syncs()[0]!.body.rank).toBe(true)
})

test('a stale or missing rankAt asks, a fresh one does not', async ($, on) => {
  const fresh = harness(on, { store: { ...named(), 'v1.rankAt': START - 23 * HOURS } })
  await start($)
  await answer($)
  await end($)
  expect('rank' in fresh.syncs()[0]!.body).toBe(false)
})

test('a hidden pet gets rank null: the rank line goes away and the ask is remembered', async ($, on) => {
  const h = harness(on, { store: { ...named(), 'v1.rank': { pos: 3, total: 9, above: null } }, pet: { name: 'Pixel' } })
  h.server.syncExtra = { rank: null }
  await start($)
  await answer($)
  await end($)
  expect(await nibbl($)).not.toMatch(/rank/)
  await h.clock.advance(61_000)
  await answer($)
  await end($)
  expect('rank' in h.syncs()[1]!.body).toBe(false)
})

test('importing a different pet clears the social state but keeps the update notice', async ($, on) => {
  const h = harness(on, {
    store: {
      ...named(),
      'v1.rank': { pos: 3, total: 9, above: null },
      'v1.rankAt': START,
      'v1.bestRank': 3,
      'v1.waves': [{ from: 5, name: null, at: START }],
      'v1.noteIdx': 4,
      'v1.noteAt': START,
      'v1.latest': '0.5.0',
      'v1.updateSeen': '0.5.0',
    },
  })
  await start($)
  expect(await nibbl($, `import nibbl1:99:${'C'.repeat(43)} replace`)).toMatch(/now lives on this machine/)
  const stats = await nibbl($)
  expect(stats).not.toMatch(/rank|last wave|last note/)
  expect(stats).toContain('update: ')
  expect(await nibbl($, 'notes')).toMatch(/^No notes yet/)
  void h
})

test('delivered notes stay listed after a restart, and a named pet has 19 notes to get', async ($, on) => {
  harness(on, { store: { ...named(), 'v1.noteIdx': 2, 'v1.noteAt': START } })
  await start($)
  expect(await nibbl($, 'notes')).toMatch(/\(2 of 19\)/)
})

test('rank milestones toast once: first top 10, then first #1', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  const sync = async (pos: number) => {
    h.server.syncExtra = { rank: { pos, total: 26, above: pos === 1 ? null : { serial: 19, name: 'X', tier: 'rare', xp: 9999 } } }
    await h.clock.advance(61_000)
    await answer($)
    await end($)
  }
  await start($)
  await sync(12)
  await sync(10)
  await sync(11)
  await sync(9)
  await sync(1)
  await sync(2)
  await sync(1)
  expect(h.toasts.filter(t => /top 10|#1 on/.test(t))).toEqual(['Pixel made the top 10!', 'Pixel is #1 on the board!'])
})

test('an update toast shows once per version, and /nibbl keeps the hint', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  const sync = async () => {
    await h.clock.advance(61_000)
    await answer($)
    await end($)
  }
  h.server.syncExtra = { latest: '0.2.0' }
  await start($)
  await sync()
  expect(await nibbl($)).not.toMatch(/update:/)
  h.server.syncExtra = { latest: '0.5.0' }
  await sync()
  await sync()
  await sync()
  const updates = h.toasts.filter(t => /is out/.test(t))
  expect(updates).toEqual(['nibbl 0.5.0 is out: /plugin marketplace update nibbl, then /plugin update nibbl@nibbl'])
  expect(await nibbl($)).toContain('update: /plugin marketplace update nibbl, then /plugin update nibbl@nibbl (or turn on auto-update: /plugin > Marketplaces > nibbl)')
  h.server.syncExtra = { latest: '0.10.0' }
  await sync()
  await sync()
  expect(h.toasts.filter(t => /is out/.test(t))).toHaveLength(2)
})

test('an old server without the new fields still syncs and shows no social lines', async ($, on) => {
  const h = harness(on, { store: named() })
  await start($)
  await answer($)
  await end($)
  expect(h.syncs()).toHaveLength(1)
  const stats = await nibbl($)
  expect(stats).toMatch(/sync: 0 events waiting/)
  expect(stats).not.toMatch(/rank|wave|update:/)
})

test('malformed new fields are ignored, never a failed sync', async ($, on) => {
  const h = harness(on, { store: named(), pet: { name: 'Pixel' } })
  h.server.syncExtra = {
    waves: 'lots',
    rank: { pos: 'first', total: 26, above: 5 },
    latest: 7,
  }
  await start($)
  await answer($)
  await end($)
  expect(await nibbl($)).toMatch(/sync: 0 events waiting, last sync/)
  h.server.syncExtra = { waves: [{ from: 'x' }, null, { from: -1, name: 'Z' }], rank: { pos: 3, total: 9, above: { serial: 1, name: 5, tier: 'rare', xp: 1 } }, latest: 'v2' }
  await h.clock.advance(61_000)
  await answer($)
  await end($)
  expect(h.toasts.filter(t => /waved|top 10|is out|#1/.test(t))).toHaveLength(0)
  expect(await nibbl($)).not.toMatch(/rank|last wave|update:/)
})

test('the hatch toast nudges toward naming', async ($, on) => {
  const h = harness(on)
  await start($)
  for (let i = 0; i < 10; i++) await answer($)
  await h.clock.advance(5_000)
  await h.clock.settle()
  expect(h.toasts.find(t => /hatched!/.test(t))).toMatch(/ · \/nibbl name to name it$/)
})
