import { genome, genomeKey, HOUR_MS, levelFromXp, visualKey, type Tier } from '@nibbl/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOT_CATCH_UP_HOURS, BOTS, botHourCounts, MAX_HOURLY_XP, SEED_LAUNCH_AT, seedXpBudget, xpForCounts } from '../src/bots'
import { BOT_MAX_SERIAL, BOT_ROWS_SQL, growBots, runCron } from '../src/cron'
import type { Env } from '../src/env'
import { checkText, LABEL_MAX, NAME_MAX } from '../src/lib/filter'
import type { PetRow } from '../src/lib/db'
import { call, hatchPet, resetDb, T0, testEnv } from './helpers'

const LAUNCH_AT = Date.parse('2026-10-31T00:00:00Z')
const DAY = 24 * HOUR_MS

const seedBots = async () => {
  const migration = testEnv.TEST_MIGRATIONS.find(m => m.name.startsWith('0002'))
  if (!migration) throw new Error('0002 bot migration missing')
  for (const q of migration.queries) await testEnv.DB.prepare(q).run()
}

const bots = async () =>
  (await testEnv.DB.prepare('SELECT * FROM pets WHERE is_bot = 1 ORDER BY serial').all<PetRow>()).results

beforeEach(async () => {
  await resetDb()
  await seedBots()
})

describe('seeded bots', () => {
  it('derives each seed from sha256("nibbl-bot:" + serial), not by hand', async () => {
    for (const b of BOTS) {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nibbl-bot:${b.serial}`)))
      expect(b.seed, `bot ${b.serial}`).toBe(new DataView(digest.buffer).getUint32(0))
    }
  })

  it('gives every bot a distinct genome and visual key', () => {
    const genomes = BOTS.map(b => genome(b.seed, b.tier, b.shiny))
    expect(new Set(genomes.map(genomeKey)).size).toBe(BOTS.length)
    expect(new Set(genomes.map(visualKey)).size).toBe(BOTS.length)
  })

  it('seeds 12 bots with varied tiers, one shiny, all genesis, levels 9-25', async () => {
    const rows = await bots()
    expect(rows).toHaveLength(12)
    expect(rows.filter(r => r.shiny === 1)).toHaveLength(1)
    expect(rows.every(r => r.genesis === 1)).toBe(true)
    expect(new Set(rows.map(r => r.tier)).size).toBe(5)
    for (const r of rows) {
      expect(r.level).toBeGreaterThanOrEqual(9)
      expect(r.level).toBeLessThanOrEqual(25)
      expect(r.level).toBe(levelFromXp(r.xp).level)
      expect(checkText(r.name, NAME_MAX)).toEqual({ ok: true, value: r.name })
      expect(checkText(r.label, LABEL_MAX)).toEqual({ ok: true, value: r.label })
    }
  })

  it('hatches bots as a closed-beta cohort 30-75 days before launch, in serial order', async () => {
    expect(SEED_LAUNCH_AT).toBe(LAUNCH_AT)
    const rows = await bots()
    for (let i = 0; i < rows.length; i++) {
      const at = rows[i]!.hatched_at
      expect(at).toBeGreaterThanOrEqual(LAUNCH_AT - 75 * DAY)
      expect(at).toBeLessThanOrEqual(LAUNCH_AT - 30 * DAY)
      expect(at % HOUR_MS).not.toBe(0)
      expect(at % 60_000).toBe(0)
      if (i > 0) expect(at).toBeGreaterThan(rows[i - 1]!.hatched_at)
    }
  })

  it('seeds only xp a pet could have earned since hatching at 10 xp/h', async () => {
    for (const r of await bots()) expect(r.xp).toBeLessThanOrEqual(seedXpBudget(r.hatched_at))
  })

  it('matches current core keys (regenerate 0002 if core changed)', async () => {
    for (const r of await bots()) {
      const g = genome(r.seed, r.tier as Tier, r.shiny === 1)
      expect(r.genome_key).toBe(genomeKey(g))
      expect(r.visual_key).toBe(visualKey(g))
    }
  })

  it('moves the serial counter past the bots without counting them as hatched', async () => {
    expect((await hatchPet(1)).serial).toBe(13)
    expect(await (await call('/api/stats')).json()).toEqual({ hatched: 1 })
  })

  it('cannot be driven with any token', async () => {
    const res = await call('/api/sync', { body: { serial: 1, token: 'A'.repeat(43), events: [] } })
    expect(res.status).toBe(401)
  })
})

describe('bot growth', () => {
  it('never exceeds the player caps in any hour', () => {
    for (const bot of BOTS) {
      for (let h = 490_000; h < 490_000 + 24 * 30; h++) expect(xpForCounts(botHourCounts(bot, h))).toBeLessThanOrEqual(MAX_HOURLY_XP)
    }
    expect(MAX_HOURLY_XP).toBe(130)
  })

  it('grows like a steady human over a week', () => {
    for (const bot of BOTS) {
      let week = 0
      for (let h = 490_000; h < 490_000 + 24 * 7; h++) week += xpForCounts(botHourCounts(bot, h))
      expect(week).toBeGreaterThan(100)
      expect(week).toBeLessThan(2000)
    }
  })

  it('applies each completed hour once', async () => {
    const hour = Math.floor(T0 / HOUR_MS) - 1
    await testEnv.DB.prepare("UPDATE counters SET value = ? WHERE name = 'bot_hour'").bind(hour - 2).run()
    const before = new Map((await bots()).map(r => [r.serial, r.xp]))
    expect(await growBots(testEnv.DB, T0)).toBe(2)
    for (const r of await bots()) {
      const spec = BOTS.find(b => b.serial === r.serial)!
      const gain = xpForCounts(botHourCounts(spec, hour - 1)) + xpForCounts(botHourCounts(spec, hour))
      expect(r.xp).toBe(before.get(r.serial)! + gain)
      expect(r.level).toBe(levelFromXp(r.xp).level)
      if (gain > 0) expect(r.last_sync_at).toBe((hour + 1) * HOUR_MS)
    }
    expect(await growBots(testEnv.DB, T0)).toBe(0)
  })

  it('reads the 12 bots through the primary key, not a table scan', async () => {
    const { results } = await testEnv.DB.prepare(BOT_ROWS_SQL).bind(BOT_MAX_SERIAL).all<{ serial: number }>()
    expect(results.map(r => r.serial)).toEqual(BOTS.map(b => b.serial))
    const plan = await testEnv.DB.prepare(`EXPLAIN QUERY PLAN ${BOT_ROWS_SQL}`).bind(BOT_MAX_SERIAL).all<{ detail: string }>()
    expect(plan.results.map(r => r.detail).join(' | ')).toMatch(/SEARCH pets USING INTEGER PRIMARY KEY/)
  })

  it('prunes hatch_ip through the last_at index', async () => {
    const plan = await testEnv.DB.prepare('EXPLAIN QUERY PLAN DELETE FROM hatch_ip WHERE last_at < ?').bind(T0).all<{ detail: string }>()
    expect(plan.results.map(r => r.detail).join(' | ')).toMatch(/USING (COVERING )?INDEX hatch_ip_last/)
  })

  it('caps catch-up after an outage and skips retired bots', async () => {
    await testEnv.DB.prepare('UPDATE pets SET is_hidden = 1 WHERE serial = 1').run()
    const before = new Map((await bots()).map(r => [r.serial, r.xp]))
    expect(await growBots(testEnv.DB, T0)).toBe(BOT_CATCH_UP_HOURS)
    for (const r of await bots()) {
      const gain = r.xp - before.get(r.serial)!
      if (r.serial === 1) expect(gain).toBe(0)
      expect(gain).toBeLessThanOrEqual(BOT_CATCH_UP_HOURS * MAX_HOURLY_XP)
    }
  })
})

describe('runCron step isolation', () => {
  it('runs the other steps when one throws, then rethrows without leaking details', async () => {
    const failing = new Proxy(testEnv.DB, {
      get(target, prop) {
        if (prop === 'prepare') {
          return (sql: string) => {
            if (sql.startsWith('DELETE FROM hatch_ip')) throw new Error('boom hatch_ip')
            return target.prepare(sql)
          }
        }
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as D1Database
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const before = new Map((await bots()).map(r => [r.serial, r.xp]))

    await expect(runCron({ ...testEnv, DB: failing } as Env, T0)).rejects.toThrow(/hatch_ip/)

    const cached = await testEnv.DB.prepare('SELECT built_at FROM leaderboard_cache WHERE id = 1').first<{ built_at: number }>()
    expect(cached?.built_at).toBe(T0)
    expect((await bots()).some(r => r.xp > before.get(r.serial)!)).toBe(true)
    expect(log).toHaveBeenCalled()
    for (const c of log.mock.calls) expect(c.every(a => typeof a === 'string')).toBe(true)
    log.mockRestore()
  })
})
