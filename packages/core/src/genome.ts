import { HAT_BY_TIER, POOLS, SPICES, type Eyes, type Family, type Hat, type Head, type Option, type Pattern } from './genes'
import { TIERS, type Tier, tierProbability, tierRank } from './odds'
import type { RampName } from './palette'
import { mulberry32, pickIndex, type Rng } from './prng'

export type Genome = {
  seed: number
  tier: Tier
  shiny: boolean
  family: Family
  halfW: number
  halfH: number
  ramp: RampName
  pattern: Pattern
  belly: boolean
  eyes: Eyes
  blush: boolean
  head: Head
  hat: Hat
}

export type TraitOdds = { gene: string; value: string; probability: number }

const RARE_THRESHOLD = 0.05
const SHINY_PROBABILITY = 0.04

const eligible = <T>(pool: readonly Option<T>[], tier: Tier): Option<T>[] =>
  pool.filter(o => tierRank(o.minTier) <= tierRank(tier))

const pick = <T>(rng: Rng, pool: readonly Option<T>[], tier: Tier): T => {
  const options = eligible(pool, tier)
  const total = options.reduce((s, o) => s + o.weight, 0)
  let r = pickIndex(rng, total)
  for (const o of options) {
    if (r < o.weight) return o.value
    r -= o.weight
  }
  return options[options.length - 1].value
}

const baseProbability = <T>(pool: readonly Option<T>[], value: T): number =>
  TIERS.reduce((sum, t) => {
    const options = eligible(pool, t)
    const match = options.find(o => o.value === value)
    if (!match) return sum
    const total = options.reduce((s, o) => s + o.weight, 0)
    return sum + tierProbability(t) * (match.weight / total)
  }, 0)

const sproutProbability = baseProbability(POOLS.family, 'sprout')

export const traitOdds = (g: Genome): TraitOdds[] => {
  const odds: TraitOdds[] = [
    { gene: 'family', value: g.family, probability: baseProbability(POOLS.family, g.family) },
    { gene: 'ramp', value: g.ramp, probability: baseProbability(POOLS.ramp, g.ramp) },
    { gene: 'pattern', value: g.pattern, probability: baseProbability(POOLS.pattern, g.pattern) },
    { gene: 'eyes', value: g.eyes, probability: baseProbability(POOLS.eyes, g.eyes) },
    {
      gene: 'head',
      value: g.head,
      probability: g.head === 'leaf' ? sproutProbability : baseProbability(POOLS.head, g.head) * (1 - sproutProbability),
    },
  ]
  if (g.hat !== 'none') odds.push({ gene: 'hat', value: g.hat, probability: tierProbability(g.tier) })
  if (g.shiny) odds.push({ gene: 'shiny', value: 'shiny', probability: SHINY_PROBABILITY })
  return odds
}

export const rarestTrait = (g: Genome): TraitOdds =>
  traitOdds(g).reduce((min, t) => (t.probability < min.probability ? t : min))

export const genome = (seed: number, tier: Tier, shiny: boolean): Genome => {
  const normalized = seed >>> 0
  const rng = mulberry32(normalized)
  const family = pick(rng, POOLS.family, tier)
  const g: Genome = {
    seed: normalized,
    tier,
    shiny,
    family,
    halfW: pick(rng, POOLS.halfW, tier),
    halfH: pick(rng, POOLS.halfH, tier),
    ramp: pick(rng, POOLS.ramp, tier),
    pattern: pick(rng, POOLS.pattern, tier),
    belly: pick(rng, POOLS.belly, tier),
    eyes: pick(rng, POOLS.eyes, tier),
    blush: pick(rng, POOLS.blush, tier),
    head: pick(rng, POOLS.head, tier),
    hat: HAT_BY_TIER[tier],
  }
  if (family === 'sprout') g.head = 'leaf'
  // A hat replaces ears and horns so it can never be clipped off the canvas.
  if (g.hat !== 'none' && family !== 'sprout') g.head = 'none'
  if (rarestTrait(g).probability >= RARE_THRESHOLD) {
    const spice = SPICES[pickIndex(rng, SPICES.length)]
    if (spice.gene === 'pattern') g.pattern = spice.value
    else g.eyes = spice.value
  }
  return g
}

export const genomeKey = (g: Genome): string =>
  [g.family, g.halfW, g.halfH, g.ramp, g.pattern, g.belly ? 1 : 0, g.eyes, g.blush ? 1 : 0, g.head, g.hat, g.shiny ? 1 : 0].join('.')

export const firstUnique = (
  seeds: Iterable<number>,
  tier: Tier,
  shiny: boolean,
  isTaken: (key: string) => boolean,
  maxAttempts = 64,
): Genome | null => {
  let attempts = 0
  for (const seed of seeds) {
    if (attempts++ >= maxAttempts) return null
    const g = genome(seed, tier, shiny)
    if (!isTaken(genomeKey(g))) return g
  }
  return null
}
