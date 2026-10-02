import { genome, rollFromBytes, type Genome } from '@nibbl/core'
import { hmacSha256 } from './hmac'

export const BATCH = 16

// Candidate 0 is the bare HMAC roll and fixes tier and shiny for every candidate.
// Candidate n >= 1 takes only the seed of HMAC(machineHash + ":" + n).
export const candidates = async (secret: string, machineHash: string, from: number, count = BATCH): Promise<Genome[]> => {
  const first = rollFromBytes(await hmacSha256(secret, machineHash))
  const seeds = await Promise.all(
    Array.from({ length: count }, (_, i) => from + i).map(async n =>
      n === 0 ? first.seed : rollFromBytes(await hmacSha256(secret, `${machineHash}:${n}`)).seed,
    ),
  )
  return seeds.map(seed => genome(seed, first.tier, first.shiny))
}
