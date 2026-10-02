export const MAX_SYNC_BYTES = 64 * 1024
export const MAX_SMALL_BYTES = 4 * 1024
export const MAX_SERIAL = 999_999

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code)
  }
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })

// Streams the body with a hard byte cap, so a missing or lying content-length cannot bypass it.
export const readJson = async (request: Request, maxBytes: number): Promise<Record<string, unknown>> => {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > maxBytes) throw new HttpError(413, 'body_too_large')
  if (!request.body) throw new HttpError(400, 'invalid_json')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new HttpError(413, 'body_too_large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.byteLength
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new HttpError(400, 'invalid_json')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new HttpError(400, 'invalid_json')
  return parsed as Record<string, unknown>
}

const MACHINE_HASH = /^[0-9a-f]{64}$/
const TOKEN = /^[A-Za-z0-9_-]{43}$/

export const machineHashOf = (v: unknown): string => {
  const s = typeof v === 'string' ? v.toLowerCase() : ''
  if (!MACHINE_HASH.test(s)) throw new HttpError(400, 'invalid_machine_hash')
  return s
}

export const serialOf = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > MAX_SERIAL) throw new HttpError(400, 'invalid_serial')
  return v
}

export const tokenOf = (v: unknown): string => {
  if (typeof v !== 'string' || !TOKEN.test(v)) throw new HttpError(400, 'invalid_token')
  return v
}
