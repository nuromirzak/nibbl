import { SWEETIE_RGB, type Grid } from '@nibbl/core'

export type Rgb = readonly [number, number, number]

export const OG_W = 1200
export const OG_H = 630
export const OG_SCALE = 36
// Same LCD green as the card screen, so the pet's dark outline stays visible.
export const NIGHT: Rgb = [197, 209, 165]

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export const crc32 = (bytes: Uint8Array, start = 0, end = bytes.length): number => {
  let c = 0xffffffff
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length))
  return out
}

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

// CompressionStream('deflate') emits zlib (RFC 1950), which is exactly what IDAT holds.
const zlib = async (raw: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Response(raw).body!.pipeThrough(new CompressionStream('deflate'))).arrayBuffer())

// 8-bit indexed color: one byte per pixel, filter type 0 on every row.
export const encodeIndexedPng = async (
  width: number,
  height: number,
  palette: readonly Rgb[],
  pixels: Uint8Array,
): Promise<Uint8Array> => {
  if (pixels.length !== width * height) throw new RangeError(`expected ${width * height} pixels, got ${pixels.length}`)
  if (palette.length < 1 || palette.length > 256) throw new RangeError('palette needs 1..256 colors')
  const ihdr = new Uint8Array(13)
  const v = new DataView(ihdr.buffer)
  v.setUint32(0, width)
  v.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 3
  const plte = new Uint8Array(palette.length * 3)
  palette.forEach(([r, g, b], i) => plte.set([r, g, b], i * 3))
  const raw = new Uint8Array((width + 1) * height)
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1)
  return concat([SIGNATURE, chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', await zlib(raw)), chunk('IEND', new Uint8Array(0))])
}

// Centers the grid at an integer scale. Each scaled row is built once and copied `scale`
// times, which keeps CPU well inside the free plan's 10 ms.
export const renderGridPng = async (grid: Grid, scale: number, width: number, height: number, background: Rgb): Promise<Uint8Array> => {
  const bg = SWEETIE_RGB.length
  const gw = grid[0].length * scale
  const gh = grid.length * scale
  if (gw > width || gh > height) throw new RangeError('grid does not fit')
  const ox = Math.floor((width - gw) / 2)
  const oy = Math.floor((height - gh) / 2)
  const pixels = new Uint8Array(width * height).fill(bg)
  const row = new Uint8Array(gw)
  for (let gy = 0; gy < grid.length; gy++) {
    row.fill(bg)
    for (let gx = 0; gx < grid[gy].length; gx++) {
      const c = grid[gy][gx]
      if (c !== null) row.fill(c, gx * scale, (gx + 1) * scale)
    }
    for (let k = 0; k < scale; k++) pixels.set(row, (oy + gy * scale + k) * width + ox)
  }
  return encodeIndexedPng(width, height, [...SWEETIE_RGB, background], pixels)
}
