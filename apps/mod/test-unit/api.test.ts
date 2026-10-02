import type { EngineInterface } from 'claude-code'
import { describe, expect, it } from 'vitest'
import { backoff, holdUntil, isWait, outcomeOf, pickBase, post } from '../src/api'

type Init = { method?: string; headers?: Record<string, string>; body?: string }
const fake = (fetch: (url: string, init?: Init) => Promise<unknown>) => ({ http: { fetch } }) as unknown as EngineInterface

describe('outcomeOf', () => {
  it('maps a 2xx JSON object to ok', () => {
    expect(outcomeOf(200, '{"xp":5,"level":1,"heartsLeft":5}')).toEqual({ kind: 'ok', status: 200, body: { xp: 5, level: 1, heartsLeft: 5 } })
  })

  it('maps API errors to their code and retryAt', () => {
    expect(outcomeOf(429, '{"error":"sync_too_soon","retryAt":1234}')).toEqual({ kind: 'error', status: 429, code: 'sync_too_soon', retryAt: 1234 })
    expect(outcomeOf(500, '{"error":"internal"}')).toEqual({ kind: 'error', status: 500, code: 'internal', retryAt: null })
    expect(outcomeOf(418, '{}')).toEqual({ kind: 'error', status: 418, code: 'http_418', retryAt: null })
  })

  it('treats anything that is not a JSON object as offline (Cloudflare 1027/1102 pages, empty bodies)', () => {
    expect(outcomeOf(503, '<html>error code: 1027</html>').kind).toBe('offline')
    expect(outcomeOf(200, '').kind).toBe('offline')
    expect(outcomeOf(200, '[1,2]').kind).toBe('offline')
    expect(outcomeOf(200, 'null').kind).toBe('offline')
  })
})

describe('post', () => {
  it('sends JSON with content-type application/json to base + path', async () => {
    const seen: { url: string; init?: Init }[] = []
    const $ = fake(async (url, init) => {
      seen.push({ url, init })
      return { status: 200, ok: true, headers: {}, text: '{"ok":true}' }
    })
    expect(await post($, 'https://getnibbl.pages.dev', '/api/sync', { serial: 1 })).toEqual({ kind: 'ok', status: 200, body: { ok: true } })
    expect(seen).toEqual([
      { url: 'https://getnibbl.pages.dev/api/sync', init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"serial":1}' } },
    ])
  })

  it('turns a rejected fetch (network down, host refused) into offline', async () => {
    const $ = fake(async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    })
    expect(await post($, 'https://x.test', '/api/hatch', {})).toEqual({ kind: 'offline', reason: 'getaddrinfo ENOTFOUND' })
  })
})

describe('waits', () => {
  it('backs off exponentially from 1 minute to at most 1 hour', () => {
    let w = backoff(null, 0)
    expect(w).toEqual({ failures: 1, until: 60_000 })
    w = backoff(w, 0)
    expect(w).toEqual({ failures: 2, until: 120_000 })
    expect(backoff({ failures: 9, until: 0 }, 0)).toEqual({ failures: 10, until: 3_600_000 })
  })

  it('holds until a server-given time without counting a failure', () => {
    expect(holdUntil({ failures: 2, until: 5 }, 99)).toEqual({ failures: 2, until: 99 })
    expect(holdUntil(null, 99)).toEqual({ failures: 0, until: 99 })
  })

  it('recognises stored waits', () => {
    expect(isWait({ failures: 1, until: 5 })).toBe(true)
    expect(isWait({ until: 'soon' })).toBe(false)
    expect(isWait(null)).toBe(false)
  })
})

describe('pickBase', () => {
  it('prefers the env var, then the option, then the default, trimming trailing slashes', () => {
    expect(pickBase('http://localhost:8787/', 'https://getnibbl.pages.dev')).toBe('http://localhost:8787')
    expect(pickBase(undefined, 'https://staging.example.dev/')).toBe('https://staging.example.dev')
    expect(pickBase(undefined, undefined)).toBe('https://getnibbl.pages.dev')
  })

  it('refuses plain http anywhere but localhost, and junk', () => {
    expect(pickBase('http://evil.example', undefined)).toBe('https://getnibbl.pages.dev')
    expect(pickBase('ftp://x', 42)).toBe('https://getnibbl.pages.dev')
    expect(pickBase('http://127.0.0.1:8787', undefined)).toBe('http://127.0.0.1:8787')
  })
})
