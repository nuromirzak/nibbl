export type PetRow = {
  serial: number
  machine_hash: string
  token_hash: string
  seed: number
  genome_key: string
  visual_key: string
  tier: string
  shiny: number
  genesis: number
  name: string | null
  label: string | null
  xp: number
  level: number
  is_bot: number
  is_hidden: number
  hatched_at: number
  last_sync_at: number | null
  name_changed_at: number | null
  label_changed_at: number | null
  rehatched_at: number | null
}

export const petBySerial = (db: D1Database, serial: number): Promise<PetRow | null> =>
  db.prepare('SELECT * FROM pets WHERE serial = ?').bind(serial).first<PetRow>()

export const petByMachine = (db: D1Database, machineHash: string): Promise<PetRow | null> =>
  db.prepare('SELECT * FROM pets WHERE machine_hash = ?').bind(machineHash).first<PetRow>()

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ')

// One query per candidate batch covers both unique columns.
export const takenKeys = async (
  db: D1Database,
  genomeKeys: string[],
  visualKeys: string[],
): Promise<{ genome: Set<string>; visual: Set<string> }> => {
  const { results } = await db
    .prepare(
      `SELECT genome_key, visual_key FROM pets WHERE genome_key IN (${placeholders(genomeKeys.length)}) OR visual_key IN (${placeholders(visualKeys.length)})`,
    )
    .bind(...genomeKeys, ...visualKeys)
    .all<{ genome_key: string; visual_key: string }>()
  return { genome: new Set(results.map(r => r.genome_key)), visual: new Set(results.map(r => r.visual_key)) }
}

export const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Error && err.message.includes('UNIQUE constraint failed')

export const counterValue = async (db: D1Database, name: string): Promise<number> =>
  (await db.prepare('SELECT value FROM counters WHERE name = ?').bind(name).first<number>('value')) ?? 0

export type OwnerView = {
  serial: number
  seed: number
  tier: string
  shiny: boolean
  genesis: boolean
  hatchedAt: number
  name: string | null
  label: string | null
  xp: number
  level: number
}

export const ownerView = (p: PetRow): OwnerView => ({
  serial: p.serial,
  seed: p.seed,
  tier: p.tier,
  shiny: p.shiny === 1,
  genesis: p.genesis === 1,
  hatchedAt: p.hatched_at,
  name: p.name,
  label: p.label,
  xp: p.xp,
  level: p.level,
})
