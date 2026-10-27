import { genome, inheritsMark, type Tier } from '@nibbl/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { countActive } from '../src/cron'
import { atLeast } from '../src/lib/retention'
import { candidates } from '../src/lib/roll'
import type { HatchResult } from '../src/routes/hatch'
import { call, hatchPet, insertPet, machine, petRow, resetDb, T0, testEnv } from './helpers'

beforeEach(resetDb)

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

type Egg = { milestone: number; status: string; code?: string; by?: { serial: number; name: string | null } }
const setLevel = (serial: number, level: number) => testEnv.DB.prepare('UPDATE pets SET level = ? WHERE serial = ?').bind(level, serial).run()
const eggs = async (pet: HatchResult, now = T0): Promise<Egg[]> =>
  ((await (await call('/api/gift', { body: { serial: pet.serial, token: pet.token }, now })).json()) as { eggs: Egg[] }).eggs
const giftHatch = (n: number, gift: unknown, ip = `198.51.100.${n}`) => call('/api/hatch', { body: { machineHash: machine(n), gift }, ip })
const sync = (pet: HatchResult, now: number, extra: Record<string, unknown> = { v: '0.4.0' }) =>
  call('/api/sync', { body: { serial: pet.serial, token: pet.token, events: [], ...extra }, now })
const parentGenome = async (serial: number) => {
  const p = await petRow(serial)
  return genome(p.seed, p.tier as Tier, p.shiny === 1)
}
const readyParent = async (n = 1, level = 10) => {
  const a = await hatchPet(n, { now: T0 - HOUR })
  await setLevel(a.serial, level)
  return a
}

describe('atLeast', () => {
  it('gates by version: absent old, unparseable new', () => {
    expect(atLeast(undefined, '0.4.0')).toBe(false)
    expect(atLeast('0.3.9', '0.4.0')).toBe(false)
    expect(atLeast('0.4.0', '0.4.0')).toBe(true)
    expect(atLeast('v1.0.0', '0.4.0')).toBe(true)
    expect(atLeast('dev', '0.4.0')).toBe(true)
  })
})

describe('sync fields by version', () => {
  it('0.3.0 keeps the old waves, invites and no active; 0.4.0 gains the new fields', async () => {
    const a = await hatchPet(1, { now: T0 - HOUR })
    const b = await hatchPet(2, { now: T0 - HOUR })
    await testEnv.DB.prepare('UPDATE pets SET name = ?, level = 7 WHERE serial = ?').bind('Wavy', b.serial).run()
    await testEnv.DB.prepare("UPDATE counters SET value = 5 WHERE name = 'active_24h'").run()
    const send = () => call('/api/wave', { body: { serial: b.serial, token: b.token, to: a.serial }, now: T0 })
    await send()
    const old = (await (await sync(a, T0, { v: '0.3.0' })).json()) as Record<string, unknown>
    expect(old.waves).toEqual([{ from: b.serial, name: 'Wavy' }])
    expect(old).not.toHaveProperty('active')
    // Waves are delivered once, so queue another for the new client.
    await testEnv.DB.prepare('INSERT INTO waves (from_serial, to_serial, created_at) VALUES (?, ?, ?)').bind(b.serial, a.serial, T0).run()
    const bp = await petRow(b.serial)
    const fresh = (await (await sync(a, T0 + MIN, { v: '0.4.0' })).json()) as { waves: unknown[]; active: number; invites: unknown[] }
    expect(fresh.waves[0]).toEqual({ from: b.serial, name: 'Wavy', seed: bp.seed, tier: bp.tier, shiny: bp.shiny === 1, level: 7 })
    expect(fresh.active).toBe(5)
  })

  it('legacy invites: plain shape for 0.3.0, gift false for 0.4.0', async () => {
    const a = await hatchPet(1, { now: T0 - HOUR })
    const b = (await (await call('/api/hatch', { body: { machineHash: machine(2), invite: a.serial }, ip: '198.51.100.2' })).json()) as HatchResult
    const r3 = (await (await sync(a, T0, { v: '0.3.0' })).json()) as { invites: unknown[] }
    expect(r3.invites).toEqual([{ serial: b.serial, name: null }])
    const c = (await (await call('/api/hatch', { body: { machineHash: machine(3), invite: a.serial }, ip: '198.51.100.3' })).json()) as HatchResult
    const r4 = (await (await sync(a, T0 + MIN, { v: '0.4.0' })).json()) as { invites: unknown[] }
    expect(r4.invites).toEqual([{ serial: c.serial, name: null, gift: false }])
  })
})

describe('countActive and stats', () => {
  it('counts real, visible, recently synced pets only', async () => {
    await insertPet({ serial: 1, last_sync_at: T0 - HOUR })
    await insertPet({ serial: 2, last_sync_at: T0 - 2 * DAY })
    await insertPet({ serial: 3, last_sync_at: T0 - HOUR, is_bot: 1 })
    await insertPet({ serial: 4, last_sync_at: T0 - HOUR, is_hidden: 1 })
    await insertPet({ serial: 5, last_sync_at: null })
    await insertPet({ serial: 6, last_sync_at: T0 - 23 * HOUR })
    await countActive(testEnv.DB, T0)
    const res = await call('/api/stats')
    expect(await res.json()).toEqual({ hatched: 0, active: 2 })
  })
})

describe('POST /api/gift', () => {
  it('locks below level 10, readies at 10 and unlocks the second at 25', async () => {
    const a = await hatchPet(1, { now: T0 - HOUR })
    expect(await eggs(a)).toEqual([{ milestone: 10, status: 'locked' }, { milestone: 25, status: 'locked' }])
    await setLevel(a.serial, 10)
    const ten = await eggs(a)
    expect(ten[0]).toMatchObject({ milestone: 10, status: 'ready' })
    expect(ten[0]!.code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/)
    expect(ten[1]).toEqual({ milestone: 25, status: 'locked' })
    await setLevel(a.serial, 25)
    const all = await eggs(a)
    expect(all.map(e => e.status)).toEqual(['ready', 'ready'])
    expect(all[0]!.code).not.toBe(all[1]!.code)
  })

  it('is deterministic and stores one row per egg', async () => {
    const a = await readyParent(1, 25)
    const first = await eggs(a)
    const second = await eggs(a)
    expect(second).toEqual(first)
    expect((await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM gift_codes').first<number>('n'))).toBe(2)
  })

  it('answers 401 for a bad token and 404 for a hidden pet', async () => {
    const a = await readyParent(1)
    expect((await call('/api/gift', { body: { serial: a.serial, token: 'x'.repeat(43) } })).status).toBe(401)
    await testEnv.DB.prepare('UPDATE pets SET is_hidden = 1 WHERE serial = ?').bind(a.serial).run()
    expect((await call('/api/gift', { body: { serial: a.serial, token: a.token } })).status).toBe(404)
  })
})

describe('hatch with a gift', () => {
  // A machine whose 96 candidates include one carrying the parent's mark.
  const matching = async (parent: ReturnType<typeof genome>) => {
    for (let n = 2; n < 200; n++) {
      const list = await candidates(testEnv.ROLL_SECRET, machine(n), 0, 96)
      if (list.some(c => inheritsMark(c, parent))) return n
    }
    throw new Error('no matching machine')
  }

  it('links, bonds both pets, queues a gift notice and inherits the parent mark', async () => {
    const a = await readyParent()
    const pg = await parentGenome(a.serial)
    const n = await matching(pg)
    const code = (await eggs(a))[0]!.code!
    const res = await giftHatch(n, code.toLowerCase())
    expect(res.status).toBe(200)
    const b = (await res.json()) as HatchResult
    const row = await petRow(b.serial)
    expect(row.seed).toBeGreaterThan(-1)
    expect(inheritsMark(genome(row.seed, row.tier as Tier, row.shiny === 1), pg)).toBe(true)
    expect((await testEnv.DB.prepare('SELECT invited_by FROM pets WHERE serial = ?').bind(b.serial).first<number>('invited_by'))).toBe(a.serial)
    const ach = async (s: number) => (await testEnv.DB.prepare("SELECT id FROM pet_achievements WHERE serial = ? AND id = 'friends'").bind(s).all()).results.length
    expect(await ach(a.serial)).toBe(1)
    expect(await ach(b.serial)).toBe(1)
    expect(await testEnv.DB.prepare('SELECT to_serial, from_serial, via_gift FROM invite_notices').first()).toEqual({ to_serial: a.serial, from_serial: b.serial, via_gift: 1 })
    const status = await eggs(a)
    expect(status[0]).toEqual({ milestone: 10, status: 'hatched', by: { serial: b.serial, name: null } })
    // The parent's next 0.4.0 sync reports the gift and the inherited mark.
    const s = (await (await sync(a, T0 + MIN)).json()) as { invites: { serial: number; gift: boolean; mark?: { motif: string; spot: string } }[] }
    expect(s.invites).toHaveLength(1)
    expect(s.invites[0]).toMatchObject({ serial: b.serial, gift: true, mark: { motif: pg.mark.motif, spot: pg.mark.spot } })
  })

  it('cannot be redeemed twice', async () => {
    const a = await readyParent()
    const code = (await eggs(a))[0]!.code!
    const b = (await (await giftHatch(2, code)).json()) as HatchResult
    const c = (await (await giftHatch(3, code)).json()) as HatchResult
    expect(c.serial).not.toBe(b.serial)
    expect((await testEnv.DB.prepare('SELECT invited_by FROM pets WHERE serial = ?').bind(c.serial).first<number | null>('invited_by'))).toBeNull()
    expect((await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM invite_notices').first<number>('n'))).toBe(1)
  })

  it('ignores the parent on the same machine, a hidden parent and an invalid code', async () => {
    const a = await readyParent()
    const code = (await eggs(a))[0]!.code!
    // Same machine as the parent: the machine is known, so it is a re-hatch of the parent itself.
    await testEnv.DB.prepare('UPDATE pets SET machine_hash = ? WHERE serial = ?').bind(machine(9), a.serial).run()
    const same = (await (await giftHatch(9, code)).json()) as HatchResult
    expect(same.serial).toBe(a.serial)
    expect((await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM gift_codes WHERE redeemed_by IS NOT NULL').first<number>('n'))).toBe(0)
    await testEnv.DB.prepare('UPDATE pets SET is_hidden = 1 WHERE serial = ?').bind(a.serial).run()
    const hidden = (await (await giftHatch(10, code)).json()) as HatchResult
    expect((await testEnv.DB.prepare('SELECT invited_by FROM pets WHERE serial = ?').bind(hidden.serial).first<number | null>('invited_by'))).toBeNull()
    await testEnv.DB.prepare('UPDATE pets SET is_hidden = 0 WHERE serial = ?').bind(a.serial).run()
    for (const [i, bad] of ['ZZZZZ-ZZZZZ', 'short', 42, null, {}].entries()) {
      const res = await giftHatch(20 + i, bad)
      expect(res.status).toBe(200)
      const r = (await res.json()) as HatchResult
      expect((await testEnv.DB.prepare('SELECT invited_by FROM pets WHERE serial = ?').bind(r.serial).first<number | null>('invited_by'))).toBeNull()
    }
    expect((await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM gift_codes WHERE redeemed_by IS NOT NULL').first<number>('n'))).toBe(0)
  })

  it('falls back to a normal pick when no candidate carries the mark', async () => {
    // Find a parent seed whose mark none of the 96 candidates of machine(2) carries.
    const list = await candidates(testEnv.ROLL_SECRET, machine(2), 0, 96)
    let seed = 0
    let g = genome(1, 'common', false)
    for (let s = 1; s < 5000; s++) {
      g = genome(s, 'common', false)
      if (!list.some(c => inheritsMark(c, g))) {
        seed = s
        break
      }
    }
    if (seed === 0) return // every mark appears among the candidates, nothing to fall back from
    const a = await readyParent()
    await testEnv.DB.prepare('UPDATE pets SET seed = ?, tier = ?, shiny = 0 WHERE serial = ?').bind(seed, 'common', a.serial).run()
    const code = (await eggs(a))[0]!.code!
    const b = (await (await giftHatch(2, code)).json()) as HatchResult
    expect((await testEnv.DB.prepare('SELECT invited_by FROM pets WHERE serial = ?').bind(b.serial).first<number>('invited_by'))).toBe(a.serial)
    expect((await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM invite_notices').first<number>('n'))).toBe(1)
  })

  it('the legacy serial invite still works', async () => {
    const a = await hatchPet(1, { now: T0 - HOUR })
    const b = (await (await call('/api/hatch', { body: { machineHash: machine(2), invite: a.serial }, ip: '198.51.100.2' })).json()) as HatchResult
    expect((await testEnv.DB.prepare('SELECT invited_by FROM pets WHERE serial = ?').bind(b.serial).first<number>('invited_by'))).toBe(a.serial)
    expect((await testEnv.DB.prepare('SELECT via_gift FROM invite_notices').first<number>('via_gift'))).toBe(0)
  })
})

describe('pet endpoint and card', () => {
  it('shows parent and eggsHatched, hides a hidden parent, and the card shows both lines', async () => {
    const a = await readyParent()
    await testEnv.DB.prepare('UPDATE pets SET name = ? WHERE serial = ?').bind('Mama', a.serial).run()
    const code = (await eggs(a))[0]!.code!
    const b = (await (await giftHatch(2, code)).json()) as HatchResult
    const pb = (await (await call(`/api/pet/${b.serial}`)).json()) as { parent: unknown; eggsHatched: number }
    expect(pb).toMatchObject({ parent: { serial: a.serial, name: 'Mama' }, eggsHatched: 0 })
    const pa = (await (await call(`/api/pet/${a.serial}`)).json()) as { parent: unknown; eggsHatched: number }
    expect(pa).toMatchObject({ parent: null, eggsHatched: 1 })
    const pad = String(a.serial).padStart(6, '0')
    expect(await (await call(`/p/${b.serial}`)).text()).toContain(`child of <a href="/p/${pad}">#${pad}</a>`)
    expect(await (await call(`/p/${a.serial}`)).text()).toContain('eggs hatched: 1')
    await testEnv.DB.prepare('UPDATE pets SET is_hidden = 1 WHERE serial = ?').bind(a.serial).run()
    const hiddenParent = (await (await call(`/api/pet/${b.serial}`)).json()) as { parent: unknown }
    expect(hiddenParent.parent).toBeNull()
  })
})

describe('missing migration 0006', () => {
  it('hatch with a gift, sync and the card still work', async () => {
    const a = await readyParent()
    const code = (await eggs(a))[0]!.code!
    await testEnv.DB.batch([
      testEnv.DB.prepare('ALTER TABLE gift_codes RENAME TO gift_codes_off'),
      testEnv.DB.prepare('ALTER TABLE invite_notices DROP COLUMN via_gift'),
    ])
    try {
      const res = await giftHatch(2, code)
      expect(res.status).toBe(200)
      const s = await sync(a, T0 + MIN)
      expect(s.status).toBe(200)
      expect(((await s.json()) as { invites: unknown[] }).invites).toEqual([])
      expect((await call(`/p/${a.serial}`)).status).toBe(200)
      expect((await call(`/api/pet/${a.serial}`)).status).toBe(200)
      expect((await call('/api/gift', { body: { serial: a.serial, token: a.token } })).status).toBe(503)
    } finally {
      await testEnv.DB.batch([
        testEnv.DB.prepare('ALTER TABLE gift_codes_off RENAME TO gift_codes'),
        testEnv.DB.prepare('ALTER TABLE invite_notices ADD COLUMN via_gift INTEGER NOT NULL DEFAULT 0'),
      ])
    }
  })
})
