import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import gifenc from 'gifenc'
import { PNG } from 'pngjs'
import type { Canvas } from './canvas'
import { PALETTE_SIZE, gifPalette, rgbOf } from './colors'

const TRANSPARENT = PALETTE_SIZE - 1

export type Frame = { canvas: Canvas; ms: number }

const ensureDir = (path: string) => mkdirSync(dirname(path), { recursive: true })

export const pngBytes = (c: Canvas): Buffer => {
  const png = new PNG({ width: c.w, height: c.h, colorType: 2 })
  const rgb = Array.from({ length: 256 }, (_, i) => rgbOf(i))
  for (let i = 0; i < c.px.length; i++) {
    const [r, g, b] = rgb[c.px[i]]
    png.data[i * 4] = r
    png.data[i * 4 + 1] = g
    png.data[i * 4 + 2] = b
    png.data[i * 4 + 3] = 255
  }
  return PNG.sync.write(png, { colorType: 2, deflateLevel: 9 })
}

export const writePng = (path: string, c: Canvas): number => {
  ensureDir(path)
  const bytes = pngBytes(c)
  writeFileSync(path, bytes)
  return bytes.length
}

// Consecutive identical frames are merged into one longer frame to keep files small.
export const writeGif = (path: string, frames: Frame[]): number => {
  const merged: Frame[] = []
  for (const f of frames) {
    const last = merged[merged.length - 1]
    if (last && Buffer.compare(Buffer.from(last.canvas.px), Buffer.from(f.canvas.px)) === 0) last.ms += f.ms
    else merged.push({ canvas: f.canvas, ms: f.ms })
  }
  const palette = gifPalette()
  const gif = gifenc.GIFEncoder()
  // After the first frame only changed pixels are written; the rest use a spare palette slot
  // as the transparent color and the previous frame stays on screen (disposal 1).
  let prev: Uint8Array | null = null
  for (const f of merged) {
    const { px, w, h } = f.canvas
    if (prev === null) {
      gif.writeFrame(px, w, h, { palette, delay: f.ms, repeat: 0 })
    } else {
      const delta = new Uint8Array(px.length)
      for (let i = 0; i < px.length; i++) delta[i] = px[i] === prev[i] ? TRANSPARENT : px[i]
      gif.writeFrame(delta, w, h, { delay: f.ms, transparent: true, transparentIndex: TRANSPARENT, dispose: 1 })
    }
    prev = px
  }
  gif.finish()
  const bytes = gif.bytes()
  ensureDir(path)
  writeFileSync(path, bytes)
  return bytes.length
}
