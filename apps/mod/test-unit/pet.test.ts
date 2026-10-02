import { describe, expect, it } from 'vitest'
import { displayName, exportCode, fromOwnerView, isServerPet, padSerial, parseCode, spikePetOf, viewOf } from '../src/pet'

const TOKEN = 'A'.repeat(43)
const OWNER = { serial: 42, seed: 123456, tier: 'rare', shiny: false, genesis: true, hatchedAt: 1_000, name: null, label: null, xp: 0, level: 1 }
const HOUR = 3_600_000

describe('fromOwnerView', () => {
  it('builds a server pet from the hatch/import answer and a token', () => {
    expect(fromOwnerView({ ...OWNER, token: TOKEN }, TOKEN, 5 * HOUR + 7)).toEqual({
      ...OWNER,
      token: TOKEN,
      heartsHour: 5,
      heartsUsed: 0,
      lastSyncAt: null,
    })
  })

  it('rejects answers with a bad serial, token, tier or xp', () => {
    expect(fromOwnerView({ ...OWNER, serial: 0 }, TOKEN, 0)).toBeNull()
    expect(fromOwnerView(OWNER, 'short', 0)).toBeNull()
    expect(fromOwnerView({ ...OWNER, tier: 'mythic' }, TOKEN, 0)).toBeNull()
    expect(fromOwnerView({ ...OWNER, xp: -1 }, TOKEN, 0)).toBeNull()
    expect(fromOwnerView({ ...OWNER, name: 7 }, TOKEN, 0)).toBeNull()
  })

  it('normalizes the seed to an unsigned 32-bit integer', () => {
    expect(fromOwnerView({ ...OWNER, seed: -1 }, TOKEN, 0)?.seed).toBe(0xffffffff)
  })
})

describe('isServerPet', () => {
  it('accepts a full record and refuses a damaged one', () => {
    const pet = fromOwnerView(OWNER, TOKEN, 0)!
    expect(isServerPet(pet)).toBe(true)
    expect(isServerPet({ ...pet, heartsUsed: 6 })).toBe(false)
    expect(isServerPet({ ...pet, serial: '42' })).toBe(false)
    expect(isServerPet('junk')).toBe(false)
  })
})

describe('spikePetOf', () => {
  it("reads the spike's pet record (Byte) and refuses server records and junk", () => {
    const byte = { seed: 4125214855, tier: 'common', shiny: false, hatchedAt: 1_000, xp: 290, name: 'Byte' }
    expect(spikePetOf(byte)).toEqual(byte)
    expect(spikePetOf({ ...byte, serial: 13 })).toBeNull()
    expect(spikePetOf({ seed: 'x', tier: 'common', shiny: false })).toBeNull()
    expect(spikePetOf({ seed: 1, tier: 'common', shiny: false })).toEqual({ seed: 1, tier: 'common', shiny: false, hatchedAt: 0, xp: 0, name: 'Nibbl' })
  })
})

describe('names, serials and export codes', () => {
  it('shows Nibbl for an unnamed pet and pads serials to 6 digits', () => {
    expect(displayName(null)).toBe('Nibbl')
    expect(displayName('Byte')).toBe('Byte')
    expect(padSerial(13)).toBe('000013')
  })

  it('round-trips an export code and refuses anything else', () => {
    const code = exportCode({ serial: 13, token: TOKEN })
    expect(code).toBe(`nibbl1:13:${TOKEN}`)
    expect(parseCode(`  ${code} `)).toEqual({ serial: 13, token: TOKEN })
    expect(parseCode(`nibbl1:0:${TOKEN}`)).toBeNull()
    expect(parseCode(`nibbl2:13:${TOKEN}`)).toBeNull()
    expect(parseCode('nibbl1:13:short')).toBeNull()
  })
})

describe('viewOf', () => {
  it('turns a server pet and a spike pet into what the band draws', () => {
    const pet = { ...fromOwnerView({ ...OWNER, label: 'night coder' }, TOKEN, 0)! }
    expect(viewOf(pet, 12, 3, 2)).toEqual({ serial: 42, seed: 123456, tier: 'rare', shiny: false, genesis: true, name: 'Nibbl', label: 'night coder', xp: 12, heartsHour: 3, heartsUsed: 2 })
    const spike = spikePetOf({ seed: 9, tier: 'epic', shiny: true, hatchedAt: 0, xp: 290, name: 'Byte' })!
    expect(viewOf(spike, 293, 3, 0)).toEqual({ serial: null, seed: 9, tier: 'epic', shiny: true, genesis: false, name: 'Byte', label: null, xp: 293, heartsHour: 3, heartsUsed: 0 })
  })
})
