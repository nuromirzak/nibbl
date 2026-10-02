import { genomeKey, isTier, pickUnique, visualKey } from '@nibbl/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { counterValue } from '../src/lib/db'
import { sha256Hex } from '../src/lib/hmac'
import { BATCH, candidates } from '../src/lib/roll'
import { DAY_MS, type HatchResult } from '../src/routes/hatch'
import { call, hatchPet, insertPet, machine, petRow, resetDb, T0, testEnv } from './helpers'

beforeEach(resetDb)

const hatchRaw = (n: number, ip = '192.0.2.10', now = T0, env = {}) =>
  call('/api/hatch', { body: { machineHash: machine(n) }, ip, now, env })

describe('POST /api/hatch', () => {
  it('hatches a pet with serial, token, roll and genesis', async () => {
    const pet = await hatchPet(1)
    expect(pet.serial).toBe(1)
    expect(pet.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(isTier(pet.tier)).toBe(true)
    expect(typeof pet.shiny).toBe('boolean')
    expect(pet.genesis).toBe(true)
    expect(pet.hatchedAt).toBe(T0)
    expect(await counterValue(testEnv.DB, 'hatched')).toBe(1)
  })

  it('stores only the sha256 of the token', async () => {
    const pet = await hatchPet(1)
    const row = await petRow(pet.serial)
    expect(row.token_hash).toBe(await sha256Hex(pet.token))
    expect(row.token_hash).not.toContain(pet.token)
  })

  it('issues increasing serials', async () => {
    expect((await hatchPet(1)).serial).toBe(1)
    expect((await hatchPet(2)).serial).toBe(2)
  })

  it('is idempotent per machine and rotates the token', async () => {
    const a = await hatchPet(1)
    const b = await hatchPet(1, { ip: '192.0.2.99', now: T0 + 1000 })
    expect({ ...b, token: '' }).toEqual({ ...a, token: '' })
    expect(b.token).not.toBe(a.token)
    expect((await petRow(a.serial)).token_hash).toBe(await sha256Hex(b.token))
    expect(await counterValue(testEnv.DB, 'hatched')).toBe(1)
  })

  it('lets a known machine re-hatch even when its IP is rate limited', async () => {
    await hatchPet(1, { ip: '192.0.2.10' })
    expect((await hatchRaw(1, '192.0.2.10', T0 + 60_000)).status).toBe(200)
  })

  it('limits new hatches to one per IP per 24 h', async () => {
    expect((await hatchRaw(1, '192.0.2.10')).status).toBe(200)
    const blocked = await hatchRaw(2, '192.0.2.10', T0 + 60_000)
    expect(blocked.status).toBe(429)
    expect(await blocked.json()).toEqual({ error: 'hatch_rate_limited', retryAt: T0 + DAY_MS })
    expect((await hatchRaw(2, '192.0.2.10', T0 + DAY_MS)).status).toBe(200)
  })

  it('keeps the 24 h window across UTC midnight', async () => {
    const lateEvening = Date.UTC(2026, 9, 20, 23, 30)
    expect((await hatchRaw(1, '192.0.2.10', lateEvening)).status).toBe(200)
    expect((await hatchRaw(2, '192.0.2.10', lateEvening + 3_600_000)).status).toBe(429)
  })

  it('never stores the raw IP', async () => {
    await hatchRaw(1, '192.0.2.10')
    const { results } = await testEnv.DB.prepare('SELECT ip_hash FROM hatch_ip').all<{ ip_hash: string }>()
    expect(results).toHaveLength(1)
    expect(results[0].ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(results[0].ip_hash).not.toContain('192.0.2.10')
  })

  it('marks genesis only before LAUNCH_AT + 30 days', async () => {
    const end = Date.parse(testEnv.LAUNCH_AT) + 30 * DAY_MS
    const inside = (await (await hatchRaw(1, '192.0.2.1', end - 1)).json()) as HatchResult
    const outside = (await (await hatchRaw(2, '192.0.2.2', end)).json()) as HatchResult
    expect(inside.genesis).toBe(true)
    expect(outside.genesis).toBe(false)
  })

  it('handles concurrent hatches of one machine', async () => {
    const [a, b] = await Promise.all([hatchRaw(1, '192.0.2.1'), hatchRaw(1, '192.0.2.2')])
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    const [ja, jb] = (await Promise.all([a.json(), b.json()])) as HatchResult[]
    expect(ja.serial).toBe(jb.serial)
    const count = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM pets').first<number>('n')
    expect(count).toBe(1)
  })

  it('falls to the second batch when every first-batch genome key is taken', async () => {
    const m = machine(77)
    const first = await candidates(testEnv.ROLL_SECRET, m, 0)
    for (const [i, g] of first.entries()) await insertPet({ serial: 500_000 + i, genome_key: genomeKey(g), visual_key: `taken-${i}` })
    const taken = new Set(first.map(genomeKey))
    const expected = pickUnique(await candidates(testEnv.ROLL_SECRET, m, BATCH), k => taken.has(k), () => false)
    const pet = (await (await hatchRaw(77)).json()) as HatchResult
    expect(pet.seed).toBe(expected!.seed)
  })

  it('treats a taken visual key as a collision too', async () => {
    const m = machine(78)
    const first = await candidates(testEnv.ROLL_SECRET, m, 0)
    for (const [i, g] of first.entries()) await insertPet({ serial: 600_000 + i, genome_key: `taken-${i}`, visual_key: visualKey(g) })
    const pet = (await (await hatchRaw(78)).json()) as HatchResult
    expect(first.map(g => g.seed)).not.toContain(pet.seed)
    const row = await petRow(pet.serial)
    expect(first.map(visualKey)).not.toContain(row.visual_key)
  })

  it('answers 503 when both batches are taken and writes nothing', async () => {
    const m = machine(79)
    const all = [...(await candidates(testEnv.ROLL_SECRET, m, 0)), ...(await candidates(testEnv.ROLL_SECRET, m, BATCH))]
    for (const [i, g] of all.entries()) await insertPet({ serial: 700_000 + i, genome_key: genomeKey(g), visual_key: `t-${i}` })
    const res = await hatchRaw(79)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'no_unique_genome' })
    expect(await counterValue(testEnv.DB, 'serial')).toBe(0)
    expect(await counterValue(testEnv.DB, 'hatched')).toBe(0)
  })

  it('answers 503 when secrets are missing', async () => {
    const res = await hatchRaw(1, '192.0.2.1', T0, { ROLL_SECRET: '' })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'not_configured' })
  })

  it('validates the body', async () => {
    expect((await call('/api/hatch', { body: { machineHash: 'nope' } })).status).toBe(400)
    expect((await call('/api/hatch', { rawBody: '{' })).status).toBe(400)
    expect((await call('/api/hatch', { rawBody: JSON.stringify({ machineHash: 'a'.repeat(5000) }) })).status).toBe(413)
    expect((await call('/api/hatch')).status).toBe(405)
  })
})
