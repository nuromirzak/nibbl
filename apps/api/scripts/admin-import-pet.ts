// One-off owner tool: moves a locally rolled spike pet into D1, bound to this Mac, so the
// real mod's first /api/hatch returns it (the server finds the machine and re-issues a token).
// It bypasses the server roll on purpose; see docs/decisions/0015-owner-pet-import.md.
//
//   pnpm -C apps/api exec tsx scripts/admin-import-pet.ts --store <plugin store json>        # prints SQL
//   pnpm -C apps/api exec tsx scripts/admin-import-pet.ts --store <file> --apply             # runs it remotely
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { genome, genomeKey, isTier, levelFromXp, visualKey } from '@nibbl/core'

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
const fail = (message: string): never => {
  console.error(`admin-import-pet: ${message}`)
  process.exit(1)
}

const storePath = arg('store') ?? fail('--store is required')
const pet = JSON.parse(readFileSync(storePath, 'utf8')).pet ?? fail('store has no pet')
if (!Number.isInteger(pet.seed) || !isTier(pet.tier) || typeof pet.shiny !== 'boolean') fail('pet has no valid seed/tier/shiny')
if (!Number.isInteger(pet.xp) || pet.xp < 0 || !Number.isInteger(pet.hatchedAt)) fail('pet has no valid xp/hatchedAt')

// Same formula the mod uses: sha256(IOPlatformUUID + "nibbl"), lowercase hex.
const ioreg = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8' })
const uuid = /"IOPlatformUUID" = "([0-9A-F-]+)"/.exec(ioreg)?.[1] ?? fail('IOPlatformUUID not found')
const machineHash = createHash('sha256').update(`${uuid}nibbl`).digest('hex')

const g = genome(pet.seed, pet.tier, pet.shiny)
const level = levelFromXp(pet.xp).level
// The token is never used: the mod re-hatches by machineHash and receives a fresh one.
const tokenHash = createHash('sha256').update(randomBytes(32).toString('base64url')).digest('hex')
const LAUNCH_AT = Date.parse('2026-10-31T00:00:00Z')
const genesis = pet.hatchedAt < LAUNCH_AT + 30 * 86_400_000 ? 1 : 0
const name = typeof pet.name === 'string' ? pet.name.slice(0, 16) : null
const q = (v: string | null) => (v === null ? 'NULL' : `'${v.replaceAll("'", "''")}'`)

const sql = `UPDATE counters SET value = value + 1 WHERE name = 'serial';
INSERT INTO pets (serial, machine_hash, token_hash, seed, genome_key, visual_key, tier, shiny, genesis, name, xp, level, hatched_at, last_sync_at)
VALUES ((SELECT value FROM counters WHERE name = 'serial'), ${q(machineHash)}, ${q(tokenHash)}, ${g.seed}, ${q(genomeKey(g))}, ${q(visualKey(g))}, ${q(g.tier)}, ${g.shiny ? 1 : 0}, ${genesis}, ${q(name)}, ${pet.xp}, ${level}, ${pet.hatchedAt}, ${Date.now()});
UPDATE counters SET value = value + 1 WHERE name = 'hatched';
SELECT serial, name, tier, xp, level, genesis FROM pets WHERE machine_hash = ${q(machineHash)};
`

if (!process.argv.includes('--apply')) {
  console.log(sql)
  process.exit(0)
}
const file = join(tmpdir(), `nibbl-import-${process.pid}.sql`)
writeFileSync(file, sql)
console.log(execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'nibbl', '--remote', '--file', file, '--yes'], { encoding: 'utf8' }))
