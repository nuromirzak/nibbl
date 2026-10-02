import { expect, test } from 'claude-code/testing'

import { BAND, answer, bash, end, harness, hatchedStore, nibbl, start, turnEnd, turnStart } from './harness.ts'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
// Decodes Raster cells back into u32 words: [codePoint, fg, bg] per cell.
const words = (cells: string): number[] => {
  const clean = cells.replace(/=+$/, '')
  const bytes: number[] = []
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].reduce((acc, k) => (acc << 6) | Math.max(0, B64.indexOf(clean[i + k] ?? 'A')), 0)
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255)
  }
  const out: number[] = []
  for (let i = 0; i + 3 < bytes.length; i += 4) out.push((bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24)) >>> 0)
  return out
}

test('a hatched pet draws HUD text, a [♥] button and a 32x8 Raster with transparent sky', async ($, on) => {
  harness(on, { store: hatchedStore() })
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', requestId: 'band', ...BAND() })
  expect(await ui.find({ type: 'Text', text: 'Nibbl #000042' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^lvl 1 {2}[▓░]{5} 0\/10$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '♥♥♥♥♥' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'chilling' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'pet' })).toBeDefined()
  const raster = await ui.find({ type: 'Raster' })
  expect(raster?.props.columns).toBe(32)
  expect(raster?.props.rows).toBe(8)
  const w = words(String(raster?.props.cells))
  expect(w).toHaveLength(32 * 8 * 3)
  // Empty sky keeps the terminal's own background (the spike's transparency finding).
  expect(w.slice(0, 3)).toEqual([0x20, 0x01000000, 0x01000000])
  await ui.unmount()
})

test('short or narrow bands and non-terminal surfaces get one line of text', async ($, on) => {
  harness(on, { store: hatchedStore() })
  await start($)
  const line = 'Nibbl #000042 · lvl 1 ♥♥♥♥♥ · chilling'
  const short = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND(6) })
  expect(await short.find({ type: 'Raster' })).toBeUndefined()
  expect(await short.find({ type: 'Text', text: line })).toBeDefined()
  expect(await short.find({ type: 'Button', key: 'pet' })).toBeDefined()
  await short.unmount()
  const narrow = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND(12, 50) })
  expect(await narrow.find({ type: 'Raster' })).toBeUndefined()
  expect(await narrow.find({ type: 'Text', text: line })).toBeDefined()
  await narrow.unmount()
  const desk = await $.ui.mount({ plugin: 'nibbl', surface: 'desktop', ...BAND() })
  expect(await desk.find({ type: 'Text', text: line })).toBeDefined()
  expect(await desk.find({ type: 'Button', key: 'pet' })).toBeDefined()
  await desk.unmount()
})

test('a turn sends the pet on an expedition with a live clock and brings it back with loot', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  await turnStart($)
  expect(await ui.find({ type: 'Text', text: '⛏ on expedition 0:00' })).toBeDefined()
  await h.clock.advance(5_000)
  expect(await ui.find({ type: 'Text', text: '⛏ on expedition 0:05' })).toBeDefined()
  await turnEnd($)
  expect(await ui.find({ type: 'Text', text: 'back with loot' })).toBeDefined()
  await h.clock.advance(4_500)
  expect(await ui.find({ type: 'Text', text: 'chilling' })).toBeDefined()
  await ui.unmount()
})

test('errors bring at most three bugs and a passing check eats them', async ($, on) => {
  harness(on, { store: hatchedStore() })
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  const cells = async () => String((await ui.find({ type: 'Raster' }))?.props.cells)
  const calm = await cells()
  await bash($, 'npm run fail')
  expect(await ui.find({ type: 'Text', text: 'oops, a bug' })).toBeDefined()
  const one = await cells()
  await bash($, 'npm run fail')
  await bash($, 'npm run fail')
  const three = await cells()
  await bash($, 'npm run fail')
  expect(await cells()).toBe(three)
  expect(one).not.toBe(three)
  expect(one).not.toBe(calm)
  await bash($, 'pnpm vitest run')
  expect(await ui.find({ type: 'Text', text: 'yum, bugs eaten' })).toBeDefined()
  await ui.unmount()
})

test('a commit carries a box', async ($, on) => {
  harness(on, { store: hatchedStore() })
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  await bash($, 'git commit -m wip')
  expect(await ui.find({ type: 'Text', text: 'shipped a commit' })).toBeDefined()
  await ui.unmount()
})

test('petting fills the hearts: five give XP, the rest only love, and no toast nags', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  for (let i = 0; i < 7; i++) await ui.press({ key: 'pet' })
  expect(await ui.find({ type: 'Text', text: '♡♡♡♡♡' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'loved that' })).toBeDefined()
  expect(await nibbl($)).toMatch(/, 10 xp/)
  expect(h.toasts.filter(t => !t.includes('reached level'))).toEqual([])
  await ui.unmount()
  await end($)
  expect((h.syncs()[0]!.body.events as { type: string }[]).filter(e => e.type === 'pet')).toHaveLength(7)
})

test("nightcap follows the machine's own UTC offset, and the pet sleeps after 3 idle minutes", { timeoutMs: 20_000 }, async ($, on) => {
  const h = harness(on, { store: hatchedStore(), now: Date.UTC(2026, 9, 2, 21, 30) })
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Text', text: 'nightcap on' })).toBeDefined()
  await h.clock.advance(3 * 60_000 + 1_000)
  expect(await ui.find({ type: 'Text', text: 'zzz' })).toBeDefined()
  await ui.unmount()
})

test('the same moment is daytime on a machine at -07:00', async ($, on) => {
  harness(on, { store: hatchedStore(), now: Date.UTC(2026, 9, 2, 21, 30), utcOffset: '-0700' })
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Text', text: 'chilling' })).toBeDefined()
  await ui.unmount()
})

test('a hidden band is handed back to the engine, also in the next session', async ($, on) => {
  harness(on, { store: { ...hatchedStore(), 'v1.hidden': true } })
  await start($)
  let ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Text', text: 'engine draws' })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
  expect(await nibbl($, 'hide')).toBe('Nibbl is back.')
  ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  await ui.unmount()
})

test('before the hatch the band shows the egg and its turn count, with no pet button', async ($, on) => {
  harness(on)
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Text', text: 'Egg' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'turns 0/10' })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'pet' })).toBeUndefined()
  await ui.unmount()
})

test('animation repaints the Raster with $.ui.blit instead of redrawing the band', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', requestId: 'band', ...BAND() })
  const drawn = String((await ui.find({ type: 'Raster' }))?.props.cells)
  await h.clock.advance(2_000)
  expect(h.blits.length).toBeGreaterThan(0)
  expect(h.blits.every(b => b.requestId === 'band' && b.key === 'scene' && b.cells?.length === 4096)).toBe(true)
  // The tree was not redrawn: its cells are still the first frame's.
  expect(String((await ui.find({ type: 'Raster' }))?.props.cells)).toBe(drawn)
  await ui.unmount()
  const compact = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND(6) })
  h.blits.length = 0
  await h.clock.advance(2_000)
  expect(h.blits).toHaveLength(0)
  await compact.unmount()
})

// The tick fingerprint is only status|hearts; the band still redraws when any HUD line changes.
test('an XP change and an egg turn redraw the HUD text', async ($, on) => {
  harness(on, { store: hatchedStore() })
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Text', text: /0\/10$/ })).toBeDefined()
  await bash($, 'git commit -m wip')
  expect(await ui.find({ type: 'Text', text: /^lvl 1 {2}[▓░]{5} 2\/10$/ })).toBeDefined()
  await ui.unmount()
})

test('an answered turn moves the egg count on the band', async ($, on) => {
  const h = harness(on)
  await start($)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  await answer($)
  await h.clock.advance(1_000)
  expect(await ui.find({ type: 'Text', text: 'turns 1/10' })).toBeDefined()
  await ui.unmount()
})

test('a survey hands the band back to the engine', async ($, on) => {
  harness(on, { store: hatchedStore() })
  await start($)
  const band = BAND()
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...band, props: { ...band.props, hasSurvey: true } })
  expect(await ui.find({ type: 'Text', text: 'engine draws' })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})
