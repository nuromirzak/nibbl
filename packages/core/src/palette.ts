// Sweetie 16 by GrafxKid (lospec.com/palette-list/sweetie-16)
export const SWEETIE = [
  '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
  '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
] as const

export const C = {
  ink: 0, plum: 1, red: 2, orange: 3, yellow: 4, lime: 5, green: 6, teal: 7,
  navy: 8, blue: 9, sky: 10, cyan: 11, white: 12, silver: 13, slate: 14, dusk: 15,
} as const

export type RampName = 'ember' | 'moss' | 'ocean' | 'frost' | 'ghost' | 'jam' | 'gold' | 'aurora'

export const RAMPS: Record<RampName, readonly [shade: number, base: number, hi: number]> = {
  ember: [C.red, C.orange, C.yellow],
  moss: [C.teal, C.green, C.lime],
  ocean: [C.navy, C.blue, C.sky],
  frost: [C.blue, C.sky, C.cyan],
  ghost: [C.slate, C.silver, C.white],
  jam: [C.plum, C.red, C.orange],
  gold: [C.orange, C.yellow, C.white],
  aurora: [C.navy, C.teal, C.cyan],
}

export const SHINY_OF: Record<RampName, RampName> = {
  ember: 'frost', moss: 'jam', ocean: 'moss', frost: 'ember',
  ghost: 'gold', jam: 'moss', gold: 'aurora', aurora: 'gold',
}
