// Dev helper for picking seeds: `pnpm -C tools/assets exec tsx src/survey.ts <out.png> [tier] [from]`.
// Draws 48 baby pets with their seed so the asset seeds in pets.ts can be chosen by eye.
import { drawPet, genome, isTier } from '@nibbl/core'
import { Canvas } from './canvas'
import { B } from './colors'
import { writePng } from './encode'

const [out = 'survey.png', tierArg = 'common', fromArg = '1'] = process.argv.slice(2)
const tier = isTier(tierArg) ? tierArg : 'common'
const from = Number(fromArg)
const cols = 8
const cell = 16 * 5 + 24
const c = new Canvas(cols * cell, 6 * (cell + 12))
for (let i = 0; i < 48; i++) {
  const seed = from + i
  const x = (i % cols) * cell + 12
  const y = Math.floor(i / cols) * (cell + 12) + 8
  c.grid(drawPet(genome(seed, tier, false), 'baby', 'idle'), x, y, 5)
  c.text(String(seed), x, y + 16 * 5 + 2, 2, B.text)
}
writePng(out, c)
console.log(`wrote ${out}`)
