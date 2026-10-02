import { levelFromXp } from '@nibbl/core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { HatchResult } from '../src/routes/hatch'
import { call, hatchPet, petRow, resetDb, T0, testEnv } from './helpers'

beforeEach(resetDb)

const MIN = 60_000
const HOUR = 60 * MIN

const sync = (pet: HatchResult, events: unknown, now: number, token = pet.token) =>
  call('/api/sync', { body: { serial: pet.serial, token, events }, now })

const ev = (type: string, at: number, n = 1) => Array.from({ length: n }, () => ({ type, at }))

describe('POST /api/sync', () => {
  it('scores events and stores xp and level', async () => {
    const pet = await hatchPet(1, { now: T0 - HOUR })
    const res = await sync(pet, [...ev('turn', T0 - 10 * MIN, 3), ...ev('commit', T0 - 5 * MIN)], T0 + MIN)
    expect(res.status).toBe(200)
    const xp = 3 * 3 + 2
    expect(await res.json()).toEqual({ xp, level: levelFromXp(xp).level, heartsLeft: 5 })
    const row = await petRow(pet.serial)
    expect(row.xp).toBe(xp)
    expect(row.level).toBe(levelFromXp(xp).level)
    expect(row.last_sync_at).toBe(T0 + MIN)
  })

  it('caps pets at 5 per hour and reports hearts left', async () => {
    const pet = await hatchPet(1)
    const body = await (await sync(pet, ev('pet', T0 + 5 * MIN, 8), T0 + 10 * MIN)).json()
    expect(body).toMatchObject({ xp: 10, heartsLeft: 0 })
  })

  it('caps every event type per hour', async () => {
    const pet = await hatchPet(1)
    const events = [...ev('turn', T0 + MIN, 25), ...ev('check_pass', T0 + MIN, 25), ...ev('commit', T0 + MIN, 15), ...ev('error', T0 + MIN, 5)]
    const body = (await (await sync(pet, events, T0 + 20 * MIN)).json()) as { xp: number }
    expect(body.xp).toBe(20 * 3 + 20 * 2 + 10 * 2)
  })

  it('never scores events from before the pet hatched', async () => {
    const pet = await hatchPet(1, { now: T0 - MIN })
    const backdated = Array.from({ length: 24 }, (_, k) => ev('turn', T0 - (k + 1) * HOUR, 20)).flat()
    const body = (await (await sync(pet, [...backdated, ...ev('turn', T0 - 30_000)], T0)).json()) as { xp: number }
    expect(body.xp).toBe(3)
  })

  it('scores events up to 5 min ahead of the server clock and drops later ones', async () => {
    const pet = await hatchPet(1)
    const ahead = (await (await sync(pet, ev('turn', T0 + 3 * MIN), T0 + MIN)).json()) as { xp: number }
    expect(ahead.xp).toBe(3)
    const pet2 = await hatchPet(2)
    const far = (await (await sync(pet2, ev('turn', T0 + 11 * MIN), T0 + MIN)).json()) as { xp: number }
    expect(far.xp).toBe(0)
  })

  it('ignores future events, junk and events older than the first-sync lookback', async () => {
    const pet = await hatchPet(1)
    const events = [
      ...ev('turn', T0 + 2 * HOUR),
      ...ev('turn', T0 - 25 * HOUR),
      { type: 'hack', at: T0 },
      { type: 'turn', at: 'yesterday' },
      null,
      42,
    ]
    const body = (await (await sync(pet, events, T0)).json()) as { xp: number }
    expect(body.xp).toBe(0)
  })

  it('replays after prune: resent events never add XP twice', async () => {
    const pet = await hatchPet(1)
    const pets = ev('pet', T0 + 30 * MIN, 5)
    expect(((await (await sync(pet, pets, T0 + 40 * MIN)).json()) as { xp: number }).xp).toBe(10)
    // The mod lost the response and resends the same queue later.
    expect(((await (await sync(pet, pets, T0 + 2 * HOUR + 40 * MIN)).json()) as { xp: number }).xp).toBe(10)
    expect(((await (await sync(pet, pets, T0 + 6 * HOUR)).json()) as { xp: number }).xp).toBe(10)
    // Far past the grace window the events are dropped and the old window row is gone.
    const late = T0 + 10 * HOUR
    expect(((await (await sync(pet, pets, late)).json()) as { xp: number }).xp).toBe(10)
    const oldest = Math.floor((late - 3 * HOUR) / HOUR)
    const stale = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM xp_windows WHERE serial = ? AND hour < ?')
      .bind(pet.serial, oldest)
      .first<number>('n')
    expect(stale).toBe(0)
  })

  it('refuses a second sync within 30 s and a clock behind the last sync', async () => {
    const pet = await hatchPet(1)
    expect((await sync(pet, [], T0 + MIN)).status).toBe(200)
    expect((await sync(pet, [], T0 + MIN + 10_000)).status).toBe(429)
    expect((await sync(pet, [], T0)).status).toBe(429)
    expect((await petRow(pet.serial)).last_sync_at).toBe(T0 + MIN)
  })

  it('checks the token', async () => {
    const pet = await hatchPet(1)
    const wrong = `${pet.token.slice(0, 42)}${pet.token.endsWith('A') ? 'B' : 'A'}`
    expect((await sync(pet, [], T0, wrong)).status).toBe(401)
    expect((await call('/api/sync', { body: { serial: 999, token: pet.token, events: [] } })).status).toBe(401)
    expect((await sync(pet, [], T0, 'short')).status).toBe(400)
  })

  it('accepts the rotated token after a re-hatch and rejects the old one', async () => {
    const a = await hatchPet(1)
    const b = await hatchPet(1, { now: T0 + 1000 })
    expect((await sync(a, [], T0 + MIN)).status).toBe(401)
    expect((await sync(b, [], T0 + MIN)).status).toBe(200)
  })

  it('rejects bodies over 64 KB and more than 1000 events', async () => {
    const pet = await hatchPet(1)
    const big = await call('/api/sync', { rawBody: JSON.stringify({ serial: pet.serial, token: pet.token, pad: 'x'.repeat(70_000) }) })
    expect(big.status).toBe(413)
    const many = await sync(pet, ev('turn', T0, 1001), T0)
    expect(many.status).toBe(413)
    expect(await many.json()).toEqual({ error: 'too_many_events' })
    expect((await sync(pet, 'nope', T0)).status).toBe(400)
  })
})
