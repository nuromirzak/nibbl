import type { Deps, Env } from '../env'
import { counterValue } from '../lib/db'
import { json } from '../lib/http'

// counters.hatched starts at 12 (the seeded bots, migration 0002) and moves on every real hatch.
// counters.active_24h is refreshed by the cron (real, visible pets that synced in the last 24 h).
export const stats = async (_request: Request, env: Env, _deps: Deps): Promise<Response> =>
  json({ hatched: await counterValue(env.DB, 'hatched'), active: await counterValue(env.DB, 'active_24h') }, 200, {
    'cache-control': 'public, max-age=30',
  })
