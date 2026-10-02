import type { Deps, Env } from '../env'
import { authPet } from '../lib/auth'
import { ownerView, petBySerial } from '../lib/db'
import { HttpError, json, machineHashOf, MAX_SMALL_BYTES, readJson } from '../lib/http'

export const importPet = async (request: Request, env: Env, _deps: Deps): Promise<Response> => {
  const body = await readJson(request, MAX_SMALL_BYTES)
  const pet = await authPet(env.DB, body)
  const machineHash = machineHashOf(body.machineHash)
  if (pet.machine_hash !== machineHash) {
    // A pet the target machine hatched earlier keeps living under its own export code.
    await env.DB.batch([
      env.DB.prepare("UPDATE pets SET machine_hash = 'released:' || serial WHERE machine_hash = ? AND serial != ?").bind(
        machineHash,
        pet.serial,
      ),
      env.DB.prepare('UPDATE pets SET machine_hash = ? WHERE serial = ?').bind(machineHash, pet.serial),
    ])
  }
  const fresh = await petBySerial(env.DB, pet.serial)
  if (!fresh) throw new HttpError(404, 'not_found')
  return json(ownerView(fresh))
}
