import { genome, genomeKey, inheritsMark, pickUnique, visualKey, type Genome, type Tier } from '@nibbl/core'
import type { Deps, Env } from '../env'
import { isUniqueViolation, ownerView, petByMachine, takenKeys, type OwnerView, type PetRow } from '../lib/db'
import { randomToken, sha256Hex } from '../lib/hmac'
import { HttpError, json, machineHashOf, MAX_SERIAL, MAX_SMALL_BYTES, readJson } from '../lib/http'
import { ipBucket } from '../lib/ip'
import { isMissingSchema } from '../lib/retention'
import { giftHash, normalizeGift } from './gift'
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

// Fast path only: it spares the genome roll for IPs already at the cap. The hard cap is the
// CHECK (count <= 100) on hatch_ip.count (migration 0001, keep in sync with HATCHES_PER_IP_DAY),
// which fails the hatch batch atomically when concurrent hatches race past this read.
const limitedUntil = (now: number) => new HttpError(429, 'hatch_rate_limited', { retryAt: (Math.floor(now / DAY_MS) + 1) * DAY_MS })

const isCheckViolation = (err: unknown): boolean => err instanceof Error && err.message.includes('CHECK constraint failed')

const assertIpAllowed = async (db: D1Database, ipHash: string, now: number) => {
  const count = await db.prepare('SELECT count FROM hatch_ip WHERE ip_hash = ?').bind(ipHash).first<number | null>('count')
  if (count !== null && count >= HATCHES_PER_IP_DAY) {
    throw limitedUntil(now)
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

export const GIFT_CANDIDATES = 96

type GiftParent = { hash: string; genome: Genome }

// A gift counts only while unredeemed, from a real, visible pet on another machine. Anything else is ignored silently.
const validGift = async (db: D1Database, code: string | null, machineHash: string): Promise<GiftParent | null> => {
  if (code === null) return null
  const hash = await giftHash(code)
  try {
    const row = await db
      .prepare(
        `SELECT p.seed, p.tier, p.shiny FROM gift_codes g JOIN pets p ON p.serial = g.from_serial
         WHERE g.code_hash = ? AND g.redeemed_by IS NULL AND p.is_hidden = 0 AND p.is_bot = 0 AND p.machine_hash != ?`,
      )
      .bind(hash, machineHash)
      .first<{ seed: number; tier: string; shiny: number }>()
    return row ? { hash, genome: genome(row.seed, row.tier as Tier, row.shiny === 1) } : null
  } catch (err) {
    if (isMissingSchema(err)) return null
    throw err
  }
}

// Best effort: the first unique candidate (of up to 96) that carries the parent's mark; null when none does.
// Candidates are made lazily in chunks, so an early match never pays for the later ones.
export const GIFT_CHUNK = 24

export const pickInherited = async (
  env: Env,
  machineHash: string,
  parent: Genome,
  make: typeof candidates = candidates,
): Promise<Genome | null> => {
  for (let from = 0; from < GIFT_CANDIDATES; from += GIFT_CHUNK) {
    const chunk = (await make(env.ROLL_SECRET, machineHash, from, GIFT_CHUNK)).filter(c => inheritsMark(c, parent))
    if (chunk.length === 0) continue
    const taken = await takenKeys(env.DB, chunk.map(genomeKey), chunk.map(visualKey))
    const picked = pickUnique(chunk, key => taken.genome.has(key), key => taken.visual.has(key))
    if (picked) return picked
  }
  return null
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

const inviteOf = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_SERIAL ? v : null

// An invite counts only from a real, visible pet on another machine. Anything else is ignored silently.
const validInviter = async (db: D1Database, serial: number | null, machineHash: string): Promise<number | null> => {
  if (serial === null) return null
  const row = await db
    .prepare('SELECT serial FROM pets WHERE serial = ? AND is_hidden = 0 AND is_bot = 0 AND machine_hash != ?')
    .bind(serial, machineHash)
    .first<{ serial: number }>()
  return row ? row.serial : null
}

export const hatch = async (request: Request, env: Env, deps: Deps): Promise<Response> => {
  const body = await readJson(request, MAX_SMALL_BYTES)
  const machineHash = machineHashOf(body.machineHash)
  const launchAt = launchAtOf(env)
  const now = deps.now()
  const invite = inviteOf(body.invite)
  const giftCode = normalizeGift(body.gift)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const existing = await petByMachine(env.DB, machineHash)
    if (existing) return json(await reissue(env.DB, existing, now))
    const ipHash = await ipDayHash(env.IP_SALT, ipBucket(request.headers.get('cf-connecting-ip') ?? 'unknown'), now)
    try {
      await assertIpAllowed(env.DB, ipHash, now)
    } catch (err) {
      // A concurrent hatch of this same machine from this IP may have just used the last slot.
      const raced = err instanceof HttpError && err.status === 429 ? await petByMachine(env.DB, machineHash) : null
      if (raced) return json(await reissue(env.DB, raced, now))
      throw err
    }
    const giftParent = await validGift(env.DB, giftCode, machineHash)
    const g = (giftParent && (await pickInherited(env, machineHash, giftParent.genome))) || (await pickGenome(env, machineHash))
    const token = randomToken()
    const genesis = now < launchAt + GENESIS_MS
    try {
      // One batch is one transaction: the counter bump rolls back if the insert fails.
      const tokenHash = await sha256Hex(token)
      const newSerial = "(SELECT value FROM counters WHERE name = 'serial')"
      // A gift hatch: the redemption claims the row first, so every later statement is tied to it landing
      // (redeemed_by = this serial). A lost race leaves the pet unlinked, no friends bond, no notice.
      const giftBatch = (hash: string) => [
        env.DB.prepare(`UPDATE gift_codes SET redeemed_by = ${newSerial}, redeemed_at = ? WHERE code_hash = ? AND redeemed_by IS NULL`).bind(now, hash),
        env.DB.prepare(
          `INSERT INTO pets (serial, machine_hash, token_hash, seed, genome_key, visual_key, tier, shiny, genesis, hatched_at, invited_by)
           VALUES (${newSerial}, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT from_serial FROM gift_codes WHERE code_hash = ? AND redeemed_by = ${newSerial})) RETURNING *`,
        ).bind(machineHash, tokenHash, g.seed, genomeKey(g), visualKey(g), g.tier, g.shiny ? 1 : 0, genesis ? 1 : 0, now, hash),
      ]
      const giftBonds = (hash: string) => [
        env.DB.prepare(
          `INSERT OR IGNORE INTO pet_achievements (serial, id, at) SELECT redeemed_by, 'friends', ? FROM gift_codes WHERE code_hash = ? AND redeemed_by = ${newSerial}`,
        ).bind(now, hash),
        env.DB.prepare(
          `INSERT OR IGNORE INTO pet_achievements (serial, id, at) SELECT from_serial, 'friends', ? FROM gift_codes WHERE code_hash = ? AND redeemed_by = ${newSerial}`,
        ).bind(now, hash),
        env.DB.prepare(
          `INSERT INTO invite_notices (to_serial, from_serial, created_at, via_gift) SELECT from_serial, redeemed_by, ?, 1 FROM gift_codes WHERE code_hash = ? AND redeemed_by = ${newSerial}`,
        ).bind(now, hash),
      ]
      const insertBatch = (inviter: number | null, gift: string | null = null) => [
        env.DB.prepare("UPDATE counters SET value = value + 1 WHERE name IN ('serial', 'hatched')"),
        ...(gift !== null
          ? giftBatch(gift)
          : [
              env.DB.prepare(
                `INSERT INTO pets (serial, machine_hash, token_hash, seed, genome_key, visual_key, tier, shiny, genesis, hatched_at${inviter === null ? '' : ', invited_by'})
           VALUES ((SELECT value FROM counters WHERE name = 'serial'), ?, ?, ?, ?, ?, ?, ?, ?, ?${inviter === null ? '' : ', ?'}) RETURNING *`,
              ).bind(machineHash, tokenHash, g.seed, genomeKey(g), visualKey(g), g.tier, g.shiny ? 1 : 0, genesis ? 1 : 0, now, ...(inviter === null ? [] : [inviter])),
            ]),
        env.DB.prepare(
          'INSERT INTO hatch_ip (ip_hash, count, last_at) VALUES (?, 1, ?) ON CONFLICT (ip_hash) DO UPDATE SET count = count + 1, last_at = excluded.last_at',
        ).bind(ipHash, now),
        ...(gift !== null ? giftBonds(gift) : []),
        // Friends bond for both pets, plus a notice the inviter's next sync delivers. No XP, no odds.
        ...(gift !== null || inviter === null
          ? []
          : [
              env.DB.prepare("INSERT OR IGNORE INTO pet_achievements (serial, id, at) VALUES ((SELECT value FROM counters WHERE name = 'serial'), 'friends', ?)").bind(now),
              env.DB.prepare("INSERT OR IGNORE INTO pet_achievements (serial, id, at) VALUES (?, 'friends', ?)").bind(inviter, now),
              env.DB.prepare("INSERT INTO invite_notices (to_serial, from_serial, created_at) VALUES (?, (SELECT value FROM counters WHERE name = 'serial'), ?)").bind(inviter, now),
            ]),
      ]
      const inviter = giftParent ? null : await validInviter(env.DB, invite, machineHash)
      let results: D1Result[]
      try {
        results = await env.DB.batch(insertBatch(inviter, giftParent?.hash ?? null))
      } catch (err) {
        // Worker deployed before migration 0004 / 0006: hatch without the invite or gift rather than fail.
        if ((inviter === null && giftParent === null) || !isMissingSchema(err)) throw err
        results = await env.DB.batch(insertBatch(null))
      }
      const inserted = results.find(r => r.results.length > 0 && 'serial' in (r.results[0] as object))!
      return json(hatchResult(inserted.results[0] as PetRow, token))
    } catch (err) {
      // A concurrent hatch took this machine or this genome; re-read and try again.
      if (isUniqueViolation(err)) continue
      // Lost the race for the last slots of this IP's day; the batch rolled back.
      if (isCheckViolation(err)) {
        const raced = await petByMachine(env.DB, machineHash)
        if (raced) return json(await reissue(env.DB, raced, now))
        throw limitedUntil(now)
      }
      throw err
    }
  }
  throw new HttpError(503, 'busy')
}
