import { SCENE_H, SCENE_W, drawScene, genome, type Genome, type SceneOpts, type Tier } from '@nibbl/core'

// Fixed seeds picked by eye with src/survey.ts. Public assets only show eggs and babies of
// common, uncommon and rare tiers, never shiny ("show the loop, hide the outcomes").
export type PetPick = { seed: number; tier: Exclude<Tier, 'epic' | 'legendary'> }

export const BYTE: PetPick = { seed: 29, tier: 'common' }

export const SHEET: PetPick[] = [
  { seed: 2, tier: 'common' }, { seed: 8, tier: 'common' }, { seed: 26, tier: 'common' }, { seed: 46, tier: 'common' },
  { seed: 1, tier: 'uncommon' }, { seed: 16, tier: 'uncommon' }, { seed: 24, tier: 'uncommon' }, { seed: 37, tier: 'uncommon' },
  { seed: 18, tier: 'rare' }, { seed: 24, tier: 'rare' }, { seed: 27, tier: 'rare' }, { seed: 32, tier: 'rare' },
]

export const SOCIAL: PetPick[] = [
  { seed: 2, tier: 'common' }, { seed: 1, tier: 'uncommon' }, BYTE, { seed: 27, tier: 'rare' }, { seed: 24, tier: 'uncommon' },
]

export const pet = (p: PetPick): Genome => genome(p.seed, p.tier, false)

export type Pixel = { x: number; y: number; c: number }

// Props (bug, heart) are taken from core's own scene by diffing two renders, so the assets
// never carry a second copy of the sprites. Positions come back relative to the prop's top-left.
const extract = (g: Genome, withProp: SceneOpts, base: SceneOpts): Pixel[] => {
  const a = drawScene(g, withProp)
  const b = drawScene(g, base)
  const out: Pixel[] = []
  for (let y = 0; y < SCENE_H; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      const c = a[y][x]
      if (c !== null && c !== b[y][x]) out.push({ x, y, c })
    }
  }
  const minX = Math.min(...out.map(p => p.x))
  const minY = Math.min(...out.map(p => p.y))
  return out.map(p => ({ x: p.x - minX, y: p.y - minY, c: p.c }))
}

const far: SceneOpts = { petX: 0, stage: 'baby' }
export const BUG_SPRITE = extract(pet(BYTE), { ...far, bugs: 1 }, far)
export const HEART_SPRITE = extract(pet(BYTE), { ...far, heart: true }, far)

export const stamp = (grid: (number | null)[][], sprite: Pixel[], x: number, y: number): void => {
  for (const p of sprite) {
    const yy = y + p.y
    const xx = x + p.x
    if (yy >= 0 && yy < grid.length && xx >= 0 && xx < grid[0].length) grid[yy][xx] = p.c
  }
}
