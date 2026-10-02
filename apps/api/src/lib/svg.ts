import { SWEETIE, type Grid } from '@nibbl/core'

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeXml = (s: string): string => s.replace(/[&<>"']/g, ch => XML_ESCAPES[ch])

// Horizontal runs of one color become one rect, which keeps even busy sprites small.
export const gridRects = (grid: Grid, scale: number, ox = 0, oy = 0): string => {
  let out = ''
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]
    let x = 0
    while (x < row.length) {
      const color = row[x]
      if (color === null) {
        x++
        continue
      }
      let end = x + 1
      while (end < row.length && row[end] === color) end++
      out += `<rect x="${ox + x * scale}" y="${oy + y * scale}" width="${(end - x) * scale}" height="${scale}" fill="${SWEETIE[color]}"/>`
      x = end
    }
  }
  return out
}

export const gridSvg = (grid: Grid, scale: number, title: string): string => {
  const w = grid[0].length * scale
  const h = grid.length * scale
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" role="img" aria-label="${escapeXml(title)}">${gridRects(grid, scale)}</svg>`
}

export const BADGE_H = 36
const BADGE_TEXT_X = 40
const CHAR_W = 7.3

export const badgeSvg = (pet: Grid, text: string): string => {
  const width = BADGE_TEXT_X + Math.ceil([...text].length * CHAR_W) + 10
  const safe = escapeXml(text)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BADGE_H}" viewBox="0 0 ${width} ${BADGE_H}" shape-rendering="crispEdges" role="img" aria-label="${safe}"><rect width="${width}" height="${BADGE_H}" fill="#1a1c2c"/>${gridRects(pet, 2, 2, 2)}<text x="${BADGE_TEXT_X}" y="23" fill="#f4f4f4" font-family="'JetBrains Mono',Menlo,Consolas,monospace" font-size="12">${safe}</text></svg>`
}
