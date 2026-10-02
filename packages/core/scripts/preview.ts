import { writeFileSync } from 'node:fs'
import { SWEETIE, TIERS, drawScene, genome, rarestTrait, shinyFromRoll, tierFromRoll, toCellPairs, mulberry32 } from '../src/index'

const seed = Number(process.argv[2] ?? Math.floor(Math.random() * 2 ** 32))
const roll = mulberry32(seed)
const tier = process.argv[3] && (TIERS as readonly string[]).includes(process.argv[3]) ? (process.argv[3] as (typeof TIERS)[number]) : tierFromRoll(roll())
const g = genome(seed, tier, shinyFromRoll(roll()))
const scene = drawScene(g, { heart: true, bugs: 1 })

const rgb = (i: number) => [1, 3, 5].map(o => Number.parseInt(SWEETIE[i].slice(o, o + 2), 16))
const fg = (i: number) => `\x1b[38;2;${rgb(i).join(';')}m`
const bg = (i: number) => `\x1b[48;2;${rgb(i).join(';')}m`

console.log(JSON.stringify(g))
console.log('rarest:', rarestTrait(g))
for (const row of toCellPairs(scene)) {
  console.log(row.map(c => (c.fg === null ? ' ' : `${fg(c.fg)}${c.bg === null ? '' : bg(c.bg)}${c.glyph}\x1b[0m`)).join(''))
}

const scale = 16
const night = [15, 17, 26]
const lines = [`P3\n${32 * scale} ${16 * scale}\n255`]
for (let y = 0; y < 16 * scale; y++) {
  const row: string[] = []
  for (let x = 0; x < 32 * scale; x++) {
    const cell = scene[Math.floor(y / scale)][Math.floor(x / scale)]
    row.push((cell === null ? night : rgb(cell)).join(' '))
  }
  lines.push(row.join(' '))
}
writeFileSync(`nibbl-${seed}.ppm`, lines.join('\n'))
console.log(`wrote nibbl-${seed}.ppm`)
