import type { Grid } from '@nibbl/core'
import { B } from './colors'
import { GLYPH_H, glyph, ADVANCE } from './font'

// An indexed-color canvas: every pixel is a palette index, so frames go straight into the
// GIF encoder with no quantization and stay pixel-perfect.
export class Canvas {
  readonly px: Uint8Array
  constructor(readonly w: number, readonly h: number, bg: number = B.night) {
    this.px = new Uint8Array(w * h).fill(bg)
  }

  clone(): Canvas {
    const c = new Canvas(this.w, this.h)
    c.px.set(this.px)
    return c
  }

  rect(x: number, y: number, w: number, h: number, color: number): void {
    const x0 = Math.max(0, x)
    const y0 = Math.max(0, y)
    const x1 = Math.min(this.w, x + w)
    const y1 = Math.min(this.h, y + h)
    for (let yy = y0; yy < y1; yy++) this.px.fill(color, yy * this.w + x0, yy * this.w + x1)
  }

  // The landing's .px box: stepped corners from edge strips plus a hard stepped drop shadow.
  box(x: number, y: number, w: number, h: number, bg: number, bd: number, sh: number | null = B.drop, edge = 4): void {
    if (sh !== null) {
      this.rect(x + 2 * edge, y + edge, w, h, sh)
      this.rect(x + edge, y + 2 * edge, w, h, sh)
      this.rect(x + edge, y + edge, w, h, sh)
    }
    this.rect(x, y - edge, w, edge, bd)
    this.rect(x, y + h, w, edge, bd)
    this.rect(x - edge, y, edge, h, bd)
    this.rect(x + w, y, edge, h, bd)
    this.rect(x, y, w, h, bg)
  }

  // Blits a core grid with an integer scale; null cells stay transparent.
  grid(g: Grid, x: number, y: number, scale: number, map: (c: number) => number = c => c): void {
    for (let gy = 0; gy < g.length; gy++) {
      for (let gx = 0; gx < g[gy].length; gx++) {
        const cell = g[gy][gx]
        if (cell !== null) this.rect(x + gx * scale, y + gy * scale, scale, scale, map(cell))
      }
    }
  }

  text(s: string, x: number, y: number, scale: number, color: number): number {
    let cx = x
    for (const ch of s) {
      const rows = glyph(ch)
      for (let r = 0; r < GLYPH_H; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          if (rows[r][c] === '#') this.rect(cx + c * scale, y + r * scale, scale, scale, color)
        }
      }
      cx += ADVANCE * scale
    }
    return cx
  }
}

export const textWidth = (s: string, scale: number): number => [...s].length * ADVANCE * scale - scale
