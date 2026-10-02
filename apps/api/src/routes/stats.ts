import type { Deps, Env } from '../env'
import { counterValue } from '../lib/db'
import { json } from '../lib/http'

// counters.hatched only moves on real hatches, so bots never show up here.
export const stats = async (_request: Request, env: Env, _deps: Deps): Promise<Response> =>
  json({ hatched: await counterValue(env.DB, 'hatched') }, 200, { 'cache-control': 'public, max-age=30' })
