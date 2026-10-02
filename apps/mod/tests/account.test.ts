import { expect, test } from 'claude-code/testing'

import { answer, end, harness, hatchedStore, IMPORT_TOKEN, MACHINE_HASH, nibbl, START, start, TOKEN_A } from './harness.ts'

test('/nibbl name renames on the server and the stats follow', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  expect(await nibbl($, 'name Pixel')).toBe('Renamed to Pixel.')
  const call = h.calls.find(c => c.path === '/api/name')!
  expect(call.body).toEqual({ serial: 42, token: TOKEN_A, name: 'Pixel' })
  expect(call.headers['content-type']).toBe('application/json')
  expect(await nibbl($)).toMatch(/^Pixel #000042\n/)
})

test('name errors from the server become plain sentences, and bad input never leaves', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  h.respondOnce('/api/name', { status: 400, body: { error: 'name_blocked' } })
  expect(await nibbl($, 'name Badword')).toBe('That name is not allowed. Try another one.')
  h.respondOnce('/api/name', { status: 400, body: { error: 'name_invalid_chars' } })
  expect(await nibbl($, 'name Byte #1')).toMatch(/letters, digits, spaces/)
  h.respondOnce('/api/name', { status: 429, body: { error: 'name_rate_limited', retryAt: START + 7 * 86_400_000 } })
  expect(await nibbl($, 'name Again')).toBe('You can rename once a week. Next rename from 2026-10-09 09:00 UTC.')
  const before = h.calls.length
  expect(await nibbl($, 'name Nibbles the Great Wide')).toBe('A name is at most 16 characters.')
  expect(await nibbl($, 'name')).toBe('Usage: /nibbl name <text>, 1 to 16 characters.')
  expect(h.calls.length).toBe(before)
  h.net.offline = true
  expect(await nibbl($, 'name Later')).toBe('Nibbl is offline right now. Try again later.')
})

test('/nibbl label sets and clears the label', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  expect(await nibbl($, 'label night coder')).toBe('Label set to "night coder".')
  expect(await nibbl($)).toMatch(/^Nibbl #000042 · night coder\n/)
  h.respondOnce('/api/name', { status: 429, body: { error: 'label_rate_limited', retryAt: START + 42_000 } })
  expect(await nibbl($, 'label owl')).toBe('Labels change at most once a minute. Try again in 42s.')
  expect(await nibbl($, 'label')).toBe('Label cleared.')
  expect(h.calls.filter(c => c.path === '/api/name').at(-1)!.body).toEqual({ serial: 42, token: TOKEN_A, label: '' })
  expect(await nibbl($)).toMatch(/^Nibbl #000042\n/)
})

test('/nibbl export keeps the token out of the text the model reads and draws it on screen', async ($, on) => {
  harness(on, { store: hatchedStore() })
  await start($)
  const text = await nibbl($, 'export')
  expect(text).not.toContain(TOKEN_A)
  expect(text).toMatch(/^Export code for Nibbl #000042 is shown on screen only/)
  expect(text).toMatch(/anyone with it owns your pet/)
  const row = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', component: 'CommandOutput', props: { command: 'nibbl', args: 'export', text, isErrored: false } })
  expect(await row.find({ type: 'Text', text: `nibbl1:42:${TOKEN_A}` })).toBeDefined()
  await row.unmount()
  const stats = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', component: 'CommandOutput', props: { command: 'nibbl', args: '', text: 'stats', isErrored: false } })
  expect(await stats.find({ type: 'Text', text: 'engine draws' })).toBeDefined()
  await stats.unmount()
})

test('/nibbl import refuses junk, asks for replace over another pet, and maps 401', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  expect(await nibbl($, 'import hello')).toMatch(/does not look like a nibbl code/)
  const code = `nibbl1:99:${IMPORT_TOKEN}`
  expect(await nibbl($, `import ${code}`)).toBe(
    'This machine already has Nibbl #000042. Run /nibbl export first and keep its code, then /nibbl import <code> replace.',
  )
  expect(h.calls.filter(c => c.path === '/api/import')).toHaveLength(0)
  expect(await nibbl($, `import nibbl1:99:${'D'.repeat(43)} replace`)).toMatch(/did not accept that code/)
  expect(await nibbl($, `import ${code} replace`)).toBe('Pixel #000099 now lives on this machine.')
  expect(h.calls.filter(c => c.path === '/api/import').at(-1)!.body).toEqual({ serial: 99, token: IMPORT_TOKEN, machineHash: MACHINE_HASH })
  expect(await nibbl($)).toMatch(/^Pixel #000099\n/)
})

test('/nibbl import on a machine that only has an egg', async ($, on) => {
  harness(on)
  await start($)
  expect(await nibbl($, `import nibbl1:99:${IMPORT_TOKEN}`)).toBe('Pixel #000099 now lives on this machine.')
  expect(await nibbl($, 'export')).toMatch(/^Export code for Pixel #000099/)
})

test('name and export need a hatched pet', async ($, on) => {
  harness(on)
  await start($)
  expect(await nibbl($, 'name Pixel')).toBe('Hatch the egg first, then name it.')
  expect(await nibbl($, 'export')).toBe('Nothing to export yet: hatch the egg first.')
})

test('importing another pet drops the queued events of the old one', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  await answer($)
  expect(await nibbl($, `import nibbl1:99:${IMPORT_TOKEN} replace`)).toBe('Pixel #000099 now lives on this machine.')
  await end($)
  expect(h.syncs()).toHaveLength(0)
})

test('importing the same serial keeps the queue and needs no replace', async ($, on) => {
  const h = harness(on, { store: hatchedStore({ serial: 99, token: 'Z'.repeat(43) }) })
  await start($)
  await answer($)
  expect(await nibbl($, `import nibbl1:99:${IMPORT_TOKEN}`)).toBe('Pixel #000099 now lives on this machine.')
  expect(h.calls.filter(c => c.path === '/api/import')).toHaveLength(1)
  await end($)
  expect(h.syncs().length).toBeGreaterThan(0)
})

test('import offline and import errors speak plainly, never raw codes', async ($, on) => {
  const h = harness(on)
  await start($)
  h.net.offline = true
  expect(await nibbl($, `import nibbl1:99:${IMPORT_TOKEN}`)).toBe('Nibbl is offline right now. Try the import again later.')
  h.net.offline = false
  h.respondOnce('/api/import', { status: 400, body: { error: 'bad_request' } })
  const bad = await nibbl($, `import nibbl1:99:${IMPORT_TOKEN}`)
  expect(bad).toBe('The server could not use that code. Check that you copied all of it, or export a fresh one.')
  expect(bad).not.toMatch(/bad_request/)
  h.respondOnce('/api/import', { status: 429, body: { error: 'rate_limited' } })
  expect(await nibbl($, `import nibbl1:99:${IMPORT_TOKEN}`)).toBe('The server asked for a pause. Try the import again in a while.')
  h.respondOnce('/api/import', { status: 500, body: { error: 'boom_internal' } })
  expect(await nibbl($, `import nibbl1:99:${IMPORT_TOKEN}`)).not.toMatch(/boom_internal/)
})

test('a pending spike pet is protected from import until replace', async ($, on) => {
  const h = harness(on, { store: { pet: { seed: 4125214855, tier: 'common', shiny: false, hatchedAt: START - 86_400_000, xp: 290, name: 'Byte' } } })
  h.net.offline = true
  await start($)
  const text = await nibbl($, `import nibbl1:99:${IMPORT_TOKEN}`)
  expect(text).toMatch(/already has Byte/)
  expect(text).toMatch(/replace/)
  h.net.offline = false
  expect(h.calls.filter(c => c.path === '/api/import')).toHaveLength(0)
  expect(await nibbl($, `import nibbl1:99:${IMPORT_TOKEN} replace`)).toBe('Pixel #000099 now lives on this machine.')
})

test('/nibbl name re-authenticates after a 401 and retries once', async ($, on) => {
  const h = harness(on, { store: hatchedStore({ token: 'Z'.repeat(43) }) })
  await start($)
  expect(await nibbl($, 'name Pixel')).toBe('Renamed to Pixel.')
  expect(h.hatches()).toHaveLength(1)
  expect(h.calls.filter(c => c.path === '/api/name')).toHaveLength(2)
})

test('a persistent 401 on name says what happened and does not promise a retry that cannot help', async ($, on) => {
  const h = harness(on, { store: hatchedStore() })
  await start($)
  h.respondOnce('/api/name', { status: 401, body: { error: 'unauthorized' } })
  h.respondOnce('/api/name', { status: 401, body: { error: 'unauthorized' } })
  const text = await nibbl($, 'name Pixel')
  expect(text).toBe("Could not reach your pet's account. Try /nibbl name again later.")
  expect(text).not.toMatch(/unauthorized/)
})

test('the export row shows the code of the pet that was exported, not whatever is current', async ($, on) => {
  harness(on, { store: hatchedStore() })
  await start($)
  const text = await nibbl($, 'export')
  await nibbl($, `import nibbl1:99:${IMPORT_TOKEN} replace`)
  const row = await $.ui.mount({ plugin: 'nibbl', surface: 'terminal', component: 'CommandOutput', props: { command: 'nibbl', args: 'export', text, isErrored: false } })
  expect(await row.find({ type: 'Text', text: `nibbl1:99:${IMPORT_TOKEN}` })).toBeUndefined()
  expect(await row.find({ type: 'Text', text: 'engine draws' })).toBeDefined()
  await row.unmount()
})
