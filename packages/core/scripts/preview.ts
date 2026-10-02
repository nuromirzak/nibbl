import { writeFileSync } from 'node:fs'
import { SWEETIE, drawScene, genome, isTier, mulberry32, rarestTrait, rollFromBytes, toCellPairs } from '../src/index'

const arg = process.argv[2]
const seedArg = arg === undefined ? Math.floor(Math.random() * 2 ** 32) : Number(arg)
if (!Number.isFinite(seedArg) || (arg !== undefined && arg.trim() === '')) {
  console.error('usage: pnpm preview [seed] [tier]')
  process.exit(1)
}

// Stand-in for the server's HMAC output: 12 bytes from a stream separate from the genome's own.
const words = mulberry32((seedArg ^ 0x5eed) >>> 0)
const bytes = new Uint8Array(12)
for (let w = 0; w < 3; w++) {
  const v = words()
  for (let b = 0; b < 4; b++) bytes[w * 4 + b] = (v >>> (24 - 8 * b)) & 0xff
}
const roll = rollFromBytes(bytes)
const tier = isTier(process.argv[3]) ? process.argv[3] : roll.tier
const seed = seedArg >>> 0
const g = genome(seed, tier, roll.shiny)
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
