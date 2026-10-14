import type { EngineInterface } from 'claude-code'

import { apiBase, postWithin, type ApiOutcome } from './api'
import { hatchNow } from './hatch'
import { padSerial, type ServerPet } from './pet'
import { parseWaveTarget, WAVE_USAGE, waveErrorText } from './social'
import { loadPet, loadSpike } from './store'

export const waveCommand = async ($: EngineInterface, rest: string): Promise<string> => {
  const to = parseWaveTarget(rest)
  if (to === null) return WAVE_USAGE
  const pet = await loadPet($)
  if (!pet) {
    if (await loadSpike($)) return 'Your nibbl is still linking to the server. Try again in a minute.'
    return 'Hatch the egg first, then wave at others.'
  }
  if (to === pet.serial) return "You can't wave at yourself."
  const base = await apiBase($)
  const call = (p: ServerPet): Promise<ApiOutcome> => postWithin($, base, '/api/wave', { serial: p.serial, token: p.token, to })
  let out = await call(pet)
  if (out.kind === 'error' && out.status === 401) {
    const result = await hatchNow($, 'reauth')
    const fresh = result === 'hatched' ? await loadPet($) : null
    if (fresh) out = await call(fresh)
  }
  if (out.kind === 'offline') return 'Could not reach the nibbl server. Try again later.'
  if (out.kind === 'error' && out.status === 401) return "Could not reach your pet's account. Try /nibbl wave again later."
  if (out.kind === 'error') return waveErrorText(out.status, out.code, to)
  const target = out.body.to
  const name = typeof target === 'object' && target !== null && typeof (target as { name?: unknown }).name === 'string' ? (target as { name: string }).name : null
  return `You waved at ${name && name.length > 0 ? name : `#${padSerial(to)}`} ♥`
}
