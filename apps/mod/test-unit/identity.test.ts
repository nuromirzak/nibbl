import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { machineHashOf, parseIoreg, parseMachineGuid, parseMachineId, sha256Hex } from '../src/identity'

const nodeSha = (text: string) => createHash('sha256').update(text).digest('hex')

describe('sha256Hex', () => {
  it('matches the standard vectors', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('machineHashOf', () => {
  it('is sha256(id + "nibbl"), the formula admin-import-pet.ts bound Byte #13 to', async () => {
    for (const id of ['00000000-1111-2222-3333-444444444444', '886F1677-3439-5FA1-0000-000000000000', 'id with é and spaces']) {
      expect(await machineHashOf(id)).toBe(nodeSha(`${id}nibbl`))
    }
    expect(await machineHashOf('00000000-1111-2222-3333-444444444444')).toBe('d4d91bc229462201b2fcabce098ea6c0b87d96dc1cc89d9e3a5e595ae4b320eb')
    expect(await machineHashOf('0123456789abcdef0123456789abcdef')).toBe('a61668ce28a623107e26779f93ab8f0940dc9fc0455c8e8c0f81759923d6a369')
    expect(await machineHashOf('8f2b1c3d-0000-4e5f-9a8b-1234567890ab')).toBe('65b5f942882e4830e59f1402404209647b2896e3c2d0d6b2e15bc7ecf586768e')
  })
})

describe('platform id parsers', () => {
  it('reads IOPlatformUUID from ioreg output exactly as printed', () => {
    const out = '+-o J314sAP  <class IOPlatformExpertDevice>\n    {\n      "IOPlatformSerialNumber" = "XYZ"\n      "IOPlatformUUID" = "886F1677-3439-5FA1-0000-000000000000"\n    }\n'
    expect(parseIoreg(out)).toBe('886F1677-3439-5FA1-0000-000000000000')
    expect(parseIoreg('no uuid here')).toBeNull()
  })

  it('reads a Linux machine-id and rejects anything else', () => {
    expect(parseMachineId('0123456789abcdef0123456789abcdef\n')).toBe('0123456789abcdef0123456789abcdef')
    expect(parseMachineId('not-an-id\n')).toBeNull()
  })

  it('reads MachineGuid from reg query output', () => {
    const out = '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    8f2b1c3d-0000-4e5f-9a8b-1234567890ab\r\n\r\n'
    expect(parseMachineGuid(out)).toBe('8f2b1c3d-0000-4e5f-9a8b-1234567890ab')
    expect(parseMachineGuid('ERROR: The system was unable to find the specified registry key')).toBeNull()
  })
})
