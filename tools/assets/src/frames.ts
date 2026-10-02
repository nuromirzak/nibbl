// Dev helper: `tsx src/frames.ts <hero|band> <outDir> [i,j,...]` writes chosen GIF frames as PNGs for review.
import type { Frame } from './encode'
import { writePng } from './encode'
import { bandFrames } from './band'
import { heroFrames } from './hero'

const SOURCES: Record<string, () => Frame[]> = { hero: heroFrames, band: bandFrames }

const [name = 'hero', out = '.', list] = process.argv.slice(2)
const frames = SOURCES[name]()
const picks = list ? list.split(',').map(Number) : [0, Math.floor(frames.length / 2), frames.length - 1]
console.log(`${name}: ${frames.length} frames`)
for (const i of picks) writePng(`${out}/${name}-${i}.png`, frames[i].canvas)
