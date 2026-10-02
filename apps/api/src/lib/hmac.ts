const enc = new TextEncoder()
const keys = new Map<string, Promise<CryptoKey>>()

const hmacKey = (secret: string): Promise<CryptoKey> => {
  let key = keys.get(secret)
  if (!key) {
    key = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    keys.set(secret, key)
  }
  return key
}

export const toHex = (bytes: Uint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

export const hmacSha256 = async (secret: string, message: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(message)))

export const sha256Hex = async (text: string): Promise<string> =>
  toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))))

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const randomToken = (): string => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64url(bytes)
}

// Callers compare fixed-length hex hashes, so the early length check leaks nothing useful.
export const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
