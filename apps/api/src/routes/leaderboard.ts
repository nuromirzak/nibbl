import { rebuildLeaderboard } from '../cron'
import type { Deps, Env } from '../env'

export const leaderboard = async (_request: Request, env: Env, deps: Deps): Promise<Response> => {
  const cached = await env.DB.prepare('SELECT json FROM leaderboard_cache WHERE id = 1').first<string>('json')
  const body = cached ?? (await rebuildLeaderboard(env.DB, deps.now()))
  return new Response(body, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60' },
  })
}
