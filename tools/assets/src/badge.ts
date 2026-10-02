import { C, drawPet } from '@nibbl/core'
import { Canvas, textWidth } from './canvas'
import { B, HEX, PALETTE_SIZE } from './colors'
import { BYTE, pet } from './pets'

const CLEAR = PALETTE_SIZE - 1
// Drawn at 1 unit per art pixel, shown at 3x via the SVG size, so GitHub gets crisp pixels.
const ZOOM = 3

type Rect = { x: number; y: number; w: number; h: number; c: number }

// Horizontal runs of one color, merged downward when the next row repeats the same run.
const toRects = (c: Canvas): Rect[] => {
  const done: Rect[] = []
  let open = new Map<string, Rect>()
  for (let y = 0; y < c.h; y++) {
    const next = new Map<string, Rect>()
    let x0 = 0
    while (x0 < c.w) {
      const color = c.px[y * c.w + x0]
      let x1 = x0 + 1
      while (x1 < c.w && c.px[y * c.w + x1] === color) x1++
      if (color !== CLEAR) {
        const key = `${x0}:${x1}:${color}`
        const prev = open.get(key)
        if (prev) {
          prev.h++
          open.delete(key)
          next.set(key, prev)
        } else next.set(key, { x: x0, y, w: x1 - x0, h: 1, c: color })
      }
      x0 = x1
    }
    done.push(...open.values())
    open = next
  }
  return [...done, ...open.values()]
}

export const badgeSvg = (): string => {
  const name = 'Byte #000042'
  const meta = ' · lvl 7'
  const w = 2 + 16 + 4 + textWidth(name + meta, 1) + 5 + 2
  const h = 22
  const c = new Canvas(w, h, CLEAR)
  c.box(1, 1, w - 4, h - 4, B.night, C.dusk, B.drop, 1)
  c.grid(drawPet(pet(BYTE), 'baby', 'idle'), 2, 1, 1)
  const tx = 2 + 16 + 3
  const x = c.text(name, tx, 3, 1, C.white)
  c.text(meta, x, 3, 1, C.lime)
  c.text('nibbl', tx, 11, 1, C.slate)

  // One group per color keeps the fill out of every rect, which roughly halves the file.
  const byColor = new Map<number, string[]>()
  for (const r of toRects(c).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const list = byColor.get(r.c) ?? []
    list.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`)
    byColor.set(r.c, list)
  }
  const groups = [...byColor].map(([color, list]) => `<g fill="${HEX[color]}">${list.join('')}</g>`)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w * ZOOM}" height="${h * ZOOM}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" role="img" aria-label="${name}${meta}, a nibbl">`,
    `<title>${name}${meta}</title>`,
    ...groups,
    '</svg>',
    '',
  ].join('\n')
}
