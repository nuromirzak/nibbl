import { petBySerial, type PetRow } from './db'
import { constantTimeEqual, sha256Hex } from './hmac'
import { HttpError, serialOf, tokenOf } from './http'

export const authPet = async (db: D1Database, body: Record<string, unknown>): Promise<PetRow> => {
  const serial = serialOf(body.serial)
  const token = tokenOf(body.token)
  // The hash is computed even for an unknown serial so both failures cost the same.
  const [pet, hash] = await Promise.all([petBySerial(db, serial), sha256Hex(token)])
  if (!pet || !constantTimeEqual(hash, pet.token_hash)) throw new HttpError(401, 'unauthorized')
  return pet
}
