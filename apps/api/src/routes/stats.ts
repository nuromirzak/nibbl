import type { Deps, Env } from '../env'
import { counterValue } from '../lib/db'
import { json } from '../lib/http'

// counters.hatched starts at 12 (the seeded bots, migration 0002) and moves on every real hatch.
export const stats = async (_request: Request, env: Env, _deps: Deps): Promise<Response> =>
  json({ hatched: await counterValue(env.DB, 'hatched') }, 200, { 'cache-control': 'public, max-age=30' })
