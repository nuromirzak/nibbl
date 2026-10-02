import { beforeEach, describe, expect, it } from 'vitest'
import type { Board } from '../src/cron'
import { call, insertPet, resetDb } from './helpers'

beforeEach(resetDb)

type Rank = { rank: number; serial: number }

describe('GET /api/rank/:serial', () => {
  it('matches the leaderboard rank and exposes only public fields', async () => {
    await insertPet({ serial: 1, xp: 100 })
    await insertPet({ serial: 2, xp: 300, is_bot: 1, name: 'Bot', label: 'night coder', genesis: 1 })
    await insertPet({ serial: 3, xp: 200 })
    const board = (await (await call('/api/leaderboard')).json()) as Board
    const res = await call('/api/rank/2')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=60')
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual(board.entries.find(e => e.serial === 2))
    expect(Object.keys(body).sort()).toEqual(['genesis', 'label', 'level', 'name', 'rank', 'seed', 'serial', 'shiny', 'tier', 'xp'])
  })

  it('gives an absolute rank to a pet outside the top 100', async () => {
    for (let i = 1; i <= 105; i++) await insertPet({ serial: i, xp: 1000 - i })
    expect(((await (await call('/api/rank/105')).json()) as Rank).rank).toBe(105)
    expect(((await (await call('/api/rank/1')).json()) as Rank).rank).toBe(1)
  })

  it('breaks xp ties by lower serial and skips hidden pets', async () => {
    await insertPet({ serial: 5, xp: 50 })
    await insertPet({ serial: 3, xp: 50 })
    await insertPet({ serial: 4, xp: 999, is_hidden: 1 })
    await insertPet({ serial: 9, xp: 50 })
    expect(((await (await call('/api/rank/3')).json()) as Rank).rank).toBe(1)
    expect(((await (await call('/api/rank/5')).json()) as Rank).rank).toBe(2)
    expect(((await (await call('/api/rank/9')).json()) as Rank).rank).toBe(3)
  })

  it('answers 404 for hidden and unknown pets', async () => {
    await insertPet({ serial: 4, xp: 10, is_hidden: 1 })
    for (const s of ['4', '000004', '77']) {
      const res = await call(`/api/rank/${s}`)
      expect(res.status, s).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
    }
  })

  it('answers 400 for malformed serials', async () => {
    for (const s of ['abc', '0', '0000000', '1234567', '-1', '1.5', '']) {
      const res = await call(`/api/rank/${s}`)
      expect(res.status, s).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_serial' })
    }
  })

  it('is GET only', async () => {
    expect((await call('/api/rank/1', { method: 'POST', body: {} })).status).toBe(405)
  })
})
