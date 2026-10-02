import { genome, rollFromBytes } from '@nibbl/core'
import { describe, expect, it } from 'vitest'
import { constantTimeEqual, hmacSha256, randomToken, sha256Hex, toHex } from '../src/lib/hmac'
import { BATCH, candidates } from '../src/lib/roll'

describe('hashing', () => {
  it('matches RFC 4231 HMAC-SHA256 test case 2', async () => {
    expect(toHex(await hmacSha256('Jefe', 'what do ya want for nothing?'))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    )
  })

  it('matches the FIPS 180-2 SHA-256 vector', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('makes 43-char url-safe tokens that never repeat', () => {
    const a = randomToken()
    const b = randomToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
  })

  it('compares strings in constant time', () => {
    expect(constantTimeEqual('abcd', 'abcd')).toBe(true)
    expect(constantTimeEqual('abcd', 'abce')).toBe(false)
    expect(constantTimeEqual('abcd', 'abc')).toBe(false)
  })
})

describe('candidates', () => {
  const m = 'ab'.repeat(32)

  it('candidate 0 is the bare HMAC roll', async () => {
    const first = rollFromBytes(await hmacSha256('s', m))
    const [c0] = await candidates('s', m, 0)
    expect(c0).toEqual(genome(first.seed, first.tier, first.shiny))
  })

  it('candidate n >= 1 takes its seed from HMAC(machineHash:n)', async () => {
    const list = await candidates('s', m, 0)
    expect(list[5].seed).toBe(rollFromBytes(await hmacSha256('s', `${m}:5`)).seed)
    const second = await candidates('s', m, BATCH)
    expect(second[0].seed).toBe(rollFromBytes(await hmacSha256('s', `${m}:16`)).seed)
  })

  it('keeps the tier and shiny of the first roll in both batches', async () => {
    const first = rollFromBytes(await hmacSha256('s', m))
    for (const g of [...(await candidates('s', m, 0)), ...(await candidates('s', m, BATCH))]) {
      expect(g.tier).toBe(first.tier)
      expect(g.shiny).toBe(first.shiny)
    }
  })

  it('is deterministic, returns BATCH genomes, and depends on the secret', async () => {
    const a = await candidates('s', m, 0)
    expect(a).toHaveLength(BATCH)
    expect(await candidates('s', m, 0)).toEqual(a)
    expect((await candidates('other', m, 0))[0].seed).not.toBe(a[0].seed)
  })
})
