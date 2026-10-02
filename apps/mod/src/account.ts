import { update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { apiBase, post, type ApiOutcome } from './api'
import { K, LABEL_MAX, NAME_MAX } from './config'
import { hatchNow } from './hatch'
import { machineHash } from './identity'
import { nameErrorText } from './messages'
import { refreshView } from './model'
import { displayName, fromOwnerView, padSerial, parseCode, type ServerPet } from './pet'
import { eggAtom } from './state'
import { dropQueues, forgetSpike, loadPet, loadSpike, savePet } from './store'

// The text of an export row starts with this; the CommandOutput hook draws the code under it.
export const EXPORT_MARK = 'Export code for '

const textOrNull = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

export const nameCommand = async ($: EngineInterface, field: 'name' | 'label', text: string): Promise<string> => {
  const pet = await loadPet($)
  if (!pet) {
    if (await loadSpike($)) return 'Your nibbl is still linking to the server. Try again in a minute.'
    return field === 'name' ? 'Hatch the egg first, then name it.' : 'Hatch the egg first, then give it a label.'
  }
  const max = field === 'name' ? NAME_MAX : LABEL_MAX
  if (field === 'name' && text.length === 0) return `Usage: /nibbl name <text>, 1 to ${NAME_MAX} characters.`
  if ([...text].length > max) return `A ${field} is at most ${max} characters.`
  const base = await apiBase($)
  const call = (p: ServerPet): Promise<ApiOutcome> => post($, base, '/api/name', { serial: p.serial, token: p.token, [field]: text })
  let out = await call(pet)
  if (out.kind === 'error' && out.status === 401) {
    const result = await hatchNow($, 'reauth')
    const fresh = result === 'hatched' ? await loadPet($) : null
    if (fresh) out = await call(fresh)
  }
  if (out.kind === 'offline') return 'Nibbl is offline right now. Try again later.'
  if (out.kind === 'error') return nameErrorText(field, out.code, out.retryAt, await $.clock.now())
  const name = textOrNull(out.body.name)
  const label = textOrNull(out.body.label)
  await savePet($, { ...((await loadPet($)) ?? pet), name, label })
  await refreshView($)
  if (field === 'name') return `Renamed to ${displayName(name)}.`
  return label ? `Label set to "${label}".` : 'Label cleared.'
}

// A command's text is a transcript row the model reads, so the token is never in it.
export const exportCommand = async ($: EngineInterface): Promise<string> => {
  const pet = await loadPet($)
  if (!pet) return 'Nothing to export yet: hatch the egg first.'
  return `${EXPORT_MARK}${displayName(pet.name)} #${padSerial(pet.serial)} is shown on screen only, not sent to the model. Keep it secret: anyone with it owns your pet. On the other machine run /nibbl import <code>.`
}

export const importCommand = async ($: EngineInterface, rest: string): Promise<string> => {
  const [raw = '', flag = ''] = rest.split(/\s+/)
  const code = parseCode(raw)
  if (!code) return 'That does not look like a nibbl code. A code looks like nibbl1:<serial>:<token>, from /nibbl export on the other machine.'
  const old = await loadPet($)
  if (old && old.serial !== code.serial && flag !== 'replace') {
    return `This machine already has ${displayName(old.name)} #${padSerial(old.serial)}. Run /nibbl export first and keep its code, then /nibbl import <code> replace.`
  }
  const now = await $.clock.now()
  const out = await post($, await apiBase($), '/api/import', { serial: code.serial, token: code.token, machineHash: await machineHash($) })
  if (out.kind === 'offline') return 'Nibbl is offline right now. Try the import again later.'
  if (out.kind === 'error') {
    return out.status === 401 ? 'The server did not accept that code. Check it, or export a fresh one on the other machine.' : `Import failed: ${out.code}.`
  }
  const pet = fromOwnerView(out.body, code.token, now)
  if (!pet) return 'Import failed: the server answered something unexpected.'
  const isSame = old !== null && old.serial === pet.serial
  // Queued events belong to the pet that was here before.
  if (!isSame) await dropQueues($)
  await savePet($, isSame && old ? { ...pet, heartsHour: old.heartsHour, heartsUsed: old.heartsUsed, lastSyncAt: old.lastSyncAt } : pet)
  for (const key of [K.egg, K.hatchWait, K.syncWait]) await $.store.delete(key)
  await forgetSpike($)
  await update($, eggAtom, () => 0)
  await refreshView($)
  return `${displayName(pet.name)} #${padSerial(pet.serial)} now lives on this machine.`
}
