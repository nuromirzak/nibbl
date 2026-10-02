import type { EngineInterface } from 'claude-code'

import { K } from './config'

const HEX = '0123456789abcdef'

export const toHex = (buffer: ArrayBuffer): string => {
  let out = ''
  for (const byte of new Uint8Array(buffer)) out += HEX[byte >> 4]! + HEX[byte & 15]!
  return out
}

// crypto.subtle is one of the hooks module's globals (claude-code.d.ts) and exists in Node 24 too.
export const sha256Hex = async (text: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

// The owner formula (apps/api/scripts/admin-import-pet.ts): sha256(platform id + "nibbl") in lowercase
// hex, with the id exactly as the platform prints it. Byte #13 is bound to this value.
export const machineHashOf = (platformId: string): Promise<string> => sha256Hex(`${platformId}nibbl`)

export const parseIoreg = (stdout: string): string | null => /"IOPlatformUUID" = "([0-9A-F-]+)"/.exec(stdout)?.[1] ?? null

export const parseMachineId = (text: string): string | null => {
  const id = text.trim()
  return /^[0-9a-f]{32}$/.test(id) ? id : null
}

export const parseMachineGuid = (stdout: string): string | null => /MachineGuid\s+REG_SZ\s+([0-9A-Fa-f-]{36})/.exec(stdout)?.[1] ?? null

// macOS, then Linux, then Windows; each probe fails quietly where its tool or file is missing.
export const readPlatformId = async ($: EngineInterface): Promise<string | null> => {
  try {
    const mac = await $.process.run(['ioreg', '-rd1', '-c', 'IOPlatformExpertDevice'], { timeoutMs: 5_000 })
    const id = mac.exitCode === 0 ? parseIoreg(mac.stdout) : null
    if (id) return id
  } catch {
    // no ioreg: not macOS
  }
  try {
    const id = parseMachineId(await $.fs.read('/etc/machine-id'))
    if (id) return id
  } catch {
    // no /etc/machine-id
  }
  try {
    const id = parseMachineId(await $.fs.read('/var/lib/dbus/machine-id'))
    if (id) return id
  } catch {
    // no dbus machine-id
  }
  try {
    const win = await $.process.run(['reg', 'query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { timeoutMs: 5_000 })
    const id = win.exitCode === 0 ? parseMachineGuid(win.stdout) : null
    if (id) return id
  } catch {
    // no reg: not Windows
  }
  return null
}

// platform: probed just now; cache: a platform hash probed earlier; install: the random fallback.
export type HashSource = 'platform' | 'cache' | 'install'
export type MachineIdentity = { hash: string; source: HashSource }

const HASH = /^[0-9a-f]{64}$/

// The first platform hash is kept in the store and reused, so a probe that fails later (ioreg
// timing out, a sandbox without /etc/machine-id) never swaps this machine's identity.
// Spec section 10 fallback: with no platform id, a random install id kept in the store
// (a reinstall that wipes the store then means a new egg). Callers check the source before
// sending an install hash for a pet that may be bound to the platform hash.
export const machineIdentity = async ($: EngineInterface): Promise<MachineIdentity> => {
  // A pet hatched under the install id stays bound to it: a probe that works later must not
  // re-hatch it under the platform hash and wipe it as "moved".
  const saved = await $.store.get(K.installId)
  const pet = (await $.store.get(K.pet)) as { serial?: unknown } | undefined
  const installSerial = await $.store.get(K.installSerial)
  if (typeof saved === 'string' && saved.length >= 16 && installSerial !== undefined && pet?.serial === installSerial) {
    return { hash: await machineHashOf(saved), source: 'install' }
  }
  const cached = await $.store.get(K.machineHash)
  if (typeof cached === 'string' && HASH.test(cached)) return { hash: cached, source: 'cache' }
  const platformId = await readPlatformId($)
  if (platformId) {
    const hash = await machineHashOf(platformId)
    await $.store.set(K.machineHash, hash)
    return { hash, source: 'platform' }
  }
  if (typeof saved === 'string' && saved.length >= 16) return { hash: await machineHashOf(saved), source: 'install' }
  const fresh = crypto.randomUUID()
  await $.store.set(K.installId, fresh)
  return { hash: await machineHashOf(fresh), source: 'install' }
}

export const machineHash = async ($: EngineInterface): Promise<string> => (await machineIdentity($)).hash
