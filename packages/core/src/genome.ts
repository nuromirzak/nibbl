import { HAT_BY_TIER, MARK_MOTIFS, MARK_SPOTS, POOLS, type Eyes, type Family, type Hat, type Head, type Mark, type Option, type Pattern } from './genes'
import { BP, SHINY_BP, TIERS, type Tier, tierProbability, tierRank } from './odds'
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
  mark: Mark
}

export type TraitOdds = { gene: string; value: string; probability: number }

const SHINY_PROBABILITY = SHINY_BP / BP
const MARK_PROBABILITY = 1 / (MARK_MOTIFS.length * MARK_SPOTS.length)

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

// P(value | tier) for a pool drawn with `pick`.
const conditional = <T>(pool: readonly Option<T>[], tier: Tier, value: T): number => {
  const options = eligible(pool, tier)
  const match = options.find(o => o.value === value)
  return match ? match.weight / options.reduce((s, o) => s + o.weight, 0) : 0
}

// Exact odds of every final gene value: genes are independent given the tier, so each
// table sums P(tier) * P(value | tier), with the compatibility rules applied per tier.
const table = (values: readonly string[], given: (tier: Tier, value: string) => number): Map<string, number> =>
  new Map(values.map(v => [v, TIERS.reduce((sum, t) => sum + tierProbability(t) * given(t, v), 0)]))

const poolTable = <T>(pool: readonly Option<T>[]) =>
  table(pool.map(o => String(o.value)), (t, v) => conditional(pool, t, pool.find(o => String(o.value) === v)!.value))

const sproutGiven = (t: Tier) => conditional(POOLS.family, t, 'sprout')

const ODDS = {
  family: poolTable(POOLS.family),
  ramp: poolTable(POOLS.ramp),
  pattern: poolTable(POOLS.pattern),
  eyes: poolTable(POOLS.eyes),
  head: table([...POOLS.head.map(o => o.value), 'leaf'], (t, v) => {
    if (v === 'leaf') return sproutGiven(t)
    // Non-sprout pets with a hat lose their head part.
    const head = HAT_BY_TIER[t] === 'none' ? conditional(POOLS.head, t, v as Head) : v === 'none' ? 1 : 0
    return (1 - sproutGiven(t)) * head
  }),
  hat: table([...new Set(Object.values(HAT_BY_TIER))], (t, v) => (HAT_BY_TIER[t] === v ? 1 : 0)),
}

export const markLabel = (m: Mark): string => `${m.motif} on ${m.spot.replace('-', ' ')}`

export const traitOdds = (g: Genome): TraitOdds[] => {
  const of = (gene: keyof typeof ODDS, value: string): TraitOdds => ({ gene, value, probability: ODDS[gene].get(value) ?? 0 })
  const odds: TraitOdds[] = [
    of('family', g.family),
    of('ramp', g.ramp),
    of('pattern', g.pattern),
    of('eyes', g.eyes),
    of('head', g.head),
    of('hat', g.hat),
    { gene: 'mark', value: markLabel(g.mark), probability: MARK_PROBABILITY },
  ]
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
    mark: { motif: MARK_MOTIFS[pickIndex(rng, MARK_MOTIFS.length)], spot: MARK_SPOTS[pickIndex(rng, MARK_SPOTS.length)] },
  }
  if (family === 'sprout') g.head = 'leaf'
  // A hat replaces ears and horns so it can never be clipped off the canvas.
  if (g.hat !== 'none' && family !== 'sprout') g.head = 'none'
  return g
}

export const genomeKey = (g: Genome): string =>
  [g.family, g.halfW, g.halfH, g.ramp, g.pattern, g.belly ? 1 : 0, g.eyes, g.blush ? 1 : 0, g.head, g.hat, `${g.mark.motif}.${g.mark.spot}`, g.shiny ? 1 : 0].join('.')

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
