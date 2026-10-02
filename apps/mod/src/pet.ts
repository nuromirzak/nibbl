import { HOUR_MS, isTier, type Tier } from '@nibbl/core'

import type { NibblPetView } from '../types'

export const DEFAULT_NAME = 'Nibbl'

// The pet as the server knows it, plus what the mod remembers about its last sync.
export type ServerPet = {
  serial: number
  token: string
  seed: number
  tier: Tier
  shiny: boolean
  genesis: boolean
  hatchedAt: number
  name: string | null
  label: string | null
  xp: number
  level: number
  heartsHour: number
  heartsUsed: number
  lastSyncAt: number | null
}

// The local-only spike's record (store key `pet`): no serial, no token.
export type SpikePet = { seed: number; tier: Tier; shiny: boolean; hatchedAt: number; xp: number; name: string }

const TOKEN = /^[A-Za-z0-9_-]{43}$/
const isInt = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const isText = (v: unknown): v is string | null => v === null || typeof v === 'string'

export const isServerPet = (v: unknown): v is ServerPet => {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return (
    isInt(p.serial, 1, 999_999) &&
    typeof p.token === 'string' &&
    TOKEN.test(p.token) &&
    isInt(p.seed, -(2 ** 31), 0xffffffff) &&
    isTier(p.tier) &&
    typeof p.shiny === 'boolean' &&
    typeof p.genesis === 'boolean' &&
    isInt(p.hatchedAt, 0) &&
    isText(p.name) &&
    isText(p.label) &&
    isInt(p.xp, 0) &&
    isInt(p.level, 1) &&
    isInt(p.heartsHour, 0) &&
    isInt(p.heartsUsed, 0, 5) &&
    (p.lastSyncAt === null || isInt(p.lastSyncAt, 0))
  )
}

export const spikePetOf = (v: unknown): SpikePet | null => {
  if (typeof v !== 'object' || v === null) return null
  const p = v as Record<string, unknown>
  if ('serial' in p) return null
  if (!isInt(p.seed, -(2 ** 31), 0xffffffff) || !isTier(p.tier) || typeof p.shiny !== 'boolean') return null
  return {
    seed: p.seed >>> 0,
    tier: p.tier,
    shiny: p.shiny,
    hatchedAt: isInt(p.hatchedAt, 0) ? p.hatchedAt : 0,
    xp: isInt(p.xp, 0) ? p.xp : 0,
    name: typeof p.name === 'string' && p.name.length > 0 ? p.name : DEFAULT_NAME,
  }
}

// The owner view of /api/hatch and /api/import, with the token the mod holds for it.
export const fromOwnerView = (body: Record<string, unknown>, token: unknown, now: number): ServerPet | null => {
  const pet = {
    serial: body.serial,
    token,
    seed: body.seed,
    tier: body.tier,
    shiny: body.shiny,
    genesis: body.genesis,
    hatchedAt: body.hatchedAt,
    name: body.name ?? null,
    label: body.label ?? null,
    xp: body.xp,
    level: body.level,
    heartsHour: Math.floor(now / HOUR_MS),
    heartsUsed: 0,
    lastSyncAt: null,
  }
  return isServerPet(pet) ? { ...pet, seed: pet.seed >>> 0 } : null
}

export const displayName = (name: string | null): string => (name && name.length > 0 ? name : DEFAULT_NAME)

export const padSerial = (serial: number): string => String(serial).padStart(6, '0')

export const exportCode = (p: { serial: number; token: string }): string => `nibbl1:${p.serial}:${p.token}`

const CODE = /^nibbl1:(\d{1,6}):([A-Za-z0-9_-]{43})$/

export const parseCode = (raw: string): { serial: number; token: string } | null => {
  const m = CODE.exec(raw.trim())
  if (!m) return null
  const serial = Number(m[1])
  return serial >= 1 ? { serial, token: m[2]! } : null
}

export const viewOf = (pet: ServerPet | SpikePet, xp: number, heartsHour: number, heartsUsed: number): NibblPetView =>
  'serial' in pet
    ? {
        serial: pet.serial,
        seed: pet.seed,
        tier: pet.tier,
        shiny: pet.shiny,
        genesis: pet.genesis,
        name: displayName(pet.name),
        label: pet.label,
        xp,
        heartsHour,
        heartsUsed,
      }
    : { serial: null, seed: pet.seed, tier: pet.tier, shiny: pet.shiny, genesis: false, name: pet.name, label: null, xp, heartsHour, heartsUsed }
