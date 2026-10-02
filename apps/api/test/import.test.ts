import { beforeEach, describe, expect, it } from 'vitest'
import type { OwnerView } from '../src/lib/db'
import type { HatchResult } from '../src/routes/hatch'
import { call, hatchPet, machine, petRow, resetDb, T0 } from './helpers'

beforeEach(resetDb)

const importTo = (pet: HatchResult, n: number, token = pet.token) =>
  call('/api/import', { body: { serial: pet.serial, token, machineHash: machine(n) } })

describe('POST /api/import', () => {
  it('moves a pet to a new machine and returns it', async () => {
    const a = await hatchPet(1)
    const res = await importTo(a, 50)
    expect(res.status).toBe(200)
    const body = (await res.json()) as OwnerView
    expect(body).toMatchObject({ serial: a.serial, seed: a.seed, tier: a.tier, xp: 0, level: 1 })
    expect((await petRow(a.serial)).machine_hash).toBe(machine(50))
    // The new machine now re-hatches into the imported pet.
    expect((await hatchPet(50, { now: T0 + 1000 })).serial).toBe(a.serial)
  })

  it('releases a pet already bound to the target machine', async () => {
    const a = await hatchPet(1)
    const b = await hatchPet(2)
    await importTo(a, 2)
    expect((await petRow(b.serial)).machine_hash).toBe(`released:${b.serial}`)
    // B still works with its own export code.
    const syncB = await call('/api/sync', { body: { serial: b.serial, token: b.token, events: [] }, now: T0 + 60_000 })
    expect(syncB.status).toBe(200)
  })

  it('frees the old machine, which then hatches a new pet', async () => {
    const a = await hatchPet(1)
    await importTo(a, 50)
    const fresh = await hatchPet(1, { ip: '192.0.2.200', now: T0 + 1000 })
    expect(fresh.serial).not.toBe(a.serial)
  })

  it('is a no-op on the same machine and checks the token', async () => {
    const a = await hatchPet(1)
    expect((await importTo(a, 1)).status).toBe(200)
    expect((await importTo(a, 2, 'A'.repeat(43))).status).toBe(401)
    expect((await call('/api/import', { body: { serial: a.serial, token: a.token, machineHash: 'x' } })).status).toBe(400)
  })
})
