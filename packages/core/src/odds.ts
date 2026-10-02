export const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type Tier = (typeof TIERS)[number]

export const BP = 10_000
export const TIER_BP: Record<Tier, number> = { common: 4000, uncommon: 3000, rare: 1800, epic: 900, legendary: 300 }
export const SHINY_BP = 400

const toBp = (roll: number): number => {
  if (!Number.isFinite(roll)) throw new RangeError(`roll must be finite, got ${roll}`)
  return ((roll % BP) + BP) % BP
}

export const isTier = (x: unknown): x is Tier => typeof x === 'string' && (TIERS as readonly string[]).includes(x)

export const tierRank = (t: Tier): number => TIERS.indexOf(t)

export const tierFromRoll = (roll: number): Tier => {
  let r = toBp(roll)
  for (const t of TIERS) {
    if (r < TIER_BP[t]) return t
    r -= TIER_BP[t]
  }
  return 'legendary'
}

export const shinyFromRoll = (roll: number): boolean => toBp(roll) < SHINY_BP

export const tierProbability = (t: Tier): number => TIER_BP[t] / BP

const uint32At = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0

// Server roll from HMAC output: big-endian uint32 words at offset 0 (seed), 4 (tier), 8 (shiny).
export const rollFromBytes = (bytes: Uint8Array): { seed: number; tier: Tier; shiny: boolean } => {
  if (bytes.length < 12) throw new RangeError(`rollFromBytes needs at least 12 bytes, got ${bytes.length}`)
  return { seed: uint32At(bytes, 0), tier: tierFromRoll(uint32At(bytes, 4)), shiny: shinyFromRoll(uint32At(bytes, 8)) }
}
