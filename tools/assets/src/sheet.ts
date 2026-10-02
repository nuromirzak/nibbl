import { C, drawPet, rarestTrait, tierProbability } from '@nibbl/core'
import { Canvas } from './canvas'
import { B } from './colors'
import { SHEET, pet } from './pets'

const TIER_COLOR = { common: C.silver, uncommon: C.lime, rare: C.sky } as const

const pct = (p: number) => `${(p * 100).toFixed(p < 0.1 ? 2 : 0)}%`

// 12 babies, common to rare, each with its tier and its rarest trait with the real odds.
export const petsSheet = (): Canvas => {
  const cols = 4
  const cardW = 272
  const cardH = 232
  const gap = 32
  const margin = 48
  const top = 136
  const rows = Math.ceil(SHEET.length / cols)
  const c = new Canvas(margin * 2 + cols * cardW + (cols - 1) * gap, top + rows * (cardH + gap) + margin - gap + 8)

  c.text('nibbl babies', margin, 40, 4, B.shell)
  c.text('common · uncommon · rare. every one is unique.', margin, 84, 2, C.silver)

  SHEET.forEach((p, i) => {
    const g = pet(p)
    const x = margin + (i % cols) * (cardW + gap)
    const y = top + Math.floor(i / cols) * (cardH + gap)
    c.box(x, y, cardW, cardH, C.ink, C.dusk)
    c.rect(x + 16, y + 16, cardW - 32, 136, B.night)
    c.grid(drawPet(g, 'baby', 'idle'), x + (cardW - 128) / 2, y + 16, 8)

    const tier = p.tier
    const tierLabel = `${tier} ${pct(tierProbability(tier))}`
    c.text(tierLabel, x + 16, y + 164, 2, TIER_COLOR[tier])
    const rare = rarestTrait(g)
    c.text(`rarest: ${rare.gene} ${pct(rare.probability)}`, x + 16, y + 188, 2, C.white)
    const value = rare.value.length * 12 > cardW - 32 ? `${rare.value.slice(0, Math.floor((cardW - 32) / 12) - 1)}.` : rare.value
    c.text(value, x + 16, y + 208, 2, C.slate)
  })
  return c
}
