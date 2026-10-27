import { beforeEach, describe, expect, it } from 'vitest'
import { weekRollover } from '../src/cron'
import { isMissingSchema, isoWeek, readsRetention } from '../src/lib/retention'
import { DAY_MS, type HatchResult } from '../src/routes/hatch'
import { call, hatchPet, insertPet, machine, resetDb, T0, testEnv } from './helpers'

beforeEach(resetDb)

const MIN = 60_000
const HOUR = 60 * MIN
const V = '0.3.0'

const sync = (pet: HatchResult, events: unknown[], now: number, extra: Record<string, unknown> = { v: V }) =>
  call('/api/sync', { body: { serial: pet.serial, token: pet.token, events, ...extra }, now })
const ev = (type: string, at: number, n = 1) => Array.from({ length: n }, () => ({ type, at }))
const totals = (serial: number) =>
  testEnv.DB.prepare('SELECT * FROM pet_totals WHERE serial = ?').bind(serial).first<Record<string, number>>()
const achievements = async (serial: number) =>
  (await testEnv.DB.prepare('SELECT id FROM pet_achievements WHERE serial = ? ORDER BY id').bind(serial).all<{ id: string }>()).results.map(r => r.id)
const setXp = (serial: number, xp: number) => testEnv.DB.prepare('UPDATE pets SET xp = ? WHERE serial = ?').bind(xp, serial).run()
const invitedHatch = (n: number, invite: unknown) =>
  call('/api/hatch', { body: { machineHash: machine(n), invite }, ip: `198.51.100.${n}` })

describe('isoWeek', () => {
  it('follows ISO 8601 at year boundaries', () => {
    expect(isoWeek(Date.UTC(2026, 0, 1)).label).toBe('2026-W01')
    expect(isoWeek(Date.UTC(2024, 11, 30)).label).toBe('2025-W01')
    expect(isoWeek(Date.UTC(2021, 0, 3)).label).toBe('2020-W53')
    expect(isoWeek(T0)).toEqual({ key: 202643, label: '2026-W43', endsAt: Date.UTC(2026, 9, 26) })
    expect(isoWeek(Date.UTC(2026, 9, 25, 23, 59)).label).toBe('2026-W43')
    expect(isoWeek(Date.UTC(2026, 9, 26)).label).toBe('2026-W44')
  })
})

describe('sync totals', () => {
  it('counts accepted events by type, errors included, and active days', async () => {
    const pet = await hatchPet(1, { now: T0 - HOUR })
    await sync(pet, [...ev('turn', T0 - 10 * MIN, 3), ...ev('commit', T0 - 9 * MIN), ...ev('check_pass', T0 - 8 * MIN, 2), ...ev('pet', T0 - 7 * MIN), ...ev('error', T0 - 6 * MIN, 4)], T0, {})
    expect(await totals(pet.serial)).toMatchObject({ turns: 3, commits: 1, checks: 2, pets: 1, errors: 4, active_days: 1, last_day: Math.floor(T0 / DAY_MS) })
    // Same UTC day: totals add up, the day does not.
    await sync(pet, ev('turn', T0 + 10 * MIN, 2), T0 + 11 * MIN, {})
    expect(await totals(pet.serial)).toMatchObject({ turns: 5, active_days: 1 })
    // Next UTC day.
    await sync(pet, ev('turn', T0 + DAY_MS, 1), T0 + DAY_MS + MIN, {})
    expect(await totals(pet.serial)).toMatchObject({ turns: 6, active_days: 2 })
  })

  it('counts only what the scorer accepts: over-cap, junk and pre-hatch events are ignored', async () => {
    const pet = await hatchPet(1, { now: T0 - MIN })
    await sync(pet, [...ev('turn', T0 - 30_000, 25), ...ev('turn', T0 - HOUR), { type: 'bogus', at: T0 - 1000 }, null, 7], T0, {})
    expect(await totals(pet.serial)).toMatchObject({ turns: 20, errors: 0 })
  })

  it('replayed events do not count twice', async () => {
    const pet = await hatchPet(1, { now: T0 - HOUR })
    const events = ev('check_pass', T0 - 5 * MIN, 20)
    await sync(pet, events, T0, {})
    await sync(pet, events, T0 + MIN, {})
    expect((await totals(pet.serial))?.checks).toBe(20)
  })

  it('a conflicting sync counts nothing', async () => {
    const pet = await hatchPet(1, { now: T0 - HOUR })
    await sync(pet, ev('turn', T0 - 5 * MIN), T0, {})
    // Too soon: rejected before any write.
    expect((await sync(pet, ev('turn', T0 + 1000), T0 + 1000, {})).status).toBe(429)
    expect((await totals(pet.serial))?.turns).toBe(1)
  })
})

describe('readsRetention', () => {
  it('gates on 0.3.0, absent is old and unparseable is new', () => {
    for (const v of ['0.3.0', '0.3.1', '0.10.0', '1.0.0', '0.3.0-beta', 'weird']) expect(readsRetention(v), v).toBe(true)
    for (const v of ['0.2.0', '0.2.9', '0.0.1', undefined, 7, null]) expect(readsRetention(v), String(v)).toBe(false)
  })
})

describe('isMissingSchema', () => {
  it('matches missing tables and columns, not other errors', () => {
    expect(isMissingSchema(new Error('D1_ERROR: no such table: pet_totals'))).toBe(true)
    expect(isMissingSchema(new Error('D1_ERROR: no such column: invited_by'))).toBe(true)
    expect(isMissingSchema(new Error('D1_ERROR: table pets has no column named invited_by'))).toBe(true)
    expect(isMissingSchema(new Error('UNIQUE constraint failed'))).toBe(false)
    expect(isMissingSchema('no such table')).toBe(false)
  })
})

describe('version-gated delivery', () => {
  it('awards for a 0.2.0 client but reports nothing; the next 0.3.0 sync gets it once', async () => {
    const a = await hatchPet(1, { now: T0 - HOUR })
    const b = await hatchPet(2, { now: T0 - HOUR })
    await weekRollover(testEnv.DB, T0)
    await setXp(a.serial, 55)
    await weekRollover(testEnv.DB, T0 + 7 * DAY_MS)
    await invitedHatch(3, a.serial)
    const at = T0 + 7 * DAY_MS + HOUR
    const old = (await (await sync(a, ev('check_pass', at - MIN), at, { v: '0.2.0' })).json()) as Record<string, unknown>
    expect(old).not.toHaveProperty('unlocked')
    expect(old).not.toHaveProperty('invites')
    expect(old).not.toHaveProperty('weekWin')
    expect(await achievements(a.serial)).toEqual(['first-bite', 'friends', 'week'])
    const pending = async () => ({
      ach: (await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM pet_achievements WHERE serial = ? AND reported = 0').bind(a.serial).first<number>('n')),
      notices: (await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM invite_notices WHERE delivered = 0').first<number>('n')),
      wins: (await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM week_winners WHERE delivered = 0').first<number>('n')),
    })
    expect(await pending()).toEqual({ ach: 3, notices: 1, wins: 1 })
    const next = (await (await sync(a, [], at + MIN, { v: '0.3.0' })).json()) as { unlocked: string[]; invites: unknown[]; weekWin: unknown }
    expect([...next.unlocked].sort()).toEqual(['first-bite', 'friends', 'week'])
    expect(next.invites).toHaveLength(1)
    expect(next.weekWin).toEqual({ week: '2026-W43', gain: 55 })
    expect(await pending()).toEqual({ ach: 0, notices: 0, wins: 0 })
    const again = (await (await sync(a, [], at + 2 * MIN, { v: '0.3.0' })).json()) as { unlocked: string[]; invites: unknown[]; weekWin: unknown }
    expect(again).toMatchObject({ unlocked: [], invites: [], weekWin: null })
    void b
  })

  it('a client without v earns achievements too and keeps the old shape', async () => {
    const pet = await hatchPet(1, { now: T0 - HOUR })
    await sync(pet, ev('check_pass', T0 - 20 * MIN), T0 - 10 * MIN, {})
    expect(await achievements(pet.serial)).toEqual(['first-bite'])
  })
})

describe('sync response shape', () => {
  it('keeps the old shape for clients without v', async () => {
    const pet = await hatchPet(1, { now: T0 - HOUR })
    const body = (await (await sync(pet, ev('check_pass', T0 - MIN), T0, {})).json()) as object
    expect(Object.keys(body).sort()).toEqual(['heartsLeft', 'latest', 'level', 'xp'])
  })

  it('adds unlocked, invites and weekWin for v clients', async () => {
    const pet = await hatchPet(1, { now: T0 - HOUR })
    const body = await (await sync(pet, [], T0)).json()
    expect(body).toMatchObject({ waves: [], unlocked: [], invites: [], weekWin: null })
  })

  it('reports an unlock once, only for v clients, and stores it', async () => {
    const pet = await hatchPet(1, { now: T0 - HOUR })
    // An old client earns first-bite silently; the v client is told on its next sync.
    await sync(pet, ev('check_pass', T0 - 20 * MIN), T0 - 10 * MIN, {})
    expect(await achievements(pet.serial)).toEqual(['first-bite'])
    const first = (await (await sync(pet, [], T0)).json()) as { unlocked: string[] }
    expect(first.unlocked).toEqual(['first-bite'])
    const second = (await (await sync(pet, [], T0 + MIN)).json()) as { unlocked: string[] }
    expect(second.unlocked).toEqual([])
    expect(await achievements(pet.serial)).toEqual(['first-bite'])
  })

  it('does not re-report an id that was already reported', async () => {
    const pet = await hatchPet(1, { now: T0 - HOUR })
    await testEnv.DB.prepare("INSERT INTO pet_achievements (serial, id, at, reported) VALUES (?, 'first-bite', 1, 1)").bind(pet.serial).run()
    const body = (await (await sync(pet, ev('check_pass', T0 - MIN), T0)).json()) as { unlocked: string[] }
    expect(body.unlocked).toEqual([])
  })

  it('unlocks from level and totals together', async () => {
    const pet = await hatchPet(1, { now: T0 - HOUR })
    await testEnv.DB.prepare('INSERT INTO pet_totals (serial, turns, checks, commits, errors, waves_sent, active_days, last_day) VALUES (?, 0, 99, 0, 100, 25, 6, 1)').bind(pet.serial).run()
    await setXp(pet.serial, 20000) // level well past 25
    const body = (await (await sync(pet, [...ev('check_pass', T0 - 5 * MIN), ...ev('turn', T0 - 5 * MIN)], T0)).json()) as { unlocked: string[] }
    expect([...body.unlocked].sort()).toEqual(['adult', 'bug-hunter', 'first-bite', 'regular', 'social', 'stubborn', 'teen'])
  })
})

describe('invites at hatch', () => {
  it('links a valid inviter, awards friends to both, queues a notice and delivers it once', async () => {
    const a = await hatchPet(1)
    const res = await invitedHatch(2, a.serial)
    expect(res.status).toBe(200)
    const b = (await res.json()) as HatchResult
    expect(Object.keys(b).sort()).toEqual(['genesis', 'hatchedAt', 'label', 'level', 'name', 'seed', 'serial', 'shiny', 'tier', 'token', 'xp'])
    expect((await testEnv.DB.prepare('SELECT invited_by FROM pets WHERE serial = ?').bind(b.serial).first<{ invited_by: number }>())?.invited_by).toBe(a.serial)
    expect(await achievements(a.serial)).toEqual(['friends'])
    expect(await achievements(b.serial)).toEqual(['friends'])
    // An old client does not consume the notice.
    await sync(a, [], T0, {})
    const first = (await (await sync(a, [], T0 + MIN)).json()) as { invites: unknown[]; unlocked: string[] }
    expect(first.invites).toEqual([{ serial: b.serial, name: null }])
    expect(first.unlocked).toEqual(['friends'])
    const second = (await (await sync(a, [], T0 + 2 * MIN)).json()) as { invites: unknown[] }
    expect(second.invites).toEqual([])
  })

  it('ignores a bad invite silently: unknown, bot, hidden, junk', async () => {
    await insertPet({ serial: 50, is_bot: 1 })
    await insertPet({ serial: 51, is_hidden: 1 })
    let n = 10
    for (const invite of [9999, 50, 51, 'abc', -3, 1.5, null, 0]) {
      const res = await invitedHatch(n++, invite)
      expect(res.status, String(invite)).toBe(200)
    }
    const rows = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM pets WHERE invited_by IS NOT NULL').first<{ n: number }>()
    expect(rows?.n).toBe(0)
    expect((await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM invite_notices').first<{ n: number }>())?.n).toBe(0)
    expect((await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM pet_achievements').first<{ n: number }>())?.n).toBe(0)
  })

  it('never touches invites on re-hatch, including an invite from the pet itself', async () => {
    const a = await hatchPet(1)
    const b = await hatchPet(2)
    expect((await call('/api/hatch', { body: { machineHash: machine(2), invite: a.serial }, now: T0 + 2 * MIN })).status).toBe(200)
    expect((await call('/api/hatch', { body: { machineHash: machine(1), invite: a.serial }, now: T0 + 2 * MIN })).status).toBe(200)
    expect((await testEnv.DB.prepare('SELECT invited_by FROM pets WHERE serial = ?').bind(b.serial).first<{ invited_by: number | null }>())?.invited_by).toBeNull()
    expect((await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM invite_notices').first<{ n: number }>())?.n).toBe(0)
  })

  it('rejects an inviter on the same machine', async () => {
    // Defence in depth: a same-machine inviter can only appear through the new-pet path if the lookup raced.
    const a = await hatchPet(1)
    const res = await invitedHatch(1, a.serial)
    expect(res.status).toBe(200)
    expect((await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM invite_notices').first<{ n: number }>())?.n).toBe(0)
  })
})

describe('waves_sent', () => {
  it('counts delivered waves only', async () => {
    const a = await hatchPet(1)
    const b = await hatchPet(2)
    const wave = (now: number) => call('/api/wave', { body: { serial: a.serial, token: a.token, to: b.serial }, now })
    expect((await wave(T0)).status).toBe(200)
    expect((await wave(T0 + MIN)).status).toBe(429) // already waved today
    expect((await totals(a.serial))?.waves_sent).toBe(1)
  })
})

describe('missing migration 0004', () => {
  const tables = ['pet_totals', 'pet_achievements', 'invite_notices', 'week_snap', 'week_winners']
  const off = () => testEnv.DB.batch(tables.map(t => testEnv.DB.prepare(`ALTER TABLE ${t} RENAME TO ${t}_off`)))
  const on = () => testEnv.DB.batch(tables.map(t => testEnv.DB.prepare(`ALTER TABLE ${t}_off RENAME TO ${t}`)))

  it('sync, hatch, wave and the card still work', async () => {
    const a = await hatchPet(1, { now: T0 - HOUR })
    const b = await hatchPet(2, { now: T0 - HOUR })
    await off()
    try {
      const res = await sync(a, ev('check_pass', T0 - MIN), T0)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ xp: 2, waves: [], unlocked: [], invites: [], weekWin: null })
      expect((await sync(b, ev('turn', T0 - MIN), T0, {})).status).toBe(200)
      expect(await (await sync(b, [], T0 + MIN, {})).json()).toMatchObject({ xp: 3 })
      expect((await invitedHatch(3, a.serial)).status).toBe(200)
      expect((await call('/api/wave', { body: { serial: a.serial, token: a.token, to: b.serial }, now: T0 })).status).toBe(200)
      expect((await call(`/p/${a.serial}`)).status).toBe(200)
    } finally {
      await on()
    }
  })
})

describe('missing invited_by column', () => {
  it('hatch with an invite, sync and the card still work', async () => {
    const a = await hatchPet(1, { now: T0 - HOUR })
    await testEnv.DB.prepare('DROP INDEX pets_invited_by').run()
    await testEnv.DB.prepare('ALTER TABLE pets DROP COLUMN invited_by').run()
    try {
      expect((await invitedHatch(2, a.serial)).status).toBe(200)
      expect((await sync(a, ev('check_pass', T0 - MIN), T0)).status).toBe(200)
      expect((await call(`/p/${a.serial}`)).status).toBe(200)
    } finally {
      await testEnv.DB.prepare('ALTER TABLE pets ADD COLUMN invited_by INTEGER').run()
      await testEnv.DB.prepare('CREATE INDEX pets_invited_by ON pets (invited_by)').run()
    }
  })
})

describe('invite visibility', () => {
  it('hidden invitees get no notice, hidden inviters and unsynced invitees stay off public views', async () => {
    const a = await hatchPet(1, { now: T0 - HOUR })
    const b = (await (await invitedHatch(2, a.serial)).json()) as HatchResult
    await testEnv.DB.prepare('UPDATE pets SET is_hidden = 1 WHERE serial = ?').bind(b.serial).run()
    const res = (await (await sync(a, [], T0)).json()) as { invites: unknown[] }
    expect(res.invites).toEqual([])
    await testEnv.DB.prepare('UPDATE pets SET is_hidden = 0 WHERE serial = ?').bind(b.serial).run()
    // Unsynced invitee: not counted. After one sync it is.
    expect(await (await call(`/api/pet/${a.serial}`)).json()).toMatchObject({ friends: 0 })
    await testEnv.DB.prepare('UPDATE pets SET last_sync_at = ? WHERE serial = ?').bind(T0, b.serial).run()
    expect(await (await call(`/api/pet/${a.serial}`)).json()).toMatchObject({ friends: 1 })
  })

  it('hides invitedBy while the inviter is hidden', async () => {
    await insertPet({ serial: 1, is_hidden: 1 })
    await insertPet({ serial: 2 })
    await testEnv.DB.prepare('UPDATE pets SET invited_by = 1 WHERE serial = 2').run()
    expect(await (await call('/api/pet/2')).json()).toMatchObject({ invitedBy: null })
    expect(await (await call('/p/2')).text()).not.toContain('invited by')
  })
})

describe('week rollover', () => {
  const winners = async () => (await testEnv.DB.prepare('SELECT * FROM week_winners').all<Record<string, unknown>>()).results
  const weekCounter = () => testEnv.DB.prepare("SELECT value FROM counters WHERE name = 'week'").first<number>('value')
  const NEXT = T0 + 7 * DAY_MS

  it('first run only snapshots', async () => {
    await insertPet({ serial: 1, xp: 100 })
    await weekRollover(testEnv.DB, T0)
    expect(await winners()).toEqual([])
    expect(await weekCounter()).toBe(202643)
    expect((await testEnv.DB.prepare('SELECT xp FROM week_snap WHERE serial = 1').first<number>('xp'))).toBe(100)
    await insertPet({ serial: 2 })
    await setXp(1, 999)
    await weekRollover(testEnv.DB, T0 + HOUR) // same week: nothing happens
    expect(await winners()).toEqual([])
    expect((await testEnv.DB.prepare('SELECT xp FROM week_snap WHERE serial = 1').first<number>('xp'))).toBe(100)
  })

  it('picks the biggest real, visible gain, awards week and re-snapshots', async () => {
    await insertPet({ serial: 1, xp: 100 })
    await insertPet({ serial: 2, xp: 0 })
    await insertPet({ serial: 3, xp: 0, is_bot: 1 })
    await insertPet({ serial: 4, xp: 0, is_hidden: 1 })
    await weekRollover(testEnv.DB, T0)
    await setXp(1, 150)
    await setXp(2, 80)
    await setXp(3, 900)
    await setXp(4, 700)
    await insertPet({ serial: 5, xp: 60 }) // hatched mid-week, no snapshot row: counts from 0
    await weekRollover(testEnv.DB, NEXT)
    expect(await winners()).toEqual([{ week: '2026-W43', serial: 2, gain: 80, at: NEXT, delivered: 0, retro: 0 }])
    expect(await achievements(2)).toEqual(['week'])
    expect(await weekCounter()).toBe(202644)
    expect((await testEnv.DB.prepare('SELECT xp FROM week_snap WHERE serial = 3').first<number>('xp'))).toBe(900)
    expect((await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM week_snap').first<number>('n'))).toBe(5)
    await weekRollover(testEnv.DB, NEXT + HOUR) // idempotent within the week
    expect((await winners()).length).toBe(1)
  })

  it('breaks ties by lower serial and skips weeks without gains', async () => {
    await insertPet({ serial: 1 })
    await insertPet({ serial: 2 })
    await weekRollover(testEnv.DB, T0)
    await weekRollover(testEnv.DB, NEXT) // no gains
    expect(await winners()).toEqual([])
    await setXp(1, 40)
    await setXp(2, 40)
    await weekRollover(testEnv.DB, NEXT + 7 * DAY_MS)
    expect((await winners()).map(w => w.serial)).toEqual([1])
  })

  it('tells the winner once, and only a v client consumes it', async () => {
    const a = await hatchPet(1, { now: T0 - HOUR })
    await weekRollover(testEnv.DB, T0)
    await setXp(a.serial, 55)
    await weekRollover(testEnv.DB, NEXT)
    const at = NEXT + HOUR
    await call('/api/sync', { body: { serial: a.serial, token: a.token, events: [] }, now: at })
    const first = (await (await sync(a, [], at + MIN)).json()) as { weekWin: unknown; unlocked: string[] }
    expect(first.weekWin).toEqual({ week: '2026-W43', gain: 55 })
    expect(first.unlocked).toEqual(['week'])
    const second = (await (await sync(a, [], at + 2 * MIN)).json()) as { weekWin: unknown }
    expect(second.weekWin).toBeNull()
  })
})

describe('GET /api/pet/:serial', () => {
  it('returns the public profile', async () => {
    const a = await hatchPet(1, { now: T0 - HOUR })
    const b = (await (await invitedHatch(2, a.serial)).json()) as HatchResult
    await sync(b, ev('check_pass', T0 + MIN, 2), T0 + 2 * MIN)
    const res = await call(`/api/pet/${b.serial}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=60')
    const body = (await res.json()) as { achievements: { id: string }[] }
    expect(body).toEqual({
      serial: b.serial,
      name: null,
      level: 1,
      totals: { turns: 0, checks: 2, commits: 0, errors: 0, pets: 0, wavesSent: 0, activeDays: 1 },
      achievements: [{ id: 'friends', at: T0 }, { id: 'first-bite', at: T0 + 2 * MIN }],
      invitedBy: a.serial,
      parent: { serial: a.serial, name: null },
      eggsHatched: 0,
      friends: 0,
      weekWins: 0,
    })
    expect(((await (await call(`/api/pet/${a.serial}`)).json()) as { friends: number }).friends).toBe(1)
  })

  it('404s for unknown or hidden pets, 400 for junk, serves bots', async () => {
    await insertPet({ serial: 7, is_hidden: 1 })
    await insertPet({ serial: 8, is_bot: 1 })
    expect((await call('/api/pet/999')).status).toBe(404)
    expect((await call('/api/pet/7')).status).toBe(404)
    expect((await call('/api/pet/abc')).status).toBe(400)
    expect((await call('/api/pet/8')).status).toBe(200)
    expect((await call('/api/pet/8', { method: 'POST', body: {} })).status).toBe(405)
  })
})

describe('GET /api/week', () => {
  it('shows an empty board before the first snapshot', async () => {
    await insertPet({ serial: 1, xp: 500 })
    const body = await (await call('/api/week')).json()
    expect(body).toEqual({ week: '2026-W43', endsAt: Date.UTC(2026, 9, 26), leaders: [], winners: [] })
  })

  it('lists leaders by gain and the latest winners', async () => {
    for (let s = 1; s <= 8; s++) await insertPet({ serial: s, xp: 0 })
    await insertPet({ serial: 9, is_bot: 1 })
    await insertPet({ serial: 10, is_hidden: 1 })
    await weekRollover(testEnv.DB, T0)
    for (const [s, xp] of [[1, 10], [2, 70], [3, 30], [4, 30], [5, 5], [6, 90], [7, 0], [9, 999], [10, 999]] as const) await setXp(s, xp)
    await testEnv.DB.prepare("UPDATE pets SET name = 'Bee', shiny = 1 WHERE serial = 6").run()
    for (let w = 0; w < 10; w++) {
      await testEnv.DB.prepare('INSERT INTO week_winners (week, serial, gain, at) VALUES (?, ?, ?, ?)').bind(`2026-W${10 + w}`, 1 + (w % 3), 5 + w, w).run()
    }
    const res = await call('/api/week')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    const body = (await res.json()) as { leaders: Record<string, unknown>[]; winners: Record<string, unknown>[] }
    expect(body.leaders.map(l => [l.serial, l.gain])).toEqual([[6, 90], [2, 70], [3, 30], [4, 30], [1, 10]])
    expect(body.leaders[0]).toEqual({ serial: 6, name: 'Bee', tier: 'common', shiny: true, seed: 6, level: 1, gain: 90 })
    expect(body.winners.length).toBe(8)
    expect(body.winners[0]).toMatchObject({ week: '2026-W19', serial: 1, gain: 14, shiny: false })
    expect(body.winners[7]!.week).toBe('2026-W12')
    expect(body.winners[0]!.retro).toBe(false)
  })

  it('orders winners by week and flags retro crowns', async () => {
    await insertPet({ serial: 1, xp: 0 })
    await insertPet({ serial: 2, xp: 0 })
    await weekRollover(testEnv.DB, T0)
    await testEnv.DB.prepare('INSERT INTO week_winners (week, serial, gain, at, retro) VALUES (?, ?, ?, ?, 1)').bind('2026-W41', 2, 1800, T0 + 5).run()
    await testEnv.DB.prepare('INSERT INTO week_winners (week, serial, gain, at) VALUES (?, ?, ?, ?)').bind('2026-W42', 1, 300, T0).run()
    const body = (await (await call('/api/week')).json()) as { winners: Record<string, unknown>[] }
    expect(body.winners.map(w => [w.week, w.retro])).toEqual([['2026-W42', false], ['2026-W41', true]])
  })
})

describe('edge cache', () => {
  it('serves /api/week and /api/pet from the cache until it expires, and only caches 200s', async () => {
    await insertPet({ serial: 1, name: 'First' })
    const keep = { keepEdgeCache: true }
    expect(await (await call('/api/pet/1')).json()).toMatchObject({ name: 'First' })
    await testEnv.DB.prepare("UPDATE pets SET name = 'Renamed' WHERE serial = 1").run()
    expect(await (await call('/api/pet/1', keep)).json()).toMatchObject({ name: 'First' })
    expect(await (await call('/api/pet/1')).json()).toMatchObject({ name: 'Renamed' })
    expect((await call('/api/pet/999', keep)).status).toBe(404)
    await insertPet({ serial: 999 })
    expect((await call('/api/pet/999', keep)).status).toBe(200)
    await weekRollover(testEnv.DB, T0)
    const first = (await (await call('/api/week')).json()) as { leaders: unknown[] }
    await setXp(1, 50)
    const second = (await (await call('/api/week', keep)).json()) as { leaders: unknown[] }
    expect(second).toEqual(first)
    expect(((await (await call('/api/week')).json()) as { leaders: unknown[] }).leaders).toHaveLength(1)
  })
})

describe('card extras', () => {
  const html = async (path: string) => (await call(path)).text()

  it('shows stage, achievements, invite info and a Share on X link', async () => {
    await insertPet({ serial: 13 })
    await insertPet({ serial: 42, name: 'Byte', level: 12 })
    await insertPet({ serial: 43 })
    await testEnv.DB.prepare('UPDATE pets SET invited_by = 13 WHERE serial IN (42)').run()
    await testEnv.DB.prepare('UPDATE pets SET invited_by = 42, last_sync_at = 1 WHERE serial = 43').run()
    await testEnv.DB.prepare("INSERT INTO pet_achievements (serial, id, at) VALUES (42, 'friends', 1), (42, 'bug-hunter', 2), (42, 'nonsense', 3)").run()
    const res = await call('/p/000042')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    const page = await res.text()
    expect(page).toContain('<span class="tag">teen</span>')
    expect(page).toContain('<span class="tag ach">Friends</span>')
    expect(page).toContain('<span class="tag ach">Bug Hunter</span>')
    expect(page).not.toContain('nonsense')
    expect(page).toContain('invited by <a href="/p/000013">#000013</a>')
    expect(page).toContain('friends invited: 1')
    const text = encodeURIComponent('Meet Byte, a nibbl that eats bugs in Claude Code.')
    const url = encodeURIComponent('https://nibbl.test/p/000042')
    expect(page).toContain(`href="https://x.com/intent/post?text=${text}&amp;url=${url}"`)
    expect(page).toContain('Share on X')
  })

  it('uses the serial for unnamed pets, hides the trail of hidden ones and escapes names', async () => {
    await insertPet({ serial: 5 })
    await insertPet({ serial: 6, name: '<b>"x&', level: 1 })
    await insertPet({ serial: 7, is_hidden: 1 })
    await testEnv.DB.prepare("INSERT INTO pet_achievements (serial, id, at) VALUES (7, 'friends', 1)").run()
    expect(await html('/p/5')).toContain(encodeURIComponent('Meet #000005, a nibbl that eats bugs in Claude Code.'))
    const escaped = await html('/p/6')
    expect(escaped).not.toContain('<b>"x&')
    expect(escaped).toContain(encodeURIComponent('<b>"x&'))
    const hidden = await html('/p/7')
    expect(hidden).not.toContain('tag ach')
    expect(hidden).toContain(encodeURIComponent('Meet #000007, a nibbl that eats bugs in Claude Code.'))
  })
})
