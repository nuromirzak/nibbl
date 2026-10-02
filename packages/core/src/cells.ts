import type { Grid } from './grid'

export type CellPair = { glyph: '▀' | '▄' | ' '; fg: number | null; bg: number | null }

// One terminal cell shows two vertical pixels: the upper half block takes the top pixel
// as foreground and the bottom pixel as background; null means the terminal's own background.
export const toCellPairs = (grid: Grid): CellPair[][] => {
  const rows: CellPair[][] = []
  for (let y = 0; y + 1 < grid.length; y += 2) {
    rows.push(
      grid[y].map((top, x) => {
        const bottom = grid[y + 1][x]
        if (top !== null) return { glyph: '▀', fg: top, bg: bottom }
        if (bottom !== null) return { glyph: '▄', fg: bottom, bg: null }
        return { glyph: ' ', fg: null, bg: null }
      }),
    )
  }
  return rows
}
