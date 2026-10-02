import { SWEETIE, SWEETIE_RGB, toCellPairs, type CellPair, type Grid } from '@nibbl/core'

// RasterProps: a color is 0x00RRGGBB, or bit 24 alone for the terminal's default.
export const TERMINAL_DEFAULT = 0x01000000

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Plain standard padded base64, so the mod does not depend on toBase64/btoa existing.
export const toBase64 = (bytes: Uint8Array): string => {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i]! << 16
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + '=='
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + '='
  }
  return out
}

const rgbOf = (index: number | null): number => {
  if (index === null) return TERMINAL_DEFAULT
  const rgb = SWEETIE_RGB[index]
  return rgb ? (rgb[0] << 16) | (rgb[1] << 8) | rgb[2] : TERMINAL_DEFAULT
}

const writeU32 = (out: Uint8Array, offset: number, v: number): void => {
  out[offset] = v & 255
  out[offset + 1] = (v >>> 8) & 255
  out[offset + 2] = (v >>> 16) & 255
  out[offset + 3] = (v >>> 24) & 255
}

export type RasterCells = { columns: number; rows: number; cells: string }

// Row-major little-endian u32 triplets [codePoint, fg, bg]; null cells keep the terminal default.
export const encodeRaster = (pairs: CellPair[][]): RasterCells => {
  const rows = pairs.length
  const columns = pairs[0]?.length ?? 0
  const out = new Uint8Array(rows * columns * 12)
  let o = 0
  for (const row of pairs) {
    for (const cell of row) {
      writeU32(out, o, cell.glyph.codePointAt(0) ?? 0x20)
      writeU32(out, o + 4, rgbOf(cell.fg))
      writeU32(out, o + 8, rgbOf(cell.bg))
      o += 12
    }
  }
  return { columns, rows, cells: toBase64(out) }
}

// One styled run of a row: text with an optional color and background (absent = terminal default).
export type Run = { text: string; color?: string; backgroundColor?: string }

const hexOf = (index: number | null): string | undefined => (index === null ? undefined : SWEETIE[index])

// Collapses each row into runs of identical style, the Text-segment fallback for a scene.
export const toRuns = (pairs: CellPair[][]): Run[][] =>
  pairs.map(row => {
    const runs: Run[] = []
    for (const cell of row) {
      // A blank cell's foreground is irrelevant, so it can join any run with the same background.
      const color = cell.glyph === ' ' ? undefined : hexOf(cell.fg)
      const backgroundColor = hexOf(cell.bg)
      const last = runs[runs.length - 1]
      if (last && last.backgroundColor === backgroundColor && (cell.glyph === ' ' || last.color === color)) {
        last.text += cell.glyph
        if (last.color === undefined && color !== undefined) last.color = color
        continue
      }
      const run: Run = { text: cell.glyph }
      if (color !== undefined) run.color = color
      if (backgroundColor !== undefined) run.backgroundColor = backgroundColor
      runs.push(run)
    }
    return runs
  })

export type SceneDrawing = { raster: RasterCells; runs: Run[][] }

export const drawingOf = (grid: Grid): SceneDrawing => {
  const pairs = toCellPairs(grid)
  return { raster: encodeRaster(pairs), runs: toRuns(pairs) }
}
