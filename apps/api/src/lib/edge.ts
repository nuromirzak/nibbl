// Public read endpoints are answered from the colo cache when fresh, so page views do not scan D1 each time.
// Only 200s are stored; the key is the request URL. A hide or a new win shows up after at most the TTL.
export const edgeCached = async (request: Request, ttlSeconds: number, produce: () => Promise<Response>): Promise<Response> => {
  if (request.method !== 'GET') return produce()
  const key = new Request(request.url)
  const cache = caches.default
  const hit = await cache.match(key)
  if (hit) return hit
  const res = await produce()
  if (res.status === 200) {
    const stored = new Response(res.clone().body, res)
    stored.headers.set('cache-control', `public, max-age=${ttlSeconds}`)
    await cache.put(key, stored)
  }
  return res
}
