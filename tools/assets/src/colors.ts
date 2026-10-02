import { SWEETIE } from '@nibbl/core'

// Indices 0-15 are Sweetie 16 in core order, so core grids blit with no remapping.
// Brand tokens follow, matching apps/web/prototype/nibbl.css.
const BRAND = {
  night: '#0f111a',
  shell: '#f4ead5',
  shell2: '#e2d3b3',
  shell3: '#c4af8a',
  lcd1: '#c5d1a5',
  lcd2: '#8b9a6b',
  lcd3: '#4d5a3c',
  lcd4: '#1f2418',
  term: '#14161f',
  termLine: '#2a3044',
  text: '#c9d3df',
  err: '#ff7a8a',
  epic: '#c77dff',
  drop: '#05060a',
} as const

export type BrandName = keyof typeof BRAND

const brandNames = Object.keys(BRAND) as BrandName[]

export const HEX: readonly string[] = [...SWEETIE, ...brandNames.map(n => BRAND[n])]

export const B = Object.fromEntries(brandNames.map((n, i) => [n, SWEETIE.length + i])) as Record<BrandName, number>

// GIF palettes must be a power of two long; unused slots repeat the night color.
export const PALETTE_SIZE = 32

export const rgbOf = (index: number): [number, number, number] => {
  const hex = HEX[index] ?? BRAND.night
  return [1, 3, 5].map(o => Number.parseInt(hex.slice(o, o + 2), 16)) as [number, number, number]
}

export const gifPalette = (): [number, number, number][] =>
  Array.from({ length: PALETTE_SIZE }, (_, i) => rgbOf(i < HEX.length ? i : B.night))
