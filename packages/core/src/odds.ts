export const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type Tier = (typeof TIERS)[number]

export const BP = 10_000
export const TIER_BP: Record<Tier, number> = { common: 4000, uncommon: 3000, rare: 1800, epic: 900, legendary: 300 }
export const SHINY_BP = 400

const toBp = (roll: number): number => ((roll % BP) + BP) % BP

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
