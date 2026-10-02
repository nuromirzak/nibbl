import { genomeKey, pickUnique, visualKey, type Genome } from '@nibbl/core'
import type { Deps, Env } from '../env'
import { isUniqueViolation, ownerView, petByMachine, takenKeys, type OwnerView, type PetRow } from '../lib/db'
import { randomToken, sha256Hex } from '../lib/hmac'
import { HttpError, json, machineHashOf, MAX_SMALL_BYTES, readJson } from '../lib/http'
import { ipBucket } from '../lib/ip'
import { BATCH, candidates } from '../lib/roll'

export const DAY_MS = 86_400_000
export const GENESIS_MS = 30 * DAY_MS
const MAX_ATTEMPTS = 3

// Both hatch paths answer with the same shape: everything the owner sees, plus the token.
export type HatchResult = OwnerView & { token: string }

const hatchResult = (pet: PetRow, token: string): HatchResult => ({ ...ownerView(pet), token })

const launchAtOf = (env: Env): number => {
  const launchAt = Date.parse(env.LAUNCH_AT)
  if (!env.ROLL_SECRET || !env.IP_SALT || !Number.isFinite(launchAt)) throw new HttpError(503, 'not_configured')
  return launchAt
}

// New hatches per IP (IPv6: per /64) per UTC day. High enough for a team behind one NAT,
// low enough that filling the board from one address takes days.
export const HATCHES_PER_IP_DAY = 100

// The hash includes the UTC day, so each day's count lives in its own row and the limit
// resets at midnight. The raw IP never reaches D1.
export const ipDayHash = (salt: string, bucket: string, now: number): Promise<string> =>
  sha256Hex(`${bucket}|${salt}|${Math.floor(now / DAY_MS)}`)

// Concurrent hatches can overshoot by a few: the check and the counted insert are separate
// statements. The cap is a soft abuse brake, not an accounting system.
const assertIpAllowed = async (db: D1Database, ipHash: string, now: number) => {
  const count = await db.prepare('SELECT count FROM hatch_ip WHERE ip_hash = ?').bind(ipHash).first<number | null>('count')
  if (count !== null && count >= HATCHES_PER_IP_DAY) {
    throw new HttpError(429, 'hatch_rate_limited', { retryAt: (Math.floor(now / DAY_MS) + 1) * DAY_MS })
  }
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

// Re-hatching a known machine rotates the token, so it is capped at once a minute per pet.
export const REHATCH_EVERY_MS = 60_000

const rehatchLimited = (at: number | null, now: number): HttpError | null =>
  at !== null && now - at < REHATCH_EVERY_MS ? new HttpError(429, 'rehatch_rate_limited', { retryAt: at + REHATCH_EVERY_MS }) : null

// Only the token hash is stored, so a known machine gets its pet back with a fresh token.
const reissue = async (db: D1Database, pet: PetRow, now: number): Promise<HatchResult> => {
  const early = rehatchLimited(pet.rehatched_at, now)
  if (early) throw early
  const token = randomToken()
  // Guarded in SQL so concurrent re-hatches cannot all rotate the token.
  const res = await db
    .prepare('UPDATE pets SET token_hash = ?, rehatched_at = ? WHERE serial = ? AND (rehatched_at IS NULL OR rehatched_at <= ?)')
    .bind(await sha256Hex(token), now, pet.serial, now - REHATCH_EVERY_MS)
    .run()
  if (res.meta.changes === 0) {
    const fresh = await db.prepare('SELECT rehatched_at FROM pets WHERE serial = ?').bind(pet.serial).first<number | null>('rehatched_at')
    throw rehatchLimited(fresh ?? now, now) ?? new HttpError(503, 'busy')
  }
  return hatchResult(pet, token)
}

export const hatch = async (request: Request, env: Env, deps: Deps): Promise<Response> => {
  const body = await readJson(request, MAX_SMALL_BYTES)
  const machineHash = machineHashOf(body.machineHash)
  const launchAt = launchAtOf(env)
  const now = deps.now()
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const existing = await petByMachine(env.DB, machineHash)
    if (existing) return json(await reissue(env.DB, existing, now))
    const ipHash = await ipDayHash(env.IP_SALT, ipBucket(request.headers.get('cf-connecting-ip') ?? 'unknown'), now)
    await assertIpAllowed(env.DB, ipHash, now)
    const g = await pickGenome(env, machineHash)
    const token = randomToken()
    const genesis = now < launchAt + GENESIS_MS
    try {
      // One batch is one transaction: the counter bump rolls back if the insert fails.
      const [, inserted] = await env.DB.batch([
        env.DB.prepare("UPDATE counters SET value = value + 1 WHERE name IN ('serial', 'hatched')"),
        env.DB.prepare(
          `INSERT INTO pets (serial, machine_hash, token_hash, seed, genome_key, visual_key, tier, shiny, genesis, hatched_at)
           VALUES ((SELECT value FROM counters WHERE name = 'serial'), ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        ).bind(machineHash, await sha256Hex(token), g.seed, genomeKey(g), visualKey(g), g.tier, g.shiny ? 1 : 0, genesis ? 1 : 0, now),
        env.DB.prepare(
          'INSERT INTO hatch_ip (ip_hash, count, last_at) VALUES (?, 1, ?) ON CONFLICT (ip_hash) DO UPDATE SET count = count + 1, last_at = excluded.last_at',
        ).bind(ipHash, now),
      ])
      return json(hatchResult(inserted.results[0] as PetRow, token))
    } catch (err) {
      // A concurrent hatch took this machine or this genome; re-read and try again.
      if (isUniqueViolation(err)) continue
      throw err
    }
  }
  throw new HttpError(503, 'busy')
}
