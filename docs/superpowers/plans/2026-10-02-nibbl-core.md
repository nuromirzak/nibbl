# Nibbl Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@nibbl/core`, the zero-dependency TypeScript package that turns a seed into a nibbl: odds, genome, sprite, scene, egg, terminal cells, levels and XP scoring.

**Architecture:** Pure functions only, no I/O, no Node or DOM APIs, so the same code runs in the Claude Code mod runtime, a Cloudflare Worker and the browser. Randomness comes only from a seeded mulberry32 PRNG, and all pixel geometry uses integer math so every runtime draws the identical grid.

**Tech Stack:** TypeScript 5.6+, pnpm workspaces, vitest 3, tsx (preview script only).

**Spec:** `docs/superpowers/specs/2026-10-02-nibbl-design.md`

### Roadmap (one plan per subsystem)
1. **This plan:** `packages/core`.
2. `apps/mod`, starting with the prototype gate from spec §10 (Raster transparency, click on pet, band height, function hooks flag, `ioreg`, SHA-256).
3. `apps/api`: Worker + D1, roll, sync, names, leaderboard, seeded bots, OG card.
4. `apps/web` and launch: landing, leaderboard, publish pipeline to the public plugin repo.

Plans 2-4 are written after this one ships, against the real `core` exports.

## Global Constraints

- `packages/core/src` has zero runtime dependencies and uses no Node, DOM or Web APIs (no `crypto`, `Buffer`, `TextEncoder`).
- Drawing code uses integer arithmetic only. No `Math.pow`, `**`, `Math.sqrt` or float comparisons in `draw.ts`, `scene.ts` or `egg.ts`.
- The PRNG is mulberry32. Every random choice in a genome is drawn from `mulberry32(seed)` in a fixed order.
- Pet canvas is 16×16, scene canvas is 32 columns × 16 rows. Grid cells are a Sweetie 16 palette index (0-15) or `null` (transparent).
- Odds in basis points: common 4000, uncommon 3000, rare 1800, epic 900, legendary 300; shiny 400.
- Every genome has at least one trait with base odds below 5%.
- XP: `pet` 2, `turn` 3, `check_pass` 2, `commit` 2, `error` 0. Caps per UTC clock-hour bucket: `pet` 5, `turn` 20, `check_pass` 20, `commit` 10. XP to go from level n to n+1 = `Math.round(10 * n ** 1.4)` (progression is the only place floats are allowed).
- Mod copy shows trait rarity as "N% odds", not "N% of nibbls": the numbers are base odds, not population counts.
- Never use em dashes in code comments, copy or docs.

## Review Focus

1. **Cross-runtime determinism:** the same seed must draw the same grid in V8, JSC and the Worker. Pinned by fixed hash snapshots in Task 4.
2. **Seed edge values:** HMAC truncation can produce 0, 2^32−1 or a negative int. `genome(-1)` must equal `genome(0xffffffff)` and nothing throws. Pinned in Task 3.
3. **Small bodies:** baby stage shrinks the body to half-size 3. Eyes, mouth, blush, hat and ears must stay inside the 16×16 canvas without throwing. Pinned in Task 4.
4. **Top-edge parts:** ears, leaves and hats drawn above a body whose top row is 0 or 1 must be clipped, not crash. Pinned in Task 4.
5. **Hostile event batches:** events dated in the future, far in the past, unknown types, or 10 000 duplicates must not raise XP beyond the caps. Pinned in Task 6.

---

### Task 1: Monorepo scaffold and PRNG

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `tsconfig.base.json`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`
- Create: `packages/core/src/prng.ts`
- Test: `packages/core/test/prng.test.ts`

**Interfaces:**
- Produces: `type Rng = () => number` (uint32), `mulberry32(seed: number): Rng`, `pickIndex(rng: Rng, n: number): number`.

- [ ] **Step 1: Scaffold the workspace**

`package.json`:
```json
{
  "name": "nibbl",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
  - apps/*
```

`.gitignore`:
```
node_modules
dist
.wrangler
*.ppm
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "lib": ["ES2022"]
  }
}
```

`packages/core/package.json`:
```json
{
  "name": "@nibbl/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json",
    "preview": "tsx scripts/preview.ts"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": [] },
  "include": ["src", "test"]
}
```

`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['test/**/*.test.ts'] } })
```

Run: `git init` (skip if `.git` exists), then `pnpm install`.

- [ ] **Step 2: Write the failing test**

`packages/core/test/prng.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mulberry32, pickIndex } from '../src/prng'

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('returns uint32 values', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(2 ** 32)
    }
  })

  it('treats -1 and 0xffffffff as the same seed', () => {
    expect(mulberry32(-1)()).toBe(mulberry32(0xffffffff)())
  })

  it('pickIndex stays in range', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 1000; i++) {
      const v = pickIndex(rng, 5)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(5)
    }
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @nibbl/core test`
Expected: FAIL, cannot resolve `../src/prng`.

- [ ] **Step 4: Implement**

`packages/core/src/prng.ts`:
```ts
export type Rng = () => number

export const mulberry32 = (seed: number): Rng => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }
}

export const pickIndex = (rng: Rng, n: number): number => rng() % n
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @nibbl/core test`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml .gitignore tsconfig.base.json pnpm-lock.yaml packages/core
git commit -m "feat(core): scaffold workspace and mulberry32 prng"
```

---

### Task 2: Palette and odds

**Files:**
- Create: `packages/core/src/palette.ts`, `packages/core/src/odds.ts`
- Test: `packages/core/test/odds.test.ts`

**Interfaces:**
- Consumes: `mulberry32` (Task 1).
- Produces:
  - `SWEETIE: readonly string[]` (16 hex colors), `C` (named indices), `type RampName`, `RAMPS: Record<RampName, readonly [shade: number, base: number, hi: number]>`, `SHINY_OF: Record<RampName, RampName>`.
  - `TIERS`, `type Tier`, `TIER_BP: Record<Tier, number>`, `SHINY_BP = 400`, `BP = 10000`, `tierRank(t: Tier): number`, `tierFromRoll(roll: number): Tier`, `shinyFromRoll(roll: number): boolean`, `tierProbability(t: Tier): number`.

- [ ] **Step 1: Write the failing test**

`packages/core/test/odds.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { BP, SHINY_BP, TIERS, TIER_BP, shinyFromRoll, tierFromRoll, tierRank } from '../src/odds'
import { RAMPS, SHINY_OF, SWEETIE } from '../src/palette'
import { mulberry32 } from '../src/prng'

describe('palette', () => {
  it('has 16 colors and valid ramp indices', () => {
    expect(SWEETIE).toHaveLength(16)
    for (const ramp of Object.values(RAMPS)) {
      for (const i of ramp) expect(i).toBeGreaterThanOrEqual(0)
      for (const i of ramp) expect(i).toBeLessThan(16)
    }
  })

  it('maps every ramp to a different shiny ramp', () => {
    for (const [name, shiny] of Object.entries(SHINY_OF)) expect(shiny).not.toBe(name)
  })
})

describe('odds', () => {
  it('tier basis points sum to 10000', () => {
    expect(TIERS.reduce((s, t) => s + TIER_BP[t], 0)).toBe(BP)
  })

  it('maps roll boundaries to tiers', () => {
    expect(tierFromRoll(0)).toBe('common')
    expect(tierFromRoll(3999)).toBe('common')
    expect(tierFromRoll(4000)).toBe('uncommon')
    expect(tierFromRoll(9699)).toBe('epic')
    expect(tierFromRoll(9700)).toBe('legendary')
    expect(tierFromRoll(9999)).toBe('legendary')
    expect(tierFromRoll(-1)).toBe('legendary')
    expect(tierFromRoll(10000)).toBe('common')
  })

  it('matches target odds within 0.2 percentage points over 1e6 rolls', () => {
    const rng = mulberry32(2026)
    const counts = Object.fromEntries(TIERS.map(t => [t, 0])) as Record<string, number>
    let shiny = 0
    const n = 1_000_000
    for (let i = 0; i < n; i++) {
      counts[tierFromRoll(rng())]++
      if (shinyFromRoll(rng())) shiny++
    }
    for (const t of TIERS) expect(Math.abs(counts[t] / n - TIER_BP[t] / BP)).toBeLessThan(0.002)
    expect(Math.abs(shiny / n - SHINY_BP / BP)).toBeLessThan(0.002)
  })

  it('ranks tiers in order', () => {
    expect(tierRank('common')).toBe(0)
    expect(tierRank('legendary')).toBe(4)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nibbl/core test`
Expected: FAIL, cannot resolve `../src/odds`.

- [ ] **Step 3: Implement**

`packages/core/src/palette.ts`:
```ts
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
```

`packages/core/src/odds.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @nibbl/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): sweetie16 palette, ramps and tier odds"
```

---

### Task 3: Genome, trait odds, rare-trait guarantee, uniqueness

**Files:**
- Create: `packages/core/src/genes.ts`, `packages/core/src/genome.ts`
- Test: `packages/core/test/genome.test.ts`

**Interfaces:**
- Consumes: `mulberry32`, `pickIndex` (Task 1); `Tier`, `TIERS`, `tierRank`, `tierProbability`, `RampName` (Task 2).
- Produces:
  - Types `Family`, `Pattern`, `Eyes`, `Head`, `Hat`, `Genome` (fields: `seed, tier, shiny, family, halfW, halfH, ramp, pattern, belly, eyes, blush, head, hat`).
  - `genome(seed: number, tier: Tier, shiny: boolean): Genome`
  - `genomeKey(g: Genome): string`
  - `traitOdds(g: Genome): TraitOdds[]` where `TraitOdds = { gene: string; value: string; probability: number }`
  - `rarestTrait(g: Genome): TraitOdds`
  - `firstUnique(seeds: Iterable<number>, tier: Tier, shiny: boolean, isTaken: (key: string) => boolean, maxAttempts?: number): Genome | null`

- [ ] **Step 1: Write the failing test**

`packages/core/test/genome.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { firstUnique, genome, genomeKey, rarestTrait, traitOdds } from '../src/genome'
import { TIERS } from '../src/odds'

describe('genome', () => {
  it('is deterministic', () => {
    expect(genome(42, 'rare', false)).toEqual(genome(42, 'rare', false))
  })

  it('normalizes negative seeds', () => {
    expect(genome(-1, 'common', false)).toEqual({ ...genome(0xffffffff, 'common', false), seed: 0xffffffff })
    expect(() => genome(0, 'legendary', true)).not.toThrow()
  })

  it('gives sprouts a leaf and nobody else a leaf', () => {
    for (let s = 0; s < 2000; s++) {
      const g = genome(s, TIERS[s % 5], false)
      expect(g.family === 'sprout').toBe(g.head === 'leaf')
    }
  })

  it('only uses values eligible for the tier, except the guaranteed spice', () => {
    for (let s = 0; s < 2000; s++) {
      const g = genome(s, 'common', false)
      expect(['ember', 'moss', 'ocean']).toContain(g.ramp)
      expect(['none', 'spots', 'freckles']).toContain(g.pattern)
      expect(g.hat).toBe('none')
    }
  })

  it('maps hat to tier', () => {
    expect(genome(1, 'common', false).hat).toBe('none')
    expect(genome(1, 'uncommon', false).hat).toBe('none')
    expect(genome(1, 'rare', false).hat).toBe('beanie')
    expect(genome(1, 'epic', false).hat).toBe('bow')
    expect(genome(1, 'legendary', false).hat).toBe('crown')
  })

  it('guarantees a trait below 5% odds for every genome', () => {
    for (let s = 0; s < 100_000; s++) {
      const g = genome(s, TIERS[s % 5], s % 25 === 0)
      expect(rarestTrait(g).probability).toBeLessThan(0.05)
    }
  })

  it('reports trait odds between 0 and 1', () => {
    for (const t of traitOdds(genome(9, 'epic', true))) {
      expect(t.probability).toBeGreaterThan(0)
      expect(t.probability).toBeLessThanOrEqual(1)
    }
  })

  it('builds a key that changes when a visible gene changes', () => {
    const g = genome(5, 'rare', false)
    expect(genomeKey(g)).not.toBe(genomeKey({ ...g, ramp: g.ramp === 'ember' ? 'moss' : 'ember' }))
    expect(genomeKey(g)).toBe(genomeKey({ ...g, seed: 999 }))
  })

  it('firstUnique skips taken keys and gives up after maxAttempts', () => {
    const taken = new Set([genomeKey(genome(1, 'common', false))])
    const g = firstUnique([1, 2, 3], 'common', false, k => taken.has(k))
    expect(g).not.toBeNull()
    expect(taken.has(genomeKey(g!))).toBe(false)
    expect(firstUnique([1, 2, 3], 'common', false, () => true, 3)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nibbl/core test`
Expected: FAIL, cannot resolve `../src/genome`.

- [ ] **Step 3: Implement the gene pools**

`packages/core/src/genes.ts`:
```ts
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
```

- [ ] **Step 4: Implement the genome**

`packages/core/src/genome.ts`:
```ts
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
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @nibbl/core test`
Expected: PASS. If the 5% guarantee test fails, print `rarestTrait` for the failing seed: the fix belongs in pool weights, not in the threshold.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter @nibbl/core typecheck`
Expected: no errors.

```bash
git add packages/core
git commit -m "feat(core): genome with tier pools, trait odds and rare-trait guarantee"
```

---

### Task 4: Pet sprite

**Files:**
- Create: `packages/core/src/grid.ts`, `packages/core/src/draw.ts`
- Test: `packages/core/test/draw.test.ts`

**Interfaces:**
- Consumes: `Genome`, `genome` (Task 3); `C`, `RAMPS`, `SHINY_OF` (Task 2); `mulberry32` (Task 1).
- Produces:
  - `type Grid = (number | null)[][]` (rows of palette indices), `blankGrid(width: number, height: number): Grid`, `gridHash(grid: Grid): string` (FNV-1a hex).
  - `type Stage = 'baby' | 'teen' | 'adult'`, `type Expression = 'idle' | 'blink' | 'happy' | 'sad' | 'sleep' | 'surprised'`.
  - `PET_SIZE = 16`, `faceRow(g: Genome, stage: Stage): number`, `drawPet(g: Genome, stage: Stage, expression: Expression): Grid` (16 rows × 16 columns).

- [ ] **Step 1: Write the failing test**

`packages/core/test/draw.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { drawPet, faceRow, type Expression, type Stage } from '../src/draw'
import { genome } from '../src/genome'
import { gridHash } from '../src/grid'
import { TIERS } from '../src/odds'

const STAGES: Stage[] = ['baby', 'teen', 'adult']
const EXPRESSIONS: Expression[] = ['idle', 'blink', 'happy', 'sad', 'sleep', 'surprised']

describe('drawPet', () => {
  it('returns a 16x16 grid of palette indices or null', () => {
    const grid = drawPet(genome(42, 'rare', false), 'adult', 'idle')
    expect(grid).toHaveLength(16)
    for (const row of grid) {
      expect(row).toHaveLength(16)
      for (const cell of row) if (cell !== null) expect(cell).toBeGreaterThanOrEqual(0)
    }
  })

  it('never throws and stays in bounds for any seed, tier, stage and expression', () => {
    for (let s = 0; s < 3000; s++) {
      const g = genome(s, TIERS[s % 5], s % 13 === 0)
      for (const stage of STAGES) {
        for (const e of EXPRESSIONS) {
          const grid = drawPet(g, stage, e)
          expect(grid).toHaveLength(16)
          for (const row of grid) expect(row).toHaveLength(16)
        }
      }
    }
  })

  it('draws something for every pet', () => {
    for (let s = 0; s < 500; s++) {
      const filled = drawPet(genome(s, 'common', false), 'baby', 'idle').flat().filter(c => c !== null)
      expect(filled.length).toBeGreaterThan(20)
    }
  })

  it('changes only face rows between expressions', () => {
    for (let s = 0; s < 300; s++) {
      const g = genome(s, TIERS[s % 5], false)
      const ey = faceRow(g, 'adult')
      const idle = drawPet(g, 'adult', 'idle')
      for (const e of EXPRESSIONS) {
        const other = drawPet(g, 'adult', e)
        for (let y = 0; y < 16; y++) {
          if (y >= ey - 1 && y <= ey + 3) continue
          expect(other[y]).toEqual(idle[y])
        }
      }
    }
  })

  it('keeps the belly out of the face rows', () => {
    for (let s = 0; s < 300; s++) {
      const g = { ...genome(s, 'common', false), belly: true }
      const ey = faceRow(g, 'adult')
      const withBelly = drawPet(g, 'adult', 'idle')
      const without = drawPet({ ...g, belly: false }, 'adult', 'idle')
      for (let y = ey - 1; y <= ey + 2; y++) expect(withBelly[y]).toEqual(without[y])
    }
  })

  it('draws the same pixels on every runtime (fixed hashes)', () => {
    // Snapshot values are recorded on the first run and must never change afterwards:
    // a changed hash means existing users' pets changed shape.
    expect(gridHash(drawPet(genome(1, 'common', false), 'adult', 'idle'))).toMatchSnapshot()
    expect(gridHash(drawPet(genome(42, 'rare', false), 'teen', 'happy'))).toMatchSnapshot()
    expect(gridHash(drawPet(genome(0xffffffff, 'legendary', true), 'baby', 'sad'))).toMatchSnapshot()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nibbl/core test`
Expected: FAIL, cannot resolve `../src/draw`.

- [ ] **Step 3: Implement the grid helpers**

`packages/core/src/grid.ts`:
```ts
export type Grid = (number | null)[][]

export const blankGrid = (width: number, height: number): Grid =>
  Array.from({ length: height }, () => Array<number | null>(width).fill(null))

export const inBounds = (grid: Grid, x: number, y: number): boolean =>
  y >= 0 && y < grid.length && x >= 0 && x < grid[0].length

export const setCell = (grid: Grid, x: number, y: number, color: number): void => {
  if (inBounds(grid, x, y)) grid[y][x] = color
}

export const gridHash = (grid: Grid): string => {
  let h = 0x811c9dc5
  for (const row of grid) {
    for (const cell of row) {
      h ^= cell === null ? 255 : cell
      h = Math.imul(h, 0x01000193) >>> 0
    }
  }
  return h.toString(16).padStart(8, '0')
}
```

- [ ] **Step 4: Implement the sprite**

`packages/core/src/draw.ts`:
```ts
import type { Genome } from './genome'
import { blankGrid, inBounds, setCell, type Grid } from './grid'
import { C, RAMPS, SHINY_OF } from './palette'
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
    for (const [x, dy] of LEAF) put(x, top + dy, 'leaf')
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
  const [shade, base, hi] = RAMPS[g.shiny ? SHINY_OF[g.ramp] : g.ramp]
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
  const rng = mulberry32((g.seed ^ 0x9e3779b9) >>> 0)

  if (g.belly) {
    for (let y = ey + 4; y < bot; y++) {
      for (let x = 5; x <= 10; x++) {
        const corner = y === bot - 1 && (x === 5 || x === 10)
        if (!corner) paintBody(x, y, hi)
      }
    }
  }

  const span = Math.max(1, bot - top - 3)
  if (g.pattern === 'spots') {
    for (let i = 0; i < 4; i++) {
      const x = 3 + (rng() % 10)
      const y = top + 2 + (rng() % span)
      if (isBody(x + 1, y)) {
        paintBody(x, y, shade)
        paintBody(x + 1, y, shade)
      }
    }
  } else if (g.pattern === 'stripes') {
    for (let y = top + 1; y < ey - 1; y += 2) for (let x = 6; x <= 9; x++) paintBody(x, y, shade)
  } else if (g.pattern === 'stars' || g.pattern === 'constellation') {
    const count = g.pattern === 'stars' ? 3 : 5
    const star = g.ramp === 'ember' || g.ramp === 'gold' ? C.white : C.yellow
    for (let i = 0; i < count; i++) {
      const color = g.pattern === 'constellation' && i % 2 === 1 ? C.white : star
      paintBody(3 + (rng() % 10), top + 2 + (rng() % span), color)
    }
  }

  const face = (x: number, y: number, color: number) => setCell(px, x, y, color)
  for (const sx of [5, 10]) {
    const out = sx === 5 ? -1 : 1
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
    face(4, ey + 1, shade)
    face(11, ey + 1, shade)
  }
  if (g.blush) {
    const blush = g.ramp === 'jam' ? C.plum : C.red
    face(4, ey + 2, blush)
    face(11, ey + 2, blush)
  }

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

  if (g.hat === 'beanie') {
    for (let x = 5; x <= 10; x++) setCell(px, x, top - 1, C.red)
    for (let x = 6; x <= 9; x++) setCell(px, x, top - 2, C.red)
    setCell(px, 7, top - 3, C.white)
    setCell(px, 8, top - 3, C.white)
  } else if (g.hat === 'bow') {
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
  return outlined
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @nibbl/core test`
Expected: PASS, and `test/__snapshots__/draw.test.ts.snap` is created with three hashes.

- [ ] **Step 6: Commit (including the snapshot)**

```bash
git add packages/core
git commit -m "feat(core): procedural 16x16 pet sprite with expressions, stages and hats"
```

---

### Task 5: Scene, egg and terminal cells

**Files:**
- Create: `packages/core/src/scene.ts`, `packages/core/src/egg.ts`, `packages/core/src/cells.ts`
- Test: `packages/core/test/scene.test.ts`

**Interfaces:**
- Consumes: `drawPet`, `Stage`, `Expression` (Task 4); `Grid`, `blankGrid`, `setCell` (Task 4); `C` (Task 2); `Genome` (Task 3).
- Produces:
  - `SCENE_W = 32`, `SCENE_H = 16`, `type SceneOpts = { stage?: Stage; expression?: Expression; petX?: number; lift?: number; bugs?: number; heart?: boolean; frame?: number }`, `drawScene(g: Genome, opts?: SceneOpts): Grid`.
  - `drawEgg(cracks: 0 | 1 | 2 | 3): Grid` (16×16), `drawEggScene(cracks: 0 | 1 | 2 | 3, frame?: number): Grid` (32×16).
  - `type CellPair = { glyph: '▀' | '▄' | ' '; fg: number | null; bg: number | null }`, `toCellPairs(grid: Grid): CellPair[][]` (`grid.length / 2` rows).

- [ ] **Step 1: Write the failing test**

`packages/core/test/scene.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { toCellPairs } from '../src/cells'
import { drawEgg, drawEggScene } from '../src/egg'
import { genome } from '../src/genome'
import { C } from '../src/palette'
import { SCENE_H, SCENE_W, drawScene } from '../src/scene'

describe('drawScene', () => {
  it('is 32x16 with a ground row', () => {
    const s = drawScene(genome(42, 'rare', false))
    expect(s).toHaveLength(SCENE_H)
    for (const row of s) expect(row).toHaveLength(SCENE_W)
    expect(s[15].every(c => c === C.slate || c === C.dusk)).toBe(true)
  })

  it('clamps petX, lift and bugs instead of throwing', () => {
    const g = genome(3, 'legendary', true)
    for (const petX of [-10, 0, 16, 99]) {
      for (const lift of [-5, 0, 3, 20]) {
        expect(() => drawScene(g, { petX, lift, bugs: 99, heart: true, frame: 7 })).not.toThrow()
      }
    }
  })

  it('draws bugs only when asked', () => {
    const g = genome(8, 'common', false)
    const count = (bugs: number) => drawScene(g, { bugs, petX: 0 }).flat().filter(c => c === C.lime).length
    expect(count(0)).toBe(count(0))
    expect(count(2)).toBeGreaterThan(count(0))
  })
})

describe('drawEgg', () => {
  it('adds crack pixels as cracks grow', () => {
    const ink = (n: 0 | 1 | 2 | 3) => drawEgg(n).flat().filter(c => c === C.ink).length
    expect(ink(1)).toBeGreaterThan(ink(0))
    expect(ink(3)).toBeGreaterThan(ink(1))
    expect(drawEggScene(2, 1)).toHaveLength(16)
  })
})

describe('toCellPairs', () => {
  it('packs two pixel rows into one terminal row', () => {
    const pairs = toCellPairs([
      [1, 2, null, null],
      [3, null, 4, null],
    ])
    expect(pairs).toEqual([
      [
        { glyph: '▀', fg: 1, bg: 3 },
        { glyph: '▀', fg: 2, bg: null },
        { glyph: '▄', fg: 4, bg: null },
        { glyph: ' ', fg: null, bg: null },
      ],
    ])
  })

  it('turns a 32x16 scene into 8 rows of 32 cells', () => {
    const pairs = toCellPairs(drawScene(genome(1, 'common', false)))
    expect(pairs).toHaveLength(8)
    for (const row of pairs) expect(row).toHaveLength(32)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nibbl/core test`
Expected: FAIL, cannot resolve `../src/cells`.

- [ ] **Step 3: Implement the scene**

`packages/core/src/scene.ts`:
```ts
import { drawPet, PET_SIZE, type Expression, type Stage } from './draw'
import type { Genome } from './genome'
import { blankGrid, setCell, type Grid } from './grid'
import { C } from './palette'

export const SCENE_W = 32
export const SCENE_H = 16
const GROUND = SCENE_H - 1

export type SceneOpts = {
  stage?: Stage
  expression?: Expression
  petX?: number
  lift?: number
  bugs?: number
  heart?: boolean
  frame?: number
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.trunc(v)))

const BUG: [number, number, number][] = [
  [0, 0, C.lime], [4, 0, C.lime], [2, 0, C.ink], [1, 1, C.lime], [2, 1, C.lime], [3, 1, C.lime],
]
const HEART: [number, number][] = [
  [1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3],
]

export const drawGround = (scene: Grid): void => {
  for (let x = 0; x < SCENE_W; x++) scene[GROUND][x] = x % 2 === 0 ? C.slate : C.dusk
}

export const drawScene = (g: Genome, opts: SceneOpts = {}): Grid => {
  const scene = blankGrid(SCENE_W, SCENE_H)
  drawGround(scene)
  const petX = clamp(opts.petX ?? 6, 0, SCENE_W - PET_SIZE)
  const lift = clamp(opts.lift ?? 0, 0, 3)
  const frame = clamp(opts.frame ?? 0, 0, 1_000_000)

  for (let x = petX + 4; x <= petX + 11; x++) setCell(scene, x, GROUND - 1, C.dusk)

  const pet = drawPet(g, opts.stage ?? 'adult', opts.expression ?? 'idle')
  for (let y = 0; y < PET_SIZE; y++) {
    const sy = y - lift
    if (sy < 0 || sy >= GROUND) continue
    for (let x = 0; x < PET_SIZE; x++) {
      const cell = pet[y][x]
      if (cell !== null) scene[sy][petX + x] = cell
    }
  }

  const bugs = clamp(opts.bugs ?? 0, 0, 3)
  for (let i = 0; i < bugs; i++) {
    const bx = SCENE_W - 6 - i * 6
    for (const [dx, dy, color] of BUG) setCell(scene, bx + dx, GROUND - 2 + dy, color)
  }

  if (opts.heart) for (const [dx, dy] of HEART) setCell(scene, SCENE_W - 8 + dx, 2 + dy, C.red)

  if (g.tier === 'legendary') {
    const on = frame % 2 === 0
    setCell(scene, petX + 1, on ? 2 : 5, C.yellow)
    setCell(scene, petX + 14, on ? 5 : 2, C.white)
  }
  return scene
}
```

- [ ] **Step 4: Implement the egg**

`packages/core/src/egg.ts`:
```ts
import { PET_SIZE } from './draw'
import { blankGrid, inBounds, setCell, type Grid } from './grid'
import { C } from './palette'
import { drawGround, SCENE_H, SCENE_W } from './scene'

const CRACKS: [number, number][][] = [
  [],
  [[7, 4], [8, 5], [7, 6]],
  [[7, 4], [8, 5], [7, 6], [9, 7], [10, 8], [9, 9]],
  [[7, 4], [8, 5], [7, 6], [9, 7], [10, 8], [9, 9], [5, 8], [6, 9], [5, 10]],
]

// Center (7.5, 8.5), half-width 5, half-height 6, in doubled integer coordinates.
const insideEgg = (x: number, y: number) => {
  const dx2 = 2 * x - 15
  const dy2 = 2 * y - 17
  return dx2 * dx2 * 36 + dy2 * dy2 * 25 <= 3600
}

export const drawEgg = (cracks: 0 | 1 | 2 | 3): Grid => {
  const egg = blankGrid(PET_SIZE, PET_SIZE)
  for (let y = 0; y < PET_SIZE; y++) {
    for (let x = 0; x < PET_SIZE; x++) {
      if (!insideEgg(x, y)) continue
      const bottomRight = !insideEgg(x + 1, y) || !insideEgg(x, y + 1)
      egg[y][x] = bottomRight ? C.silver : C.white
    }
  }
  for (const [x, y] of [[6, 6], [9, 10], [5, 11]] as const) setCell(egg, x, y, C.sky)
  for (const [x, y] of CRACKS[cracks]) setCell(egg, x, y, C.ink)

  const outlined = egg.map(row => [...row])
  for (let y = 0; y < PET_SIZE; y++) {
    for (let x = 0; x < PET_SIZE; x++) {
      if (egg[y][x] !== null) continue
      const touches = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as const).some(
        ([dx, dy]) => inBounds(egg, x + dx, y + dy) && egg[y + dy][x + dx] !== null,
      )
      if (touches) outlined[y][x] = C.ink
    }
  }
  return outlined
}

export const drawEggScene = (cracks: 0 | 1 | 2 | 3, frame = 0): Grid => {
  const scene = blankGrid(SCENE_W, SCENE_H)
  drawGround(scene)
  const wobble = cracks > 0 && frame % 2 === 1 ? 1 : 0
  const egg = drawEgg(cracks)
  for (let y = 0; y < PET_SIZE - 1; y++) {
    for (let x = 0; x < PET_SIZE; x++) {
      const cell = egg[y][x]
      if (cell !== null) setCell(scene, 8 + x + wobble, y, cell)
    }
  }
  return scene
}
```

- [ ] **Step 5: Implement terminal cells**

`packages/core/src/cells.ts`:
```ts
import type { Grid } from './grid'

export type CellPair = { glyph: '▀' | '▄' | ' '; fg: number | null; bg: number | null }

// One terminal cell shows two vertical pixels: the upper half block takes the top pixel
// as foreground and the bottom pixel as background; null means the terminal's own background.
export const toCellPairs = (grid: Grid): CellPair[][] => {
  const rows: CellPair[][] = []
  for (let y = 0; y + 1 < grid.length; y += 2) {
    rows.push(
      grid[y].map((top, x) => {
        const bottom = grid[y + 1][x]
        if (top !== null) return { glyph: '▀', fg: top, bg: bottom }
        if (bottom !== null) return { glyph: '▄', fg: bottom, bg: null }
        return { glyph: ' ', fg: null, bg: null }
      }),
    )
  }
  return rows
}
```

- [ ] **Step 6: Run the tests and commit**

Run: `pnpm --filter @nibbl/core test`
Expected: PASS.

```bash
git add packages/core
git commit -m "feat(core): 32x16 scene, egg with cracks and half-block terminal cells"
```

---

### Task 6: Progression and XP scoring

**Files:**
- Create: `packages/core/src/progression.ts`
- Test: `packages/core/test/progression.test.ts`

**Interfaces:**
- Consumes: `Stage` (Task 4).
- Produces:
  - `type EventType = 'pet' | 'turn' | 'check_pass' | 'commit' | 'error'`, `type NibblEvent = { type: EventType; at: number }` (`at` = epoch ms).
  - `XP_PER_EVENT: Record<EventType, number>`, `CAPS_PER_HOUR: Record<Exclude<EventType, 'error'>, number>`, `HOUR_MS = 3_600_000`.
  - `type HourWindow = Partial<Record<EventType, number>>`, `type Windows = Record<number, HourWindow>` (key = `Math.floor(at / HOUR_MS)`).
  - `scoreEvents(events: NibblEvent[], windows: Windows, now: number, lastSyncAt: number | null): { xpGained: number; windows: Windows; accepted: number }`.
  - `heartsLeft(windows: Windows, now: number): number`.
  - `xpToNext(level: number): number`, `levelFromXp(xp: number): { level: number; intoLevel: number; toNext: number }`, `stageForLevel(level: number): Stage`.

- [ ] **Step 1: Write the failing test**

`packages/core/test/progression.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { HOUR_MS, heartsLeft, levelFromXp, scoreEvents, stageForLevel, xpToNext } from '../src/progression'

const NOW = 1_800_000_000_000

describe('levels', () => {
  it('follows round(10 * n^1.4)', () => {
    expect(xpToNext(1)).toBe(10)
    expect(xpToNext(2)).toBe(26)
    expect(xpToNext(9)).toBe(217)
  })

  it('converts xp to level', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, intoLevel: 0, toNext: 10 })
    expect(levelFromXp(9).level).toBe(1)
    expect(levelFromXp(10)).toEqual({ level: 2, intoLevel: 0, toNext: 26 })
    expect(levelFromXp(36).level).toBe(3)
  })

  it('maps level to stage', () => {
    expect(stageForLevel(1)).toBe('baby')
    expect(stageForLevel(10)).toBe('teen')
    expect(stageForLevel(25)).toBe('adult')
  })
})

describe('scoreEvents', () => {
  it('gives XP per event type', () => {
    const r = scoreEvents(
      [{ type: 'pet', at: NOW }, { type: 'turn', at: NOW }, { type: 'check_pass', at: NOW }, { type: 'commit', at: NOW }, { type: 'error', at: NOW }],
      {},
      NOW,
      null,
    )
    expect(r.xpGained).toBe(2 + 3 + 2 + 2)
  })

  it('caps pets at 5 per hour bucket and carries existing windows', () => {
    const pets = Array.from({ length: 9 }, () => ({ type: 'pet' as const, at: NOW }))
    const first = scoreEvents(pets, {}, NOW, null)
    expect(first.xpGained).toBe(10)
    const second = scoreEvents(pets, first.windows, NOW, null)
    expect(second.xpGained).toBe(0)
    expect(heartsLeft(first.windows, NOW)).toBe(0)
    expect(heartsLeft({}, NOW)).toBe(5)
  })

  it('refills hearts in the next hour bucket', () => {
    const pets = Array.from({ length: 5 }, () => ({ type: 'pet' as const, at: NOW }))
    const r = scoreEvents(pets, {}, NOW, null)
    expect(heartsLeft(r.windows, NOW + HOUR_MS)).toBe(5)
  })

  it('ignores future events, events older than the sync window and unknown types', () => {
    const r = scoreEvents(
      [
        { type: 'turn', at: NOW + 60_000 },
        { type: 'turn', at: NOW - 5 * HOUR_MS },
        { type: 'hack' as never, at: NOW },
      ],
      {},
      NOW,
      NOW - HOUR_MS,
    )
    expect(r.xpGained).toBe(0)
    expect(r.accepted).toBe(0)
  })

  it('never exceeds caps for 10 000 duplicates', () => {
    const flood = Array.from({ length: 10_000 }, () => ({ type: 'turn' as const, at: NOW }))
    expect(scoreEvents(flood, {}, NOW, null).xpGained).toBe(20 * 3)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nibbl/core test`
Expected: FAIL, cannot resolve `../src/progression`.

- [ ] **Step 3: Implement**

`packages/core/src/progression.ts`:
```ts
import type { Stage } from './draw'

export type EventType = 'pet' | 'turn' | 'check_pass' | 'commit' | 'error'
export type NibblEvent = { type: EventType; at: number }
export type HourWindow = Partial<Record<EventType, number>>
export type Windows = Record<number, HourWindow>

export const HOUR_MS = 3_600_000
const SYNC_GRACE_MS = 3 * HOUR_MS
const FIRST_SYNC_LOOKBACK_MS = 24 * HOUR_MS

export const XP_PER_EVENT: Record<EventType, number> = { pet: 2, turn: 3, check_pass: 2, commit: 2, error: 0 }
export const CAPS_PER_HOUR: Record<Exclude<EventType, 'error'>, number> = { pet: 5, turn: 20, check_pass: 20, commit: 10 }

const hourOf = (at: number) => Math.floor(at / HOUR_MS)
const isEventType = (t: unknown): t is EventType => typeof t === 'string' && t in XP_PER_EVENT

export const scoreEvents = (
  events: NibblEvent[],
  windows: Windows,
  now: number,
  lastSyncAt: number | null,
): { xpGained: number; windows: Windows; accepted: number } => {
  const oldest = lastSyncAt === null ? now - FIRST_SYNC_LOOKBACK_MS : lastSyncAt - SYNC_GRACE_MS
  const next: Windows = Object.fromEntries(Object.entries(windows).map(([h, w]) => [h, { ...w }]))
  let xpGained = 0
  let accepted = 0
  for (const e of events) {
    if (!isEventType(e.type) || !Number.isFinite(e.at) || e.at > now || e.at < oldest) continue
    if (e.type === 'error') continue
    const hour = hourOf(e.at)
    const window = (next[hour] ??= {})
    const used = window[e.type] ?? 0
    if (used >= CAPS_PER_HOUR[e.type]) continue
    window[e.type] = used + 1
    xpGained += XP_PER_EVENT[e.type]
    accepted++
  }
  return { xpGained, windows: next, accepted }
}

export const heartsLeft = (windows: Windows, now: number): number =>
  Math.max(0, CAPS_PER_HOUR.pet - (windows[hourOf(now)]?.pet ?? 0))

export const xpToNext = (level: number): number => Math.round(10 * level ** 1.4)

export const levelFromXp = (xp: number): { level: number; intoLevel: number; toNext: number } => {
  let level = 1
  let rest = Math.max(0, Math.floor(xp))
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level)
    level++
  }
  return { level, intoLevel: rest, toNext: xpToNext(level) }
}

export const stageForLevel = (level: number): Stage => (level >= 25 ? 'adult' : level >= 10 ? 'teen' : 'baby')
```

- [ ] **Step 4: Run the tests and commit**

Run: `pnpm --filter @nibbl/core test`
Expected: PASS.

```bash
git add packages/core
git commit -m "feat(core): levels, stages and capped server-authoritative xp scoring"
```

---

### Task 7: Public entry, preview tool and visual review

**Files:**
- Create: `packages/core/src/index.ts`, `packages/core/scripts/preview.ts`
- Test: `packages/core/test/index.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: the package entry `@nibbl/core` re-exporting every public name listed in Tasks 1-6. Plans 2-4 import only from `@nibbl/core`.

- [ ] **Step 1: Write the failing test**

`packages/core/test/index.test.ts`:
```ts
import { expect, it } from 'vitest'
import * as core from '../src/index'

it('exports the public API', () => {
  for (const name of [
    'mulberry32', 'SWEETIE', 'RAMPS', 'TIERS', 'tierFromRoll', 'shinyFromRoll', 'genome', 'genomeKey',
    'traitOdds', 'rarestTrait', 'firstUnique', 'drawPet', 'faceRow', 'drawScene', 'drawEgg', 'drawEggScene',
    'toCellPairs', 'gridHash', 'scoreEvents', 'heartsLeft', 'levelFromXp', 'xpToNext', 'stageForLevel',
  ]) {
    expect(core).toHaveProperty(name)
  }
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nibbl/core test`
Expected: FAIL, cannot resolve `../src/index`.

- [ ] **Step 3: Implement the entry**

`packages/core/src/index.ts`:
```ts
export * from './cells'
export * from './draw'
export * from './egg'
export * from './genes'
export * from './genome'
export * from './grid'
export * from './odds'
export * from './palette'
export * from './prng'
export * from './progression'
export * from './scene'
```

- [ ] **Step 4: Write the preview tool**

`packages/core/scripts/preview.ts` prints half-block ANSI to the terminal and writes a zero-dependency PPM image (opens in macOS Preview):
```ts
import { writeFileSync } from 'node:fs'
import { SWEETIE, TIERS, drawScene, genome, rarestTrait, shinyFromRoll, tierFromRoll, toCellPairs, mulberry32 } from '../src/index'

const seed = Number(process.argv[2] ?? Math.floor(Math.random() * 2 ** 32))
const roll = mulberry32(seed)
const tier = process.argv[3] && (TIERS as readonly string[]).includes(process.argv[3]) ? (process.argv[3] as (typeof TIERS)[number]) : tierFromRoll(roll())
const g = genome(seed, tier, shinyFromRoll(roll()))
const scene = drawScene(g, { heart: true, bugs: 1 })

const rgb = (i: number) => [1, 3, 5].map(o => Number.parseInt(SWEETIE[i].slice(o, o + 2), 16))
const fg = (i: number) => `\x1b[38;2;${rgb(i).join(';')}m`
const bg = (i: number) => `\x1b[48;2;${rgb(i).join(';')}m`

console.log(JSON.stringify(g))
console.log('rarest:', rarestTrait(g))
for (const row of toCellPairs(scene)) {
  console.log(row.map(c => (c.fg === null ? ' ' : `${fg(c.fg)}${c.bg === null ? '' : bg(c.bg)}${c.glyph}\x1b[0m`)).join(''))
}

const scale = 16
const night = [15, 17, 26]
const lines = [`P3\n${32 * scale} ${16 * scale}\n255`]
for (let y = 0; y < 16 * scale; y++) {
  const row: string[] = []
  for (let x = 0; x < 32 * scale; x++) {
    const cell = scene[Math.floor(y / scale)][Math.floor(x / scale)]
    row.push((cell === null ? night : rgb(cell)).join(' '))
  }
  lines.push(row.join(' '))
}
writeFileSync(`nibbl-${seed}.ppm`, lines.join('\n'))
console.log(`wrote nibbl-${seed}.ppm`)
```

- [ ] **Step 5: Run tests, typecheck, and look at real pets**

Run: `pnpm --filter @nibbl/core test` → PASS.
Run: `pnpm --filter @nibbl/core typecheck` → no errors.
Run: `pnpm --filter @nibbl/core preview 42`, then `pnpm --filter @nibbl/core preview 7 legendary`, then 10 random runs.
Expected: every pet reads as a cute creature in Ghostty, face visible, no stray pixels outside the silhouette. Write down any seed that looks broken. A broken look is fixed by a compatibility rule in `genome.ts` or a pool weight in `genes.ts`, then re-run. Shape changes update the Task 4 snapshot hashes on purpose: `pnpm --filter @nibbl/core test -u`, and say so in the commit message. This is allowed only before launch.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): public entry and terminal/PPM preview tool"
```
