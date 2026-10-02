import type { Tier } from './odds'
import type { RampName } from './palette'

export type Family = 'mochi' | 'critter' | 'sprout'
export type Pattern = 'none' | 'spots' | 'freckles' | 'stripes' | 'stars' | 'constellation'
export type Eyes = 'dot' | 'big' | 'wide' | 'heart' | 'sleepy' | 'glint'
export type Head = 'none' | 'round' | 'pointy' | 'bunny' | 'horns' | 'leaf'
export type Hat = 'none' | 'beanie' | 'bow' | 'crown'

export type Option<T> = { value: T; weight: number; minTier: Tier }

const opt = <T>(value: T, weight: number, minTier: Tier = 'common'): Option<T> => ({ value, weight, minTier })

// Weights are relative within a pool. Low-weight common values (freckles, heart) keep a
// sub-5% trait reachable for common pets, which the rare-trait guarantee relies on.
export const POOLS = {
  family: [opt<Family>('mochi', 40), opt<Family>('critter', 40), opt<Family>('sprout', 20)],
  halfW: [opt(5, 1), opt(6, 2), opt(7, 1)],
  halfH: [opt(5, 1), opt(6, 2), opt(7, 1)],
  ramp: [
    opt<RampName>('ember', 30), opt<RampName>('moss', 30), opt<RampName>('ocean', 30),
    opt<RampName>('frost', 20, 'uncommon'), opt<RampName>('ghost', 20, 'uncommon'),
    opt<RampName>('jam', 20, 'rare'), opt<RampName>('gold', 10, 'epic'), opt<RampName>('aurora', 10, 'legendary'),
  ],
  pattern: [
    opt<Pattern>('none', 60), opt<Pattern>('spots', 40), opt<Pattern>('freckles', 4),
    opt<Pattern>('stripes', 30, 'uncommon'), opt<Pattern>('stars', 20, 'rare'), opt<Pattern>('constellation', 10, 'epic'),
  ],
  belly: [opt(true, 60), opt(false, 40)],
  eyes: [
    opt<Eyes>('dot', 40), opt<Eyes>('big', 40), opt<Eyes>('wide', 30), opt<Eyes>('heart', 4),
    opt<Eyes>('sleepy', 20, 'uncommon'), opt<Eyes>('glint', 10, 'rare'),
  ],
  blush: [opt(true, 50), opt(false, 50)],
  head: [
    opt<Head>('none', 30), opt<Head>('round', 30), opt<Head>('pointy', 30),
    opt<Head>('bunny', 20, 'uncommon'), opt<Head>('horns', 10, 'epic'),
  ],
} as const

export const HAT_BY_TIER: Record<Tier, Hat> = {
  common: 'none', uncommon: 'none', rare: 'beanie', epic: 'bow', legendary: 'crown',
}

export const SPICES = [
  { gene: 'pattern', value: 'freckles' },
  { gene: 'eyes', value: 'heart' },
] as const
