import { beforeEach, describe, expect, it } from 'vitest'
import { DAY_MS, type HatchResult } from '../src/routes/hatch'
import { call, hatchPet, insertPet, resetDb, T0, testEnv } from './helpers'

beforeEach(resetDb)

const MIDNIGHT = Math.floor(T0 / DAY_MS) * DAY_MS
const wave = (pet: HatchResult, to: unknown, now = T0, token = pet.token) =>
  call('/api/wave', { body: { serial: pet.serial, token, to }, now })
const sync = (pet: HatchResult, now = T0, extra: Record<string, unknown> = { v: '0.2.0' }) =>
  call('/api/sync', { body: { serial: pet.serial, token: pet.token, events: [], ...extra }, now })
const syncRank = (pet: HatchResult, now = T0) => sync(pet, now, { v: '0.2.0', rank: true })
const setXp = (serial: number, xp: number) => testEnv.DB.prepare('UPDATE pets SET xp = ? WHERE serial = ?').bind(xp, serial).run()

type SyncBody = {
  xp: number
  level: number
  heartsLeft: number
  waves: { from: number; name: string | null }[]
  rank?: { pos: number; total: number; above: { serial: number; name: string | null; tier: string; xp: number } | null } | null
  latest: string
}

describe('POST /api/wave', () => {
  it('delivers a wave and gives no xp', async () => {
    const a = await hatchPet(1)
    const b = await hatchPet(2)
    await testEnv.DB.prepare('UPDATE pets SET name = ? WHERE serial = ?').bind('Bee', b.serial).run()
    const res = await wave(a, b.serial)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, to: { serial: b.serial, name: 'Bee' } })
    const xp = await testEnv.DB.prepare('SELECT xp FROM pets WHERE serial IN (?, ?)').bind(a.serial, b.serial).all<{ xp: number }>()
    expect(xp.results.map(r => r.xp)).toEqual([0, 0])
  })

  it('rejects a wave at yourself', async () => {
    const a = await hatchPet(1)
    const res = await wave(a, a.serial)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'self_wave' })
  })

  it('waves at bots like at any pet, within the per-target limit', async () => {
    const a = await hatchPet(1)
    await insertPet({ serial: 501, is_bot: 1, name: 'Bot' })
    const res = await wave(a, 501)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, to: { serial: 501, name: 'Bot' } })
    const row = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM waves WHERE to_serial = 501').first<{ n: number }>()
    expect(row?.n).toBe(1)
    const again = await wave(a, 501, T0 + 1000)
    expect(again.status).toBe(429)
    expect(await again.json()).toEqual({ error: 'already_waved', retryAt: MIDNIGHT + DAY_MS })
  })

  it('answers 404 for unknown and hidden targets', async () => {
    const a = await hatchPet(1)
    await insertPet({ serial: 500, is_hidden: 1 })
    await insertPet({ serial: 502, is_hidden: 1, is_bot: 1 })
    for (const to of [999, 500, 502]) {
      const res = await wave(a, to)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
    }
  })

  it('rejects a bad target and a bad token', async () => {
    const a = await hatchPet(1)
    expect((await wave(a, 'x')).status).toBe(400)
    expect((await wave(a, 0)).status).toBe(400)
    const b = await hatchPet(2)
    const bad = await wave(a, b.serial, T0, 'A'.repeat(43))
    expect(bad.status).toBe(401)
    expect((await wave({ ...a, serial: 777 }, b.serial)).status).toBe(401)
  })

  it('allows 10 waves a UTC day, then answers 429 until midnight', async () => {
    const a = await hatchPet(1)
    for (let i = 0; i < 10; i++) await insertPet({ serial: 100 + i })
    for (let i = 0; i < 10; i++) expect((await wave(a, 100 + i)).status).toBe(200)
    await insertPet({ serial: 200 })
    const res = await wave(a, 200)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'wave_limit', retryAt: MIDNIGHT + DAY_MS })
    expect((await wave(a, 200, MIDNIGHT + DAY_MS)).status).toBe(200)
  })

  it('allows one wave per target per day', async () => {
    const a = await hatchPet(1)
    const b = await hatchPet(2)
    expect((await wave(a, b.serial)).status).toBe(200)
    const again = await wave(a, b.serial, T0 + 1000)
    expect(again.status).toBe(429)
    expect(await again.json()).toEqual({ error: 'already_waved', retryAt: MIDNIGHT + DAY_MS })
    expect((await wave(a, b.serial, MIDNIGHT + DAY_MS)).status).toBe(200)
  })

  it('lets only one of two concurrent waves at the same target win', async () => {
    const a = await hatchPet(1)
    const b = await hatchPet(2)
    const [x, y] = await Promise.all([wave(a, b.serial), wave(a, b.serial)])
    expect([x.status, y.status].sort()).toEqual([200, 429])
  })
})

describe('POST /api/sync social fields', () => {
  it('returns each wave once, oldest first, then an empty list', async () => {
    const a = await hatchPet(1)
    const b = await hatchPet(2)
    const c = await hatchPet(3)
    await testEnv.DB.prepare('UPDATE pets SET name = ? WHERE serial = ?').bind('Bee', b.serial).run()
    await wave(b, a.serial, T0)
    await wave(c, a.serial, T0 + 1)
    const first = (await (await sync(a, T0 + 60_000)).json()) as SyncBody
    expect(first.waves).toEqual([
      { from: b.serial, name: 'Bee' },
      { from: c.serial, name: null },
    ])
    const second = (await (await sync(a, T0 + 120_000)).json()) as SyncBody
    expect(second.waves).toEqual([])
  })

  it('delivers at most 5 waves per sync and the rest on the next', async () => {
    const a = await hatchPet(1)
    for (let i = 0; i < 7; i++) {
      await insertPet({ serial: 100 + i })
      await testEnv.DB.prepare('INSERT INTO waves (from_serial, to_serial, created_at) VALUES (?, ?, ?)').bind(100 + i, a.serial, T0 + i).run()
    }
    const first = (await (await sync(a, T0 + 60_000)).json()) as SyncBody
    expect(first.waves.map(w => w.from)).toEqual([100, 101, 102, 103, 104])
    const second = (await (await sync(a, T0 + 120_000)).json()) as SyncBody
    expect(second.waves.map(w => w.from)).toEqual([105, 106])
  })

  it('skips waves from pets that were hidden since', async () => {
    const a = await hatchPet(1)
    const b = await hatchPet(2)
    await wave(b, a.serial)
    await testEnv.DB.prepare('UPDATE pets SET is_hidden = 1 WHERE serial = ?').bind(b.serial).run()
    expect(((await (await sync(a, T0 + 60_000)).json()) as SyncBody).waves).toEqual([])
  })

  it('reports rank position, total and the pet above, none for #1', async () => {
    const a = await hatchPet(1)
    const b = await hatchPet(2)
    const c = await hatchPet(3)
    await insertPet({ serial: 400, xp: 5000, is_hidden: 1 })
    await insertPet({ serial: 401, xp: 50, is_bot: 1, name: 'Bot' })
    await setXp(a.serial, 100)
    await setXp(b.serial, 100)
    await setXp(c.serial, 300)
    // Order: c 300, a 100, b 100 (tie by serial), bot 50. The hidden pet does not count.
    await testEnv.DB.prepare("UPDATE counters SET value = 4 WHERE name = 'hatched'").run()
    const rb = (await (await syncRank(b, T0 + 60_000)).json()) as SyncBody
    expect(rb.rank).toEqual({ pos: 3, total: 4, above: { serial: a.serial, name: null, tier: expect.any(String), xp: 100 } })
    const rc = (await (await syncRank(c, T0 + 60_000)).json()) as SyncBody
    expect(rc.rank).toEqual({ pos: 1, total: 4, above: null })
    const ra = (await (await syncRank(a, T0 + 60_000)).json()) as SyncBody
    expect(ra.rank?.pos).toBe(2)
    expect(ra.rank?.above?.serial).toBe(c.serial)
  })

  it('takes the rank total from the hatched counter and never below the position', async () => {
    const a = await hatchPet(1)
    await setXp(a.serial, 10)
    await insertPet({ serial: 300, xp: 500 })
    await insertPet({ serial: 301, xp: 400 })
    await testEnv.DB.prepare("UPDATE counters SET value = 50 WHERE name = 'hatched'").run()
    expect(((await (await syncRank(a, T0 + 60_000)).json()) as SyncBody).rank?.total).toBe(50)
    await testEnv.DB.prepare("UPDATE counters SET value = 1 WHERE name = 'hatched'").run()
    expect(((await (await syncRank(a, T0 + 120_000)).json()) as SyncBody).rank).toMatchObject({ pos: 3, total: 3 })
  })

  it('computes rank only when the client asks for it', async () => {
    const a = await hatchPet(1)
    const none = (await (await sync(a, T0 + 60_000)).json()) as Record<string, unknown>
    expect(Object.keys(none).sort()).toEqual(['heartsLeft', 'latest', 'level', 'waves', 'xp'])
    const falsy = (await (await sync(a, T0 + 120_000, { v: '0.2.0', rank: 'yes' })).json()) as Record<string, unknown>
    expect('rank' in falsy).toBe(false)
    const asked = (await (await syncRank(a, T0 + 180_000)).json()) as Record<string, unknown>
    expect(Object.keys(asked).sort()).toEqual(['heartsLeft', 'latest', 'level', 'rank', 'waves', 'xp'])
    const v3 = (await (await sync(a, T0 + 240_000, { v: '0.3.0' })).json()) as Record<string, unknown>
    expect(Object.keys(v3).sort()).toEqual(['heartsLeft', 'invites', 'latest', 'level', 'unlocked', 'waves', 'weekWin', 'xp'])
  })

  it('answers rank: null for a hidden pet', async () => {
    const a = await hatchPet(1)
    await testEnv.DB.prepare('UPDATE pets SET is_hidden = 1 WHERE serial = ?').bind(a.serial).run()
    const body = (await (await syncRank(a, T0 + 60_000)).json()) as SyncBody
    expect(body.rank).toBeNull()
  })

  it('treats a client without v as 0.1.0: old fields and latest only, waves stay undelivered', async () => {
    const a = await hatchPet(1)
    const b = await hatchPet(2)
    await wave(b, a.serial)
    const old = (await (await sync(a, T0 + 60_000, {})).json()) as Record<string, unknown>
    expect(Object.keys(old).sort()).toEqual(['heartsLeft', 'latest', 'level', 'xp'])
    expect(old.latest).toBe(testEnv.LATEST_VERSION)
    const row = await testEnv.DB.prepare('SELECT delivered FROM waves WHERE to_serial = ?').bind(a.serial).first<{ delivered: number }>()
    expect(row?.delivered).toBe(0)
    // Even with a rank flag: without v nothing social is computed.
    const flagged = (await (await sync(a, T0 + 120_000, { rank: true })).json()) as Record<string, unknown>
    expect('rank' in flagged || 'waves' in flagged).toBe(false)
    const updated = (await (await sync(a, T0 + 180_000)).json()) as SyncBody
    expect(updated.waves).toEqual([{ from: b.serial, name: null }])
  })

  it('keeps xp, level and heartsLeft as integers for old clients, and returns latest', async () => {
    const a = await hatchPet(1)
    const body = (await (await sync(a, T0, {})).json()) as SyncBody
    for (const k of ['xp', 'level', 'heartsLeft'] as const) expect(Number.isInteger(body[k])).toBe(true)
    expect(body.latest).toBe(testEnv.LATEST_VERSION)
  })
})
