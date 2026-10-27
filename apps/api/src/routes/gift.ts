import type { Deps, Env } from '../env'
import { authPet } from '../lib/auth'
import { hmacSha256, sha256Hex } from '../lib/hmac'
import { HttpError, json, MAX_SMALL_BYTES, readJson } from '../lib/http'
import { isMissingSchema } from '../lib/retention'

export const MILESTONES = [10, 25] as const
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

// Deterministic, unforgeable without ROLL_SECRET: 10 base32 chars (50 bits) of HMAC(secret, "gift:serial:milestone").
export const giftCode = async (secret: string, serial: number, milestone: number): Promise<string> => {
  const bytes = await hmacSha256(secret, `gift:${serial}:${milestone}`)
  return Array.from(bytes.slice(0, 10), b => ALPHABET[b % 32]).join('')
}

export const formatGift = (code: string): string => `${code.slice(0, 5)}-${code.slice(5)}`

// Uppercase, `-` and whitespace stripped; null unless 10 base32 chars remain.
export const normalizeGift = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length > 64) return null
  const code = v.replace(/[-\s]/g, '').toUpperCase()
  return /^[0-9A-Z]{10}$/.test(code) ? code : null
}

export const giftHash = (code: string): Promise<string> => sha256Hex(code)

type Egg = { milestone: 10 | 25; status: 'ready' | 'hatched' | 'locked'; code?: string; by?: { serial: number; name: string | null } }

export const gift = async (request: Request, env: Env, deps: Deps): Promise<Response> => {
  const body = await readJson(request, MAX_SMALL_BYTES)
  const pet = await authPet(env.DB, body)
  if (pet.is_hidden === 1) throw new HttpError(404, 'not_found')
  if (!env.ROLL_SECRET) throw new HttpError(503, 'not_configured')
  const now = deps.now()
  const unlocked = MILESTONES.filter(m => pet.level >= m)
  const codes = new Map<number, { code: string; hash: string }>()
  for (const m of unlocked) {
    const code = await giftCode(env.ROLL_SECRET, pet.serial, m)
    codes.set(m, { code, hash: await giftHash(code) })
  }
  let rows: { milestone: number; redeemed_by: number | null; name: string | null }[] = []
  try {
    if (unlocked.length > 0) {
      await env.DB.batch(
        unlocked.map(m =>
          env.DB.prepare('INSERT OR IGNORE INTO gift_codes (code_hash, from_serial, milestone, created_at) VALUES (?, ?, ?, ?)').bind(codes.get(m)!.hash, pet.serial, m, now),
        ),
      )
    }
    rows = (
      await env.DB.prepare(
        `SELECT g.milestone, g.redeemed_by, p.name FROM gift_codes g LEFT JOIN pets p ON p.serial = g.redeemed_by WHERE g.from_serial = ?`,
      )
        .bind(pet.serial)
        .all<{ milestone: number; redeemed_by: number | null; name: string | null }>()
    ).results
  } catch (err) {
    if (isMissingSchema(err)) throw new HttpError(503, 'unavailable')
    throw err
  }
  const eggs: Egg[] = MILESTONES.map(milestone => {
    const c = codes.get(milestone)
    if (!c) return { milestone, status: 'locked' }
    const row = rows.find(r => r.milestone === milestone)
    if (row?.redeemed_by != null) return { milestone, status: 'hatched', by: { serial: row.redeemed_by, name: row.name } }
    return { milestone, status: 'ready', code: formatGift(c.code) }
  })
  return json({ eggs })
}
