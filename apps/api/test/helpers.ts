import type { D1Migration } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import type { Env } from '../src/env'
import { handle } from '../src/index'
import { petBySerial, type PetRow } from '../src/lib/db'
import type { HatchResult } from '../src/routes/hatch'

export type TestEnv = Env & { TEST_MIGRATIONS: D1Migration[] }
export const testEnv = env as unknown as TestEnv

export const ORIGIN = 'https://nibbl.test'
// Tuesday 2026-10-20 12:00 UTC: inside the Genesis window of LAUNCH_AT 2026-10-31.
export const T0 = Date.UTC(2026, 9, 20, 12, 0, 0)

export type CallInit = {
  method?: string
  body?: unknown
  rawBody?: string
  ip?: string
  now?: number
  env?: Partial<Env>
  // Extra request headers; null removes a default (e.g. the JSON content-type).
  headers?: Record<string, string | null>
}

export const call = async (path: string, init: CallInit = {}): Promise<Response> => {
  const headers: Record<string, string> = { 'cf-connecting-ip': init.ip ?? '203.0.113.1' }
  const body = init.rawBody ?? (init.body === undefined ? undefined : JSON.stringify(init.body))
  if (body !== undefined) headers['content-type'] = 'application/json'
  for (const [k, v] of Object.entries(init.headers ?? {})) {
    if (v === null) delete headers[k]
    else headers[k] = v
  }
  const request = new Request(ORIGIN + path, { method: init.method ?? (body === undefined ? 'GET' : 'POST'), headers, body })
  return handle(request, { ...testEnv, ...init.env }, { now: () => init.now ?? T0 })
}

export const resetDb = async (): Promise<void> => {
  await testEnv.DB.batch(
    [
      'DELETE FROM pets',
      'DELETE FROM xp_windows',
      'DELETE FROM hatch_ip',
      'DELETE FROM leaderboard_cache',
      'UPDATE counters SET value = 0',
    ].map(sql => testEnv.DB.prepare(sql)),
  )
}

// A valid machineHash (64 lowercase hex chars) per test machine number.
export const machine = (n: number): string => n.toString(16).padStart(64, '0')

export const insertPet = async (p: Partial<PetRow> & { serial: number }): Promise<void> => {
  const row: PetRow = {
    machine_hash: `m-${p.serial}`,
    token_hash: 'x',
    seed: p.serial,
    genome_key: `g-${p.serial}`,
    visual_key: `v-${p.serial}`,
    tier: 'common',
    shiny: 0,
    genesis: 0,
    name: null,
    label: null,
    xp: 0,
    level: 1,
    is_bot: 0,
    is_hidden: 0,
    hatched_at: T0,
    last_sync_at: null,
    name_changed_at: null,
    label_changed_at: null,
    rehatched_at: null,
    ...p,
  }
  const cols = Object.keys(row) as (keyof PetRow)[]
  await testEnv.DB.prepare(`INSERT INTO pets (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .bind(...cols.map(c => row[c]))
    .run()
}

export const hatchPet = async (n: number, opts: { ip?: string; now?: number } = {}): Promise<HatchResult> => {
  const res = await call('/api/hatch', { body: { machineHash: machine(n) }, ip: opts.ip ?? `198.51.100.${n % 250}`, now: opts.now })
  if (res.status !== 200) throw new Error(`hatch ${n} failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as HatchResult
}

export const petRow = async (serial: number): Promise<PetRow> => {
  const row = await petBySerial(testEnv.DB, serial)
  if (!row) throw new Error(`no pet ${serial}`)
  return row
}
