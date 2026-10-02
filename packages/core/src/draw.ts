import type { MarkMotif, MarkSpot } from './genes'
import type { Genome } from './genome'
import { blankGrid, inBounds, setCell, type Grid } from './grid'
import { C, RAMPS, SHINY_RAMPS } from './palette'
import { mulberry32 } from './prng'

export type Stage = 'baby' | 'teen' | 'adult'
export type Expression = 'idle' | 'blink' | 'happy' | 'sad' | 'sleep' | 'surprised'

export const PET_SIZE = 16

type MaskCell = 'none' | 'body' | 'leaf' | 'horn'

const SHRINK: Record<Stage, number> = { baby: 2, teen: 1, adult: 0 }

const EAR_SHAPES: Record<'round' | 'pointy' | 'bunny' | 'horns', [number, number][]> = {
  round: [[-3, -1], [-4, -1], [-3, -2], [-4, -2]],
  pointy: [[-3, -1], [-4, -1], [-4, -2], [-4, -3]],
  bunny: [[-3, -1], [-3, -2], [-3, -3], [-3, -4], [-4, -2], [-4, -3]],
  horns: [[-3, -1], [-4, -2], [-4, -3]],
}

const LEAF: [number, number][] = [[7, -1], [8, -1], [8, -2], [9, -3], [10, -3], [6, -3]]

// Offsets along (outward, away from the face); every motif includes its anchor pixel.
const MARK_SHAPES: Record<MarkMotif, readonly (readonly [number, number])[]> = {
  dot: [[0, 0]],
  star: [[0, 0], [1, 1]],
  heart: [[0, 0], [1, 0], [0, 1]],
  scar: [[0, 0], [1, 0], [2, 0]],
  sparkle: [[0, 0], [0, 1]],
  swirl: [[0, 0], [1, 0], [1, 1]],
}

// Four distinct candidates each, so at least one is never part of the pet's 3-color ramp.
const MARK_COLORS: Record<MarkMotif, readonly number[]> = {
  dot: [C.plum, C.navy, C.dusk, C.teal],
  star: [C.yellow, C.white, C.cyan, C.orange],
  heart: [C.red, C.plum, C.orange, C.yellow],
  scar: [C.white, C.silver, C.cyan, C.yellow],
  sparkle: [C.cyan, C.white, C.sky, C.yellow],
  swirl: [C.teal, C.lime, C.green, C.sky],
}

const markAnchor = (
  spot: MarkSpot,
  ey: number,
  inset: number,
  canHold: (x: number, y: number) => boolean,
): { x: number; y: number; sx: number; sy: number } => {
  if (spot === 'left-cheek') return { x: 4 + inset, y: ey + 2, sx: -1, sy: 1 }
  if (spot === 'right-cheek') return { x: 11 - inset, y: ey + 2, sx: 1, sy: 1 }
  // The smallest babies have no forehead above the eyes, so the mark drops between them.
  if (spot === 'forehead') return { x: 7, y: [ey - 1, ey].find(row => canHold(7, row)) ?? ey - 1, sx: 1, sy: -1 }
  // Small bodies have no room under the mouth, so the belly mark climbs to the lowest body row.
  const y = [ey + 5, ey + 4, ey + 3].find(row => canHold(7, row)) ?? ey + 5
  return { x: 7, y, sx: 1, sy: 1 }
}

const PATTERN_SALT = 0x9e3779b9
const PLACE_ATTEMPTS = 8
const SHINY_SPARKLE: readonly (readonly [number, number, number])[] = [[14, 1, C.white], [15, 0, C.cyan]]

const halves = (g: Genome, stage: Stage) => ({
  w: Math.max(3, g.halfW - SHRINK[stage]),
  h: Math.max(3, g.halfH - SHRINK[stage]),
})

// Center is (7.5, 9): doubled coordinates dx2 = 2x - 15, dy2 = 2y - 18 keep the math integer.
const insideBody = (g: Genome, w: number, h: number, x: number, y: number): boolean => {
  const dx2 = 2 * x - 15
  const dy2 = 2 * y - 18
  const ellipse = dx2 * dx2 * h * h + dy2 * dy2 * w * w <= 4 * w * w * h * h
  if (g.family === 'mochi') return ellipse || (y >= 9 && y <= 9 + h - 1 && Math.abs(dx2) * 25 <= 46 * w)
  if (g.family === 'critter') return ellipse || (y === 9 + h && (Math.abs(dx2) === 5 || Math.abs(dx2) === 7))
  const m5 = 5 * Math.max(0, 9 - y)
  const k = 8 * h + m5
  return dx2 * dx2 * k * k + 64 * w * w * dy2 * dy2 <= 256 * w * w * h * h
}

const buildMask = (g: Genome, stage: Stage): MaskCell[][] => {
  const { w, h } = halves(g, stage)
  const mask: MaskCell[][] = Array.from({ length: PET_SIZE }, () => Array<MaskCell>(PET_SIZE).fill('none'))
  for (let y = 1; y < PET_SIZE; y++) {
    for (let x = 0; x < PET_SIZE; x++) if (insideBody(g, w, h, x, y)) mask[y][x] = 'body'
  }
  const top = bodyTop(mask)
  const put = (x: number, y: number, cell: MaskCell) => {
    if (y >= 0 && y < PET_SIZE && x >= 0 && x < PET_SIZE && mask[y][x] === 'none') mask[y][x] = cell
  }
  if (g.head === 'leaf') {
    if (g.hat === 'none') for (const [x, dy] of LEAF) put(x, top + dy, 'leaf')
  } else if (g.head !== 'none') {
    for (const [ox, oy] of EAR_SHAPES[g.head]) {
      for (const x of [8 + ox, 7 - ox]) put(x, top + 1 + oy, g.head === 'horns' ? 'horn' : 'body')
    }
  }
  return mask
}

const bodyTop = (mask: MaskCell[][]): number => {
  const y = mask.findIndex(row => row.includes('body'))
  return y < 0 ? 0 : y
}

const bodyRows = (mask: MaskCell[][]): { top: number; bot: number } => {
  let top = PET_SIZE
  let bot = 0
  for (let y = 0; y < PET_SIZE; y++) {
    if (!mask[y].includes('body')) continue
    if (y < top) top = y
    bot = y
  }
  return { top: Math.min(top, bot), bot }
}

export const faceRow = (g: Genome, stage: Stage): number => {
  const { top, bot } = bodyRows(buildMask(g, stage))
  return Math.max(1, ((top + bot) >> 1) - 1)
}

export const drawPet = (g: Genome, stage: Stage, expression: Expression): Grid => {
  const [shade, base, hi] = (g.shiny ? SHINY_RAMPS : RAMPS)[g.ramp]
  const mask = buildMask(g, stage)
  const isBody = (x: number, y: number) =>
    y >= 0 && y < PET_SIZE && x >= 0 && x < PET_SIZE && mask[y][x] === 'body'
  const px = blankGrid(PET_SIZE, PET_SIZE)

  for (let y = 0; y < PET_SIZE; y++) {
    for (let x = 0; x < PET_SIZE; x++) {
      const cell = mask[y][x]
      if (cell === 'leaf') px[y][x] = C.green
      else if (cell === 'horn') px[y][x] = C.yellow
      else if (cell === 'body') {
        const topLeft = !isBody(x - 1, y) || !isBody(x, y - 1)
        const bottomRight = !isBody(x + 1, y) || !isBody(x, y + 1)
        px[y][x] = topLeft && !bottomRight ? hi : bottomRight && !topLeft ? shade : base
      }
    }
  }

  const { top, bot } = bodyRows(mask)
  const ey = Math.max(1, ((top + bot) >> 1) - 1)
  const isFace = (x: number, y: number) => y >= ey - 1 && y <= ey + 3 && x >= 3 && x <= 12
  const paintBody = (x: number, y: number, color: number) => {
    if (isBody(x, y) && !isFace(x, y)) px[y][x] = color
  }
  const rng = mulberry32((PATTERN_SALT + g.patternVariant) >>> 0)

  if (g.belly) {
    for (let y = ey + 4; y < bot; y++) {
      for (let x = 5; x <= 10; x++) {
        const corner = y === bot - 1 && (x === 5 || x === 10)
        if (!corner) paintBody(x, y, hi)
      }
    }
  }

  // The mark sits on top of blush and freckles but is clipped to the body and never touches
  // the eye area of any expression; the mouth is drawn afterwards and wins. Its pixels are
  // known up front so patterns never land under it.
  const inset = stage === 'baby' ? 1 : 0
  const eyeColumns = [5 + inset, 10 - inset]
  // Union of eye pixels over every eye gene and expression: the eye and its outer neighbour
  // on row ey, the eye and both neighbours on row ey + 1 (happy).
  const inEyeZone = (x: number, y: number) =>
    eyeColumns.some(sx => (y === ey && (x === sx || x === sx + (sx < 8 ? -1 : 1))) || (y === ey + 1 && Math.abs(x - sx) <= 1))
  const anchor = markAnchor(g.mark.spot, ey, inset, (x, y) => isBody(x, y) && !inEyeZone(x, y))
  const markPixels = MARK_SHAPES[g.mark.motif]
    .map(([dx, dy]) => [anchor.x + dx * anchor.sx, anchor.y + dy * anchor.sy] as const)
    .filter(([x, y]) => isBody(x, y) && !inEyeZone(x, y))
  const underMark = (x: number, y: number) => markPixels.some(([mx, my]) => mx === x && my === y)

  const span = Math.max(1, bot - top - 3)
  // Placement retries a bounded number of times so patterns land on the body, off the face.
  const free = (x: number, y: number) => isBody(x, y) && !isFace(x, y) && !underMark(x, y) && px[y][x] !== shade
  const place = (fits: (x: number, y: number) => boolean): [number, number] | null => {
    for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
      const x = 3 + (rng() % 10)
      const y = top + 2 + (rng() % span)
      if (fits(x, y)) return [x, y]
    }
    return null
  }
  if (g.pattern === 'spots') {
    const fits = (x: number, y: number) => free(x, y) && free(x + 1, y)
    let landed = 0
    for (let i = 0; i < 4; i++) {
      const at = place(fits)
      if (at === null) continue
      px[at[1]][at[0]] = shade
      px[at[1]][at[0] + 1] = shade
      landed++
    }
    // Deterministic fallback so a spotted pet always shows at least one spot when it has room.
    for (let y = bot; landed === 0 && y >= top; y--) {
      for (let x = 3; x <= 11 && landed === 0; x++) {
        if (!fits(x, y)) continue
        px[y][x] = shade
        px[y][x + 1] = shade
        landed++
      }
    }
  } else if (g.pattern === 'stripes') {
    const v = g.patternVariant
    for (let y = top + 1 + (v & 1); y < ey - 1; y += 2) {
      for (let x = 6 - ((v >> 1) & 1); x <= 9 + ((v >> 2) & 1); x++) paintBody(x, y, shade)
    }
  } else if (g.pattern === 'stars' || g.pattern === 'constellation') {
    const count = g.pattern === 'stars' ? 3 : 5
    const star = g.ramp === 'ember' || g.ramp === 'gold' ? C.white : C.yellow
    for (let i = 0; i < count; i++) {
      const color = g.pattern === 'constellation' && i % 2 === 1 ? C.white : star
      const at = place(free)
      if (at !== null) px[at[1]][at[0]] = color
    }
  }

  const face = (x: number, y: number, color: number) => setCell(px, x, y, color)
  // Baby bodies are 6 wide, so the face is pulled in by one column to stay inside the silhouette.
  for (const sx of eyeColumns) {
    const out = sx < 8 ? -1 : 1
    if (expression === 'blink' || expression === 'sleep') {
      face(sx, ey + 1, C.ink)
      face(sx + out, ey + 1, C.ink)
    } else if (expression === 'happy') {
      face(sx, ey, C.ink)
      face(sx - 1, ey + 1, C.ink)
      face(sx + 1, ey + 1, C.ink)
    } else if (expression === 'sad') {
      face(sx, ey + 1, C.ink)
      face(sx + out, ey, C.ink)
    } else if (expression === 'surprised') {
      face(sx, ey, C.ink)
      face(sx, ey + 1, C.ink)
    } else if (g.eyes === 'dot') {
      face(sx, ey, C.ink)
    } else if (g.eyes === 'big' || g.eyes === 'glint') {
      face(sx, ey, g.eyes === 'glint' ? C.yellow : C.white)
      face(sx, ey + 1, C.ink)
      face(sx + out, ey, C.ink)
      face(sx + out, ey + 1, C.ink)
    } else if (g.eyes === 'wide') {
      face(sx, ey, C.white)
      face(sx, ey + 1, C.ink)
    } else if (g.eyes === 'sleepy') {
      face(sx, ey + 1, C.ink)
      face(sx + out, ey + 1, C.ink)
    } else {
      face(sx, ey, C.red)
      face(sx + out, ey, C.red)
      face(sx, ey + 1, C.red)
    }
  }

  if (g.pattern === 'freckles') {
    face(4 + inset, ey + 1, shade)
    face(11 - inset, ey + 1, shade)
  }
  if (g.blush) {
    const blush = g.ramp === 'jam' ? C.plum : C.red
    face(4 + inset, ey + 2, blush)
    face(11 - inset, ey + 2, blush)
  }

  const markColor = MARK_COLORS[g.mark.motif].find(c => c !== shade && c !== base && c !== hi)!
  for (const [x, y] of markPixels) px[y][x] = markColor

  if (expression === 'happy') {
    face(6, ey + 2, C.ink)
    face(9, ey + 2, C.ink)
    face(7, ey + 3, C.ink)
    face(8, ey + 3, C.ink)
  } else if (expression === 'sad') {
    face(7, ey + 2, C.ink)
    face(8, ey + 2, C.ink)
    face(6, ey + 3, C.ink)
    face(9, ey + 3, C.ink)
  } else if (expression === 'surprised') {
    face(7, ey + 2, C.ink)
    face(8, ey + 2, C.ink)
    face(7, ey + 3, C.ink)
    face(8, ey + 3, C.ink)
  } else {
    face(7, ey + 2, C.ink)
    face(8, ey + 2, C.ink)
  }

  if (g.hat === 'bow') {
    for (const [x, y] of [[9, top - 1], [10, top - 1], [11, top - 1], [9, top - 2], [11, top - 2]] as const) {
      setCell(px, x, y, C.red)
    }
  } else if (g.hat === 'crown') {
    for (let x = 5; x <= 10; x++) setCell(px, x, top - 1, C.yellow)
    for (const x of [5, 7, 8, 10]) setCell(px, x, top - 2, C.yellow)
  }

  const outlined = px.map(row => [...row])
  for (let y = 0; y < PET_SIZE; y++) {
    for (let x = 0; x < PET_SIZE; x++) {
      if (px[y][x] !== null) continue
      const touches = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as const).some(
        ([dx, dy]) => inBounds(px, x + dx, y + dy) && px[y + dy][x + dx] !== null,
      )
      if (touches) outlined[y][x] = C.ink
    }
  }
  // Rows 0-3 of columns 13-15 are never part of a pet, so the sparkle never meets the outline.
  if (g.shiny) for (const [x, y, color] of SHINY_SPARKLE) outlined[y][x] = color
  return outlined
}
