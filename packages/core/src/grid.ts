export type Grid = (number | null)[][]

export const blankGrid = (width: number, height: number): Grid =>
  Array.from({ length: height }, () => Array<number | null>(width).fill(null))

export const inBounds = (grid: Grid, x: number, y: number): boolean =>
  y >= 0 && y < grid.length && x >= 0 && x < grid[0].length

export const setCell = (grid: Grid, x: number, y: number, color: number): void => {
  if (inBounds(grid, x, y)) grid[y][x] = color
}

export const gridHash = (grid: Grid): string => {
  let h = 0x811c9dc5
  for (const row of grid) {
    for (const cell of row) {
      h ^= cell === null ? 255 : cell
      h = Math.imul(h, 0x01000193) >>> 0
    }
  }
  return h.toString(16).padStart(8, '0')
}
