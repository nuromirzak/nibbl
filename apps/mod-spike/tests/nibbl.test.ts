// Drives the built mod only through raised events, so this file runs unchanged
// against the bundled folder (`claude plugin test <dev-mods>/nibbl`).
import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const HOUR = 3_600_000
const START = 1_000 * HOUR + 60_000

const BAND = (maxRows = 12) => ({
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: maxRows },
    view: {},
  },
})

const harness = (on: On) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('tool.call', ($, e) =>
    String((e as { command?: string }).command ?? '').includes('fail')
      ? { result: 'boom', text: 'boom', isError: true as const }
      : { result: 'ok', text: 'ok' },
  )
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: ['engine draws'] })
  })
  return { clock, toasts }
}

type Raise = { turn: { complete: (e: never) => Promise<unknown> } }
const answer = ($: unknown, agentId?: string) =>
  ($ as Raise).turn.complete({
    answer: 'done',
    durationMs: 10,
    isAborted: false,
    turnId: `t${Math.random()}`,
    reason: 'answer',
    ...(agentId ? { agentId } : {}),
  } as never)

type Run = { command: { run: (e: { command: string; args?: string }) => Promise<{ text?: string }> } }
const nibbl = async ($: unknown, args = '') => ((await ($ as Run).command.run({ command: 'nibbl', args })).text ?? '')

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const fromBase64 = (text: string): Uint8Array => {
  const clean = text.replace(/=+$/, '')
  const out: number[] = []
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].reduce((acc, k) => (acc << 6) | Math.max(0, B64.indexOf(clean[i + k] ?? 'A')), 0)
    out.push((n >> 16) & 255, (n >> 8) & 255, n & 255)
  }
  return Uint8Array.from(out.slice(0, Math.floor((clean.length * 3) / 4)))
}
const u32s = (bytes: Uint8Array): number[] => {
  const words: number[] = []
  for (let i = 0; i + 3 < bytes.length; i += 4)
    words.push((bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24)) >>> 0)
  return words
}

const hatchByte = async ($: unknown, clock: { advance: (ms: number) => Promise<void> }) => {
  for (let i = 0; i < 3; i++) await answer($)
  await clock.advance(1500)
}

test('egg hatches after 3 answered main-loop turns, subagent turns do not count', async ($, on) => {
  const { clock, toasts } = harness(on)
  let ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Text', text: 'Egg · hatches after 3 turns' })).toBeDefined()
  await ui.unmount()

  await answer($)
  await answer($, 'sub-agent-1')
  await answer($)
  ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Text', text: /turns 2\/3/ })).toBeDefined()
  await ui.unmount()

  await answer($)
  await clock.advance(1500)
  expect(toasts.some(t => /^Byte hatched! rarest: .+ [\d.]+% odds$/.test(t))).toBe(true)
  ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Text', text: /^Byte #local · (common|uncommon|rare|epic|legendary)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^lvl 1 {2}[▓░]{5} 0\/10$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '♥♥♥♥♥' })).toBeDefined()
  await ui.unmount()
  expect(await nibbl($)).toMatch(/rarest trait: .+% odds/)
})

test('an error adds a bug (max 3) and a passing check clears them', async ($, on) => {
  const { clock } = harness(on)
  await hatchByte($, clock)

  await $.tool.call({ tool: 'Bash', command: 'npm run fail' } as never)
  expect(await nibbl($)).toMatch(/bugs 1/)
  let ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Text', text: 'oops' })).toBeDefined()
  await ui.unmount()

  for (let i = 0; i < 4; i++) await $.tool.call({ tool: 'Bash', command: 'fail again' } as never)
  expect(await nibbl($)).toMatch(/bugs 3/)

  await $.tool.call({ tool: 'Bash', command: 'pnpm vitest run' } as never)
  expect(await nibbl($)).toMatch(/bugs 0/)
  ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Text', text: 'yay' })).toBeDefined()
  await ui.unmount()

  // check_pass is worth 2 xp; the mood wears off after 6s.
  expect(await nibbl($)).toMatch(/2 xp/)
  await clock.advance(7000)
  ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Text', text: 'chilling' })).toBeDefined()
  await ui.unmount()
})

test('petting gives xp only 5 times per hour, then refills next hour', async ($, on) => {
  const { clock, toasts } = harness(on)
  await hatchByte($, clock)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  for (let i = 0; i < 7; i++) await ui.press({ key: 'pet' })
  expect(await nibbl($)).toMatch(/, 10 xp/)
  expect(await nibbl($)).toMatch(/hearts left this hour: 0\/5/)
  expect(toasts.some(t => t.includes('all petted out'))).toBe(true)
  expect(await ui.find({ type: 'Text', text: '♡♡♡♡♡' })).toBeDefined()

  await clock.advance(HOUR)
  await ui.press({ key: 'pet' })
  expect(await nibbl($)).toMatch(/, 12 xp/)
  await ui.unmount()
})

test('band draws HUD plus a Raster on the terminal and Text runs on desktop', async ($, on) => {
  const { clock } = harness(on)
  await hatchByte($, clock)

  const term = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  const raster = await term.find({ type: 'Raster' })
  expect(raster).toBeDefined()
  expect(raster?.props.columns).toBe(32)
  expect(raster?.props.rows).toBe(8)
  expect(typeof raster?.props.cells).toBe('string')
  // RISK #1: the surface accepted the tree, and empty sky keeps the terminal's own background.
  await term.drawn()
  const words = u32s(fromBase64(String(raster?.props.cells)))
  expect(words.length).toBe(32 * 8 * 3)
  const topLeft = words.slice(0, 3)
  expect(topLeft).toEqual([0x20, 0x01000000, 0x01000000])
  const glyphs = new Set(words.filter((_, i) => i % 3 === 0))
  expect(glyphs.has(0x2580) || glyphs.has(0x2584)).toBe(true)
  expect(await term.find({ type: 'Button', key: 'pet' })).toBeDefined()
  await term.unmount()

  const desk = await $.ui.mount({ plugin: 'nibbl', surface: 'desktop', ...BAND() })
  expect(await desk.find({ type: 'Raster' })).toBeUndefined()
  expect(await desk.find({ type: 'Text', text: /^Byte #local/ })).toBeDefined()
  expect((await desk.findAll({ type: 'Text' })).length).toBeGreaterThan(20)
  await desk.unmount()

  // Under 8 rows the band is one compact line with no scene.
  const small = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND(6) })
  expect(await small.find({ type: 'Raster' })).toBeUndefined()
  expect(await small.find({ type: 'Text', text: 'Byte' })).toBeDefined()
  await small.unmount()
})

test('client mode: a click on the scene pets Byte', async ($, on) => {
  const { clock } = harness(on)
  await hatchByte($, clock)
  expect(await nibbl($, 'mode client')).toMatch(/client/)
  const ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Client', key: 'scene' })).toBeDefined()
  await ui.pointer({ type: 'down', x: 12, y: 4, button: 'left', in: 'scene' })
  expect(await nibbl($)).toMatch(/lvl 1, 2 xp/)
  await ui.unmount()
})

test('/nibbl hide toggles the band, /nibbl name renames, /nibbl reset goes back to an egg', async ($, on) => {
  const { clock } = harness(on)
  await hatchByte($, clock)

  expect(await nibbl($, 'hide')).toMatch(/hidden/)
  let ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Text', text: 'engine draws' })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
  expect(await nibbl($, 'hide')).toMatch(/back/)

  expect(await nibbl($, 'name Nibbles the Great Wide')).toMatch(/1 to 16/)
  expect(await nibbl($, 'name Pixel')).toMatch(/Renamed to Pixel/)
  ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Text', text: /^Pixel #local/ })).toBeDefined()
  await ui.unmount()

  expect(await nibbl($, 'reset')).toMatch(/Back to an egg/)
  ui = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', ...BAND() })
  expect(await ui.find({ type: 'Text', text: 'Egg · hatches after 3 turns' })).toBeDefined()
  await ui.unmount()
})
