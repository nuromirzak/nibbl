import { genomeKey, pickUnique, visualKey, type Genome } from '@nibbl/core'
import type { Deps, Env } from '../env'
import { isUniqueViolation, petByMachine, takenKeys, type PetRow } from '../lib/db'
import { randomToken, sha256Hex } from '../lib/hmac'
import { HttpError, json, machineHashOf, MAX_SMALL_BYTES, readJson } from '../lib/http'
import { BATCH, candidates } from '../lib/roll'

export const DAY_MS = 86_400_000
export const GENESIS_MS = 30 * DAY_MS
const MAX_ATTEMPTS = 3

export type HatchResult = {
  serial: number
  token: string
  seed: number
  tier: string
  shiny: boolean
  genesis: boolean
  hatchedAt: number
}

const launchAtOf = (env: Env): number => {
  const launchAt = Date.parse(env.LAUNCH_AT)
  if (!env.ROLL_SECRET || !env.IP_SALT || !Number.isFinite(launchAt)) throw new HttpError(503, 'not_configured')
  return launchAt
}

// The salt rotates at UTC midnight, so the limit checks today's and yesterday's hash to keep
// a true 24 h window. The raw IP never reaches D1.
export const ipHashes = async (salt: string, ip: string, now: number): Promise<{ today: string; yesterday: string }> => {
  const day = Math.floor(now / DAY_MS)
  return { today: await sha256Hex(`${ip}|${salt}|${day}`), yesterday: await sha256Hex(`${ip}|${salt}|${day - 1}`) }
}

const assertIpAllowed = async (db: D1Database, hashes: { today: string; yesterday: string }, now: number) => {
  const last = await db
    .prepare('SELECT MAX(last_at) AS last FROM hatch_ip WHERE ip_hash IN (?, ?)')
    .bind(hashes.today, hashes.yesterday)
    .first<number | null>('last')
  if (last !== null && now - last < DAY_MS) throw new HttpError(429, 'hatch_rate_limited', { retryAt: last + DAY_MS })
}

const pickGenome = async (env: Env, machineHash: string): Promise<Genome> => {
  for (const from of [0, BATCH]) {
    const list = await candidates(env.ROLL_SECRET, machineHash, from)
    const taken = await takenKeys(env.DB, list.map(genomeKey), list.map(visualKey))
    const picked = pickUnique(list, key => taken.genome.has(key), key => taken.visual.has(key))
    if (picked) return picked
  }
  throw new HttpError(503, 'no_unique_genome')
}

// Only the token hash is stored, so a known machine gets its pet back with a fresh token.
const reissue = async (db: D1Database, pet: PetRow): Promise<HatchResult> => {
  const token = randomToken()
  await db.prepare('UPDATE pets SET token_hash = ? WHERE serial = ?').bind(await sha256Hex(token), pet.serial).run()
  return {
    serial: pet.serial,
    token,
    seed: pet.seed,
    tier: pet.tier,
    shiny: pet.shiny === 1,
    genesis: pet.genesis === 1,
    hatchedAt: pet.hatched_at,
  }
}

export const hatch = async (request: Request, env: Env, deps: Deps): Promise<Response> => {
  const body = await readJson(request, MAX_SMALL_BYTES)
  const machineHash = machineHashOf(body.machineHash)
  const launchAt = launchAtOf(env)
  const now = deps.now()
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const existing = await petByMachine(env.DB, machineHash)
    if (existing) return json(await reissue(env.DB, existing))
    const ip = await ipHashes(env.IP_SALT, request.headers.get('cf-connecting-ip') ?? 'unknown', now)
    await assertIpAllowed(env.DB, ip, now)
    const g = await pickGenome(env, machineHash)
    const token = randomToken()
    const genesis = now < launchAt + GENESIS_MS
    try {
      // One batch is one transaction: the counter bump rolls back if the insert fails.
      const [, inserted] = await env.DB.batch([
        env.DB.prepare("UPDATE counters SET value = value + 1 WHERE name IN ('serial', 'hatched')"),
        env.DB.prepare(
          `INSERT INTO pets (serial, machine_hash, token_hash, seed, genome_key, visual_key, tier, shiny, genesis, hatched_at)
           VALUES ((SELECT value FROM counters WHERE name = 'serial'), ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING serial`,
        ).bind(machineHash, await sha256Hex(token), g.seed, genomeKey(g), visualKey(g), g.tier, g.shiny ? 1 : 0, genesis ? 1 : 0, now),
        env.DB.prepare(
          'INSERT INTO hatch_ip (ip_hash, last_at) VALUES (?, ?) ON CONFLICT (ip_hash) DO UPDATE SET last_at = excluded.last_at',
        ).bind(ip.today, now),
      ])
      const serial = (inserted.results[0] as { serial: number }).serial
      const result: HatchResult = { serial, token, seed: g.seed, tier: g.tier, shiny: g.shiny, genesis, hatchedAt: now }
      return json(result)
    } catch (err) {
      // A concurrent hatch took this machine or this genome; re-read and try again.
      if (isUniqueViolation(err)) continue
      throw err
    }
  }
  throw new HttpError(503, 'busy')
}
