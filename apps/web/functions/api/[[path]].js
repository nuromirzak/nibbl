// Forward every /api/* request to the nibbl Worker, unchanged (same URL, so it sees the public host).
export const onRequest = ({ request, env }) => env.API.fetch(request)
