import { beforeEach, describe, expect, it } from 'vitest'
import { DAY_MS, type HatchResult } from '../src/routes/hatch'
import { call, hatchPet, insertPet, resetDb, T0, testEnv } from './helpers'

beforeEach(resetDb)

const MIDNIGHT = Math.floor(T0 / DAY_MS) * DAY_MS
const wave = (pet: HatchResult, to: unknown, now = T0, token = pet.token) =>
  call('/api/wave', { body: { serial: pet.serial, token, to }, now })
const sync = (pet: HatchResult, now = T0) => call('/api/sync', { body: { serial: pet.serial, token: pet.token, events: [] }, now })
const setXp = (serial: number, xp: number) => testEnv.DB.prepare('UPDATE pets SET xp = ? WHERE serial = ?').bind(xp, serial).run()

type SyncBody = {
  xp: number
  level: number
  heartsLeft: number
  waves: { from: number; name: string | null }[]
  rank: { pos: number; total: number; above: { serial: number; name: string | null; tier: string; xp: number } | null }
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

  it('answers 404 for unknown, hidden and bot targets', async () => {
    const a = await hatchPet(1)
    await insertPet({ serial: 500, is_hidden: 1 })
    await insertPet({ serial: 501, is_bot: 1 })
    for (const to of [999, 500, 501]) {
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
    const rb = (await (await sync(b, T0 + 60_000)).json()) as SyncBody
    expect(rb.rank).toEqual({ pos: 3, total: 4, above: { serial: a.serial, name: null, tier: expect.any(String), xp: 100 } })
    const rc = (await (await sync(c, T0 + 60_000)).json()) as SyncBody
    expect(rc.rank).toEqual({ pos: 1, total: 4, above: null })
    const ra = (await (await sync(a, T0 + 60_000)).json()) as SyncBody
    expect(ra.rank.pos).toBe(2)
    expect(ra.rank.above?.serial).toBe(c.serial)
  })

  it('keeps xp, level and heartsLeft as integers for old clients, and returns latest', async () => {
    const a = await hatchPet(1)
    const body = (await (await sync(a)).json()) as SyncBody
    for (const k of ['xp', 'level', 'heartsLeft'] as const) expect(Number.isInteger(body[k])).toBe(true)
    expect(body.latest).toBe('0.2.0')
    expect(Object.keys(body).sort()).toEqual(['heartsLeft', 'latest', 'level', 'rank', 'waves', 'xp'])
  })
})
