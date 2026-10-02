import { levelFromXp } from '@nibbl/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { crc32, encodeIndexedPng, OG_H, OG_W } from '../src/lib/png'
import { call, insertPet, resetDb } from './helpers'

beforeEach(resetDb)

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const u32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(o)

type Chunk = { type: string; data: Uint8Array; crcOk: boolean }
const chunks = (png: Uint8Array): Chunk[] => {
  const out: Chunk[] = []
  let o = 8
  while (o < png.length) {
    const len = u32(png, o)
    out.push({
      type: String.fromCharCode(...png.subarray(o + 4, o + 8)),
      data: png.subarray(o + 8, o + 8 + len),
      crcOk: u32(png, o + 8 + len) === crc32(png, o + 4, o + 8 + len),
    })
    o += 12 + len
  }
  return out
}

const inflate = async (data: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Response(data).body!.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())

describe('png encoder', () => {
  it('computes the standard CRC32 (IEND chunk)', () => {
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082)
  })

  it('writes signature, IHDR, PLTE, IDAT, IEND with valid CRCs', async () => {
    const png = await encodeIndexedPng(2, 2, [[0, 0, 0], [255, 255, 255]], new Uint8Array([0, 1, 1, 0]))
    expect([...png.subarray(0, 8)]).toEqual(SIGNATURE)
    const cs = chunks(png)
    expect(cs.map(c => c.type)).toEqual(['IHDR', 'PLTE', 'IDAT', 'IEND'])
    expect(cs.every(c => c.crcOk)).toBe(true)
    expect([u32(cs[0].data, 0), u32(cs[0].data, 4), cs[0].data[8], cs[0].data[9]]).toEqual([2, 2, 8, 3])
    expect([...(await inflate(cs[2].data))]).toEqual([0, 0, 1, 0, 1, 0])
  })

  it('rejects a pixel buffer of the wrong size', async () => {
    await expect(encodeIndexedPng(2, 2, [[0, 0, 0]], new Uint8Array(3))).rejects.toThrow(RangeError)
  })
})

describe('GET /p/:serial.png', () => {
  it('serves a valid 1200x630 PNG of the pet', async () => {
    await insertPet({ serial: 42, seed: 123, tier: 'legendary', shiny: 1, xp: 9000, level: levelFromXp(9000).level })
    const res = await call('/p/000042.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    const png = new Uint8Array(await res.arrayBuffer())
    expect([...png.subarray(0, 8)]).toEqual(SIGNATURE)
    const cs = chunks(png)
    expect(cs.every(c => c.crcOk)).toBe(true)
    expect(u32(cs[0].data, 0)).toBe(OG_W)
    expect(u32(cs[0].data, 4)).toBe(OG_H)
    const raw = await inflate(cs.find(c => c.type === 'IDAT')!.data)
    expect(raw.length).toBe((OG_W + 1) * OG_H)
    for (let y = 0; y < OG_H; y++) expect(raw[y * (OG_W + 1)]).toBe(0)
    // Something other than background is drawn.
    expect(new Set(raw).size).toBeGreaterThan(3)
    expect(png.length).toBeLessThan(150_000)
  })

  it('answers 404 for an unknown serial', async () => {
    expect((await call('/p/000777.png')).status).toBe(404)
  })
})
