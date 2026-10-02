import { C, drawPet } from '@nibbl/core'
import { Canvas, textWidth } from './canvas'
import { B } from './colors'
import { BUG_SPRITE, SOCIAL, pet } from './pets'

// GitHub social preview, 1280x640 (GitHub crops nothing at this ratio).
export const socialPreview = (): Canvas => {
  const c = new Canvas(1280, 640)
  const left = 96

  // Small label box above the logo, in the landing's accent.
  const label = 'a Claude Code mod'
  c.box(left, 76, textWidth(label, 2) + 24, 28, C.orange, C.orange, B.drop)
  c.text(label, left + 12, 82, 2, C.ink)

  // Logo with the landing's hard drop shadow.
  c.text('nibbl', left + 8, 136 + 8, 16, B.drop)
  c.text('nibbl', left, 136, 16, B.shell)

  c.text('A tiny pixel pet that nibbles your bugs.', left, 288, 4, C.white)
  c.text('Lives above your prompt. Reacts to real work. Zero tokens.', left, 340, 2, C.silver)

  // A row of babies on the ground, with a bug waiting at the end.
  const groundY = 560
  for (let x = left; x < 1280 - left; x += 8) c.rect(x, groundY, 8, 8, (x / 8) % 2 === 0 ? C.slate : C.dusk)
  const scale = 8
  const step = 192
  SOCIAL.forEach((p, i) => {
    const grid = drawPet(pet(p), 'baby', 'idle')
    c.grid(grid, left + i * step - 16, groundY - 16 * scale + scale, scale)
  })
  const bugX = 1280 - left - 6 * scale
  for (const px of BUG_SPRITE) c.rect(bugX + px.x * scale, groundY - 2 * scale + px.y * scale, scale, scale, px.c)
  return c
}
