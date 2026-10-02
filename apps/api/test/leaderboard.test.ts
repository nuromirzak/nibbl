import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { LEADERBOARD_SIZE, type Board } from '../src/cron'
import worker from '../src/index'
import { call, hatchPet, insertPet, resetDb, T0, testEnv } from './helpers'

beforeEach(resetDb)

const runScheduled = async (now: number) => {
  const ctx = createExecutionContext()
  await worker.scheduled(createScheduledController({ scheduledTime: now, cron: '*/5 * * * *' }), testEnv, ctx)
  await waitOnExecutionContext(ctx)
}

const board = async () => (await (await call('/api/leaderboard')).json()) as Board

describe('leaderboard', () => {
  it('lists the top 100 by xp, ties by serial, from the cron-built cache', async () => {
    for (let i = 1; i <= 105; i++) await insertPet({ serial: i, xp: (i % 50) * 10, name: `pet${i}` })
    await runScheduled(T0)
    const b = await board()
    expect(b.builtAt).toBe(T0)
    expect(b.entries).toHaveLength(LEADERBOARD_SIZE)
    expect(b.entries[0]).toMatchObject({ rank: 1, serial: 49, xp: 490 })
    expect(b.entries[1]).toMatchObject({ rank: 2, serial: 99, xp: 490 })
    const xps = b.entries.map(e => e.xp)
    expect([...xps].sort((x, y) => y - x)).toEqual(xps)
  })

  it('excludes hidden pets and never exposes is_bot', async () => {
    await insertPet({ serial: 1, xp: 100, is_hidden: 1 })
    await insertPet({ serial: 2, xp: 50, is_bot: 1, name: 'Bot' })
    await runScheduled(T0)
    const b = await board()
    expect(b.entries.map(e => e.serial)).toEqual([2])
    expect(Object.keys(b.entries[0]).sort()).toEqual(['genesis', 'label', 'level', 'name', 'rank', 'seed', 'serial', 'shiny', 'tier', 'xp'])
  })

  it('serves the cache until the next rebuild', async () => {
    await insertPet({ serial: 1, xp: 10 })
    await runScheduled(T0)
    await insertPet({ serial: 2, xp: 9999 })
    expect((await board()).entries.map(e => e.serial)).toEqual([1])
    await runScheduled(T0 + 300_000)
    expect((await board()).entries.map(e => e.serial)).toEqual([2, 1])
  })

  it('builds the cache on demand before the first cron run', async () => {
    await insertPet({ serial: 1, xp: 10 })
    const res = await call('/api/leaderboard')
    expect(res.headers.get('cache-control')).toBe('public, max-age=60')
    expect(((await res.json()) as Board).entries).toHaveLength(1)
  })

  it('cron deletes hatch_ip rows older than 48 h', async () => {
    await testEnv.DB.prepare('INSERT INTO hatch_ip (ip_hash, count, last_at) VALUES (?, 1, ?), (?, 1, ?)')
      .bind('old', T0 - 49 * 3_600_000, 'new', T0 - 3_600_000)
      .run()
    await runScheduled(T0)
    const { results } = await testEnv.DB.prepare('SELECT ip_hash FROM hatch_ip').all<{ ip_hash: string }>()
    expect(results.map(r => r.ip_hash)).toEqual(['new'])
  })
})

describe('stats', () => {
  it('counts real hatches only', async () => {
    await insertPet({ serial: 900, is_bot: 1 })
    await hatchPet(1)
    await hatchPet(2)
    const res = await call('/api/stats')
    expect(res.headers.get('cache-control')).toBe('public, max-age=30')
    expect(await res.json()).toEqual({ hatched: 2 })
  })
})
