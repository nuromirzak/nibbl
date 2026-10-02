import { genomeKey, isTier, pickUnique, visualKey } from '@nibbl/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { counterValue } from '../src/lib/db'
import { sha256Hex } from '../src/lib/hmac'
import { BATCH, candidates } from '../src/lib/roll'
import { ipBucket } from '../src/lib/ip'
import { DAY_MS, HATCHES_PER_IP_DAY, ipDayHash, type HatchResult } from '../src/routes/hatch'
import { call, hatchPet, insertPet, machine, petRow, resetDb, T0, testEnv } from './helpers'

beforeEach(resetDb)

const NEXT_MIDNIGHT = Date.UTC(2026, 9, 21)

const ipCount = async (ip: string, now: number) =>
  testEnv.DB.prepare('SELECT count FROM hatch_ip WHERE ip_hash = ?')
    .bind(await ipDayHash(testEnv.IP_SALT, ipBucket(ip), now))
    .first<number>('count')

// Puts an IP at today's limit without running 100 hatches.
const fillIp = async (ip: string, now: number) =>
  testEnv.DB.prepare('INSERT INTO hatch_ip (ip_hash, count, last_at) VALUES (?, ?, ?) ON CONFLICT (ip_hash) DO UPDATE SET count = excluded.count')
    .bind(await ipDayHash(testEnv.IP_SALT, ipBucket(ip), now), HATCHES_PER_IP_DAY, now)
    .run()

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

  it('returns the owner view plus token on a new hatch', async () => {
    const pet = await hatchPet(1)
    expect(Object.keys(pet).sort()).toEqual(
      ['genesis', 'hatchedAt', 'label', 'level', 'name', 'seed', 'serial', 'shiny', 'tier', 'token', 'xp'].sort(),
    )
    expect(pet).toMatchObject({ name: null, label: null, xp: 0, level: 1 })
  })

  it('keeps name, label, xp and level when a known machine re-hatches', async () => {
    const a = await hatchPet(1)
    await testEnv.DB.prepare("UPDATE pets SET name = 'Byte', label = 'night coder', xp = 500, level = 7 WHERE serial = ?").bind(a.serial).run()
    const b = await hatchPet(1, { now: T0 + 1000 })
    expect({ ...b, token: '' }).toEqual({ ...a, token: '', name: 'Byte', label: 'night coder', xp: 500, level: 7 })
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

  it('allows one re-hatch of a known machine per 60 s', async () => {
    const a = await hatchPet(1)
    expect((await hatchRaw(1, '192.0.2.10', T0 + 1000)).status).toBe(200)
    const early = await hatchRaw(1, '192.0.2.11', T0 + 1000 + 59_999)
    expect(early.status).toBe(429)
    expect(await early.json()).toEqual({ error: 'rehatch_rate_limited', retryAt: T0 + 1000 + 60_000 })
    const late = (await (await hatchRaw(1, '192.0.2.11', T0 + 1000 + 60_000)).json()) as HatchResult
    expect(late.serial).toBe(a.serial)
    expect((await petRow(a.serial)).token_hash).toBe(await sha256Hex(late.token))
  })

  it('lets a known machine re-hatch even when its IP is rate limited, without counting it', async () => {
    await hatchPet(1, { ip: '192.0.2.10' })
    await fillIp('192.0.2.10', T0)
    expect((await hatchRaw(1, '192.0.2.10', T0 + 60_000)).status).toBe(200)
    expect(await ipCount('192.0.2.10', T0)).toBe(HATCHES_PER_IP_DAY)
  })

  it('never counts a known-machine re-hatch against the IP', async () => {
    await hatchPet(1, { ip: '192.0.2.10' })
    await hatchRaw(1, '192.0.2.10', T0 + 60_000)
    expect(await ipCount('192.0.2.10', T0)).toBe(1)
  })

  it('allows 100 new hatches per IP per UTC day; the 101st waits for midnight', async () => {
    for (let n = 1; n <= HATCHES_PER_IP_DAY; n++) expect((await hatchRaw(n, '192.0.2.10', T0 + n)).status, `hatch ${n}`).toBe(200)
    const blocked = await hatchRaw(101, '192.0.2.10', T0 + 1000)
    expect(blocked.status).toBe(429)
    expect(await blocked.json()).toEqual({ error: 'hatch_rate_limited', retryAt: NEXT_MIDNIGHT })
    expect((await hatchRaw(102, '192.0.2.11', T0 + 1000)).status).toBe(200)
    expect((await hatchRaw(101, '192.0.2.10', NEXT_MIDNIGHT)).status).toBe(200)
  })

  it('holds the per-IP cap under a burst: one winner at count 99, the rest get 429', async () => {
    const ip = '192.0.2.50'
    const hash = await ipDayHash(testEnv.IP_SALT, ipBucket(ip), T0)
    await testEnv.DB.prepare('INSERT INTO hatch_ip (ip_hash, count, last_at) VALUES (?, ?, ?)').bind(hash, HATCHES_PER_IP_DAY - 1, T0).run()
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => hatchRaw(i + 1, ip, T0 + 1000)))
    const statuses = results.map(r => r.status)
    expect(statuses.filter(s => s === 200)).toHaveLength(1)
    expect(statuses.filter(s => s === 429)).toHaveLength(19)
    for (const r of results) if (r.status === 429) expect(await r.json()).toEqual({ error: 'hatch_rate_limited', retryAt: NEXT_MIDNIGHT })
    expect(await ipCount(ip, T0)).toBe(HATCHES_PER_IP_DAY)
    expect(await counterValue(testEnv.DB, 'serial')).toBe(1)
    expect(await counterValue(testEnv.DB, 'hatched')).toBe(1)
    expect((await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM pets').first<number>('n'))).toBe(1)
  })

  it('shares one IPv6 limit across a /64', async () => {
    await fillIp('2001:db8:1:2::1', T0)
    expect((await hatchRaw(2, '2001:db8:1:2:aaaa:bbbb:cccc:dddd', T0 + 60_000)).status).toBe(429)
    expect((await hatchRaw(3, '2001:db8:1:3::1', T0 + 60_000)).status).toBe(200)
  })

  it('resets the limit at UTC midnight', async () => {
    const lateEvening = Date.UTC(2026, 9, 20, 23, 30)
    await fillIp('192.0.2.10', lateEvening)
    expect((await hatchRaw(1, '192.0.2.10', lateEvening)).status).toBe(429)
    expect((await hatchRaw(1, '192.0.2.10', lateEvening + 3_600_000)).status).toBe(200)
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

  it('returns the pet a concurrent same-IP hatch just created instead of a 429', async () => {
    await fillIp('192.0.2.10', T0)
    // Simulates the other request: the pet appears while this one checks the IP count.
    const racing = new Proxy(testEnv.DB, {
      get(target, prop) {
        if (prop === 'prepare') {
          return (sql: string) => {
            const stmt = target.prepare(sql)
            if (!sql.startsWith('SELECT count FROM hatch_ip')) return stmt
            return {
              bind: (...args: unknown[]) => ({
                first: async (col: string) => {
                  await insertPet({ serial: 900, machine_hash: machine(5) })
                  return stmt.bind(...args).first(col)
                },
              }),
            }
          }
        }
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as D1Database
    const res = await hatchRaw(5, '192.0.2.10', T0 + 1000, { DB: racing })
    expect(res.status).toBe(200)
    expect(((await res.json()) as HatchResult).serial).toBe(900)
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
