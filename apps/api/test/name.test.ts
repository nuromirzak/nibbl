import { beforeEach, describe, expect, it } from 'vitest'
import { DAY_MS, type HatchResult } from '../src/routes/hatch'
import { call, hatchPet, petRow, resetDb, T0 } from './helpers'

beforeEach(resetDb)

const MIN = 60_000

const setName = (pet: HatchResult, fields: Record<string, unknown>, now = T0) =>
  call('/api/name', { body: { serial: pet.serial, token: pet.token, ...fields }, now })

describe('POST /api/name', () => {
  it('sets name and label', async () => {
    const pet = await hatchPet(1)
    const res = await setName(pet, { name: ' Byte ', label: 'night coder' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: 'Byte', label: 'night coder' })
    const row = await petRow(pet.serial)
    expect(row.name).toBe('Byte')
    expect(row.name_changed_at).toBe(T0)
  })

  it('allows one rename per week', async () => {
    const pet = await hatchPet(1)
    await setName(pet, { name: 'Byte' })
    const early = await setName(pet, { name: 'Bit' }, T0 + 6 * DAY_MS)
    expect(early.status).toBe(429)
    expect(await early.json()).toEqual({ error: 'name_rate_limited', retryAt: T0 + 7 * DAY_MS })
    expect((await setName(pet, { name: 'Bit' }, T0 + 7 * DAY_MS)).status).toBe(200)
  })

  it('treats the same name as a no-op and limits labels only to one change a minute', async () => {
    const pet = await hatchPet(1)
    await setName(pet, { name: 'Byte' })
    expect((await setName(pet, { name: 'Byte', label: 'a' }, T0 + DAY_MS)).status).toBe(200)
    expect((await setName(pet, { label: 'b' }, T0 + DAY_MS + MIN)).status).toBe(200)
    expect((await petRow(pet.serial)).name_changed_at).toBe(T0)
  })

  it('allows one label change per 60 s', async () => {
    const pet = await hatchPet(1)
    expect((await setName(pet, { label: 'a' })).status).toBe(200)
    const early = await setName(pet, { label: 'b' }, T0 + MIN - 1)
    expect(early.status).toBe(429)
    expect(await early.json()).toEqual({ error: 'label_rate_limited', retryAt: T0 + MIN })
    expect((await petRow(pet.serial)).label).toBe('a')
    // Resending the current label is not a change.
    expect((await setName(pet, { label: 'a' }, T0 + 1)).status).toBe(200)
    expect((await setName(pet, { label: 'b' }, T0 + MIN)).status).toBe(200)
    expect((await petRow(pet.serial)).label_changed_at).toBe(T0 + MIN)
  })

  it('lets only one of two concurrent label changes win', async () => {
    const pet = await hatchPet(1)
    const [a, b] = await Promise.all([setName(pet, { label: 'a' }), setName(pet, { label: 'b' })])
    expect([a.status, b.status].sort()).toEqual([200, 429])
  })

  it('clears the label with an empty string or null', async () => {
    const pet = await hatchPet(1)
    await setName(pet, { label: 'x' })
    expect(await (await setName(pet, { label: '' }, T0 + MIN)).json()).toEqual({ name: null, label: null })
    await setName(pet, { label: 'x' }, T0 + 2 * MIN)
    expect(await (await setName(pet, { label: null }, T0 + 3 * MIN)).json()).toEqual({ name: null, label: null })
  })

  it('rejects filtered text and writes nothing', async () => {
    const pet = await hatchPet(1)
    const res = await setName(pet, { name: 'Byte', label: 'visit example.com' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'label_url' })
    expect((await petRow(pet.serial)).name).toBeNull()
    expect(await (await setName(pet, { name: 'fuck' })).json()).toEqual({ error: 'name_blocked' })
    expect(await (await setName(pet, { name: 'a'.repeat(17) })).json()).toEqual({ error: 'name_too_long' })
  })

  it('needs a field and a valid token', async () => {
    const pet = await hatchPet(1)
    expect(await (await setName(pet, {})).json()).toEqual({ error: 'nothing_to_change' })
    const bad = await call('/api/name', { body: { serial: pet.serial, token: 'A'.repeat(43), name: 'x' } })
    expect(bad.status).toBe(401)
  })
})

describe('POST /api/name atomic limit', () => {
  it('lets only one of two concurrent renames win', async () => {
    const pet = await hatchPet(1)
    await setName(pet, { name: 'Byte' })
    const [a, b] = await Promise.all([
      setName(pet, { name: 'Bit' }, T0 + 8 * DAY_MS),
      setName(pet, { name: 'Bot' }, T0 + 8 * DAY_MS),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 429])
  })
})
