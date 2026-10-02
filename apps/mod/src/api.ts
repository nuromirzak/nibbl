import type { EngineInterface } from 'claude-code'

import { BACKOFF_BASE_MS, BACKOFF_MAX_MS, DEFAULT_API } from './config'
import { rt } from './runtime'

export type ApiOutcome =
  | { kind: 'ok'; status: number; body: Record<string, unknown> }
  | { kind: 'error'; status: number; code: string; retryAt: number | null }
  | { kind: 'offline'; reason: string }

// Anything that is not a JSON object (a Cloudflare 1027/1102 HTML page, an empty body) means the
// API is not really there: callers treat it like a network error.
export const outcomeOf = (status: number, text: string): ApiOutcome => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { kind: 'offline', reason: `non-JSON answer (${status})` }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { kind: 'offline', reason: `non-object answer (${status})` }
  const body = parsed as Record<string, unknown>
  if (status >= 200 && status < 300) return { kind: 'ok', status, body }
  const code = typeof body.error === 'string' ? body.error : `http_${status}`
  const retryAt = typeof body.retryAt === 'number' && Number.isFinite(body.retryAt) ? body.retryAt : null
  return { kind: 'error', status, code, retryAt }
}

export const post = async ($: EngineInterface, base: string, path: string, payload: unknown): Promise<ApiOutcome> => {
  try {
    const res = await $.http.fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return outcomeOf(res.status, res.text)
  } catch (err) {
    return { kind: 'offline', reason: err instanceof Error ? err.message : String(err) }
  }
}

export type Wait = { until: number; failures: number }

export const isWait = (v: unknown): v is Wait =>
  typeof v === 'object' && v !== null && Number.isFinite((v as Wait).until) && Number.isInteger((v as Wait).failures)

export const backoff = (prev: Wait | null, now: number): Wait => {
  const failures = (prev?.failures ?? 0) + 1
  return { failures, until: now + Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1)) }
}

export const holdUntil = (prev: Wait | null, until: number): Wait => ({ failures: prev?.failures ?? 0, until })

const LOCAL = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/
const REMOTE = /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/

export const pickBase = (env: string | undefined, option: unknown): string => {
  for (const candidate of [env, option]) {
    if (typeof candidate !== 'string') continue
    const base = candidate.trim().replace(/\/+$/, '')
    if (LOCAL.test(base) || REMOTE.test(base)) return base
  }
  return DEFAULT_API
}

export const apiBase = async ($: EngineInterface): Promise<string> => pickBase(await $.env.get('NIBBL_API'), rt.options.apiBase)
