import { describe, expect, it } from 'vitest'
import { ipBucket } from '../src/lib/ip'
import { HttpError, machineHashOf, readJson, serialOf, tokenOf } from '../src/lib/http'
import { call, testEnv } from './helpers'

const post = (body: string) => new Request('https://x.test/', { method: 'POST', body })

describe('router', () => {
  it('answers unknown api paths with a JSON 404', async () => {
    const res = await call('/api/nope')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('does not treat Object prototype keys as routes', async () => {
    // Route keys are full paths ('/api/...'), so no Object.prototype key can match today; this pins
    // the 404 behaviour (not 405, not a handler call) should the table ever be keyed differently.
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const res = await call(`/api/${key}`)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
    }
  })

  it('answers 415 to an /api POST that is not application/json', async () => {
    const body = JSON.stringify({ machineHash: '0'.repeat(64) })
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', null]) {
      const res = await call('/api/hatch', { rawBody: body, headers: { 'content-type': type } })
      expect(res.status, String(type)).toBe(415)
      expect(await res.json()).toEqual({ error: 'unsupported_media_type' })
    }
    for (const path of ['/api/sync', '/api/name', '/api/import']) {
      expect((await call(path, { rawBody: '{}', headers: { 'content-type': 'text/plain' } })).status, path).toBe(415)
    }
  })

  it('accepts application/json with parameters, in any case', async () => {
    const res = await call('/api/hatch', {
      rawBody: JSON.stringify({ machineHash: '0'.repeat(63) + '1' }),
      headers: { 'content-type': 'Application/JSON; charset=utf-8' },
    })
    expect(res.status).toBe(200)
  })

  it('sends no CORS headers', async () => {
    const res = await call('/api/nope')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('ipBucket', () => {
  it('keeps IPv4 as is', () => {
    expect(ipBucket('203.0.113.7')).toBe('203.0.113.7')
  })

  it('buckets IPv6 by its /64 after expanding ::', () => {
    expect(ipBucket('2001:db8::1')).toBe(ipBucket('2001:db8:0:0:ffff::2'))
    expect(ipBucket('2001:DB8:0000:0000:1:2:3:4')).toBe(ipBucket('2001:db8::1'))
    expect(ipBucket('2001:db8::1')).toBe('2001:0db8:0000:0000::/64')
    expect(ipBucket('2001:db8:0:1::1')).not.toBe(ipBucket('2001:db8::1'))
  })

  it('buckets IPv4-mapped IPv6 as the embedded IPv4 and ::1 as itself', () => {
    expect(ipBucket('::ffff:1.2.3.4')).toBe('1.2.3.4')
    expect(ipBucket('::FFFF:203.0.113.7')).toBe(ipBucket('203.0.113.7'))
    expect(ipBucket('0:0:0:0:0:ffff:1.2.3.4')).toBe('1.2.3.4')
    expect(ipBucket('::1')).toBe('::1')
  })
})

describe('migrations', () => {
  it('creates every table, the leaderboard index and the counters', async () => {
    const { results } = await testEnv.DB.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index')").all<{ name: string }>()
    const names = results.map(r => r.name)
    for (const t of ['pets', 'xp_windows', 'hatch_ip', 'leaderboard_cache', 'counters', 'pets_board']) expect(names).toContain(t)
    const counters = await testEnv.DB.prepare('SELECT name FROM counters ORDER BY name').all<{ name: string }>()
    expect(counters.results.map(r => r.name)).toEqual(['bot_hour', 'hatched', 'serial'])
  })
})

describe('readJson', () => {
  it('parses a JSON object', async () => {
    expect(await readJson(post('{"a":1}'), 100)).toEqual({ a: 1 })
  })

  it('rejects bodies over the limit with 413', async () => {
    await expect(readJson(post('x'.repeat(101)), 100)).rejects.toMatchObject({ status: 413, code: 'body_too_large' })
  })

  it('rejects invalid JSON, empty bodies and non-objects with 400', async () => {
    for (const body of ['{', '[1]', 'null', '"s"', '']) {
      await expect(readJson(post(body), 100)).rejects.toMatchObject({ status: 400, code: 'invalid_json' })
    }
  })
})

describe('validators', () => {
  it('accepts a sha256 hex machineHash and lowercases it', () => {
    expect(machineHashOf('A'.repeat(64))).toBe('a'.repeat(64))
    for (const bad of ['a'.repeat(63), 'g'.repeat(64), 42, null]) expect(() => machineHashOf(bad)).toThrow(HttpError)
  })

  it('accepts integer serials 1..999999 only', () => {
    expect(serialOf(1)).toBe(1)
    expect(serialOf(999_999)).toBe(999_999)
    for (const bad of [0, 1_000_000, 1.5, '1', -3, Number.NaN]) expect(() => serialOf(bad)).toThrow(HttpError)
  })

  it('accepts 43-char base64url tokens only', () => {
    expect(tokenOf('A'.repeat(43))).toBe('A'.repeat(43))
    for (const bad of ['A'.repeat(42), `${'A'.repeat(42)}=`, `${'A'.repeat(42)}+`, 7]) expect(() => tokenOf(bad)).toThrow(HttpError)
  })
})
