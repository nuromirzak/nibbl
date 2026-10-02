import type { D1Migration } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import type { Env } from '../src/env'
import { handle } from '../src/index'

export type TestEnv = Env & { TEST_MIGRATIONS: D1Migration[] }
export const testEnv = env as unknown as TestEnv

export const ORIGIN = 'https://nibbl-pet.test'
// Tuesday 2026-10-20 12:00 UTC: inside the Genesis window of LAUNCH_AT 2026-10-31.
export const T0 = Date.UTC(2026, 9, 20, 12, 0, 0)

export type CallInit = {
  method?: string
  body?: unknown
  rawBody?: string
  ip?: string
  now?: number
  env?: Partial<Env>
}

export const call = async (path: string, init: CallInit = {}): Promise<Response> => {
  const headers: Record<string, string> = { 'cf-connecting-ip': init.ip ?? '203.0.113.1' }
  const body = init.rawBody ?? (init.body === undefined ? undefined : JSON.stringify(init.body))
  if (body !== undefined) headers['content-type'] = 'application/json'
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
