import { runCron } from './cron'
import type { Deps, Env } from './env'
import { HttpError, json } from './lib/http'
import { card } from './routes/card'
import { hatch } from './routes/hatch'
import { importPet } from './routes/import'
import { leaderboard } from './routes/leaderboard'
import { name } from './routes/name'
import { stats } from './routes/stats'
import { sync } from './routes/sync'

export type Route = { method: 'GET' | 'POST'; handler: (request: Request, env: Env, deps: Deps) => Promise<Response> }

// Every /api route. Later tasks add one line each.
const API: Record<string, Route> = {
  '/api/hatch': { method: 'POST', handler: hatch },
  '/api/leaderboard': { method: 'GET', handler: leaderboard },
  '/api/import': { method: 'POST', handler: importPet },
  '/api/name': { method: 'POST', handler: name },
  '/api/stats': { method: 'GET', handler: stats },
  '/api/sync': { method: 'POST', handler: sync },
}

const isJson = (type: string | null): boolean => type?.split(';')[0].trim().toLowerCase() === 'application/json'

export const handle = async (request: Request, env: Env, deps: Deps): Promise<Response> => {
  const url = new URL(request.url)
  try {
    if (url.pathname.startsWith('/api/')) {
      const route = Object.hasOwn(API, url.pathname) ? API[url.pathname] : undefined
      if (!route) return json({ error: 'not_found' }, 404)
      if (request.method !== route.method) return json({ error: 'method_not_allowed' }, 405, { allow: route.method })
      // A JSON content-type is not CORS-safelisted, so a cross-site page cannot POST here
      // without a preflight, and the preflight fails because the API sends no CORS headers.
      if (request.method === 'POST' && !isJson(request.headers.get('content-type'))) {
        return json({ error: 'unsupported_media_type' }, 415)
      }
      return await route.handler(request, env, deps)
    }
    if (url.pathname.startsWith('/p/')) return await card(request, env)
    return await env.ASSETS.fetch(request)
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.code, ...err.extra }, err.status)
    console.error('unhandled', err instanceof Error ? err.message : String(err))
    return json({ error: 'internal' }, 500)
  }
}

export default {
  fetch: (request, env) => handle(request, env, { now: () => Date.now() }),
  scheduled: (controller, env, ctx) => {
    ctx.waitUntil(runCron(env, controller.scheduledTime))
  },
} satisfies ExportedHandler<Env>
