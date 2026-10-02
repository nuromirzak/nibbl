import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { writeGif, writePng } from './encode'
import { bandFrames } from './band'
import { badgeSvg } from './badge'
import { heroFrames } from './hero'
import { petsSheet } from './sheet'
import { socialPreview } from './social'

const OUT = resolve(import.meta.dirname, '../../../docs/assets')
const only = process.argv[2]

const report = (name: string, bytes: number) => console.log(`${name.padEnd(20)} ${(bytes / 1024).toFixed(1).padStart(7)} KB`)

const jobs: Record<string, () => number> = {
  'hero.gif': () => writeGif(`${OUT}/hero.gif`, heroFrames()),
  'band.gif': () => writeGif(`${OUT}/band.gif`, bandFrames()),
  'social-preview.png': () => writePng(`${OUT}/social-preview.png`, socialPreview()),
  'pets-sheet.png': () => writePng(`${OUT}/pets-sheet.png`, petsSheet()),
  'badge-example.svg': () => {
    const svg = badgeSvg()
    mkdirSync(OUT, { recursive: true })
    writeFileSync(`${OUT}/badge-example.svg`, svg)
    return Buffer.byteLength(svg)
  },
}

for (const [name, run] of Object.entries(jobs)) {
  if (only && only !== name) continue
  report(name, run())
}
