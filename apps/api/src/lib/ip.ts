// One person usually holds a whole IPv6 /64, so per-IP limits key on that prefix.
// IPv4, IPv4-mapped IPv6 (bucketed as the embedded IPv4), ::1 and anything unparseable are used as is.
export const ipBucket = (ip: string): string => {
  const raw = ip.trim().toLowerCase()
  if (!raw.includes(':')) return raw
  if (raw === '::1') return raw
  const mapped = /^(?:0:0:0:0:0|::):?ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(raw) ?? /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(raw)
  if (mapped) return mapped[1]
  const [head, tail, extra] = raw.split('::')
  if (extra !== undefined) return raw
  const left = head ? head.split(':') : []
  const right = tail === undefined ? [] : tail ? tail.split(':') : []
  // An embedded IPv4 tail (::ffff:1.2.3.4) fills the last two hextets.
  const width = (parts: string[]) => parts.reduce((n, p) => n + (p.includes('.') ? 2 : 1), 0)
  const missing = 8 - width(left) - width(right)
  if (tail === undefined ? missing !== 0 : missing < 1) return raw
  const hextets = [...left, ...Array.from({ length: tail === undefined ? 0 : missing }, () => '0'), ...right]
  const prefix = hextets.slice(0, 4)
  if (!prefix.every(h => /^[0-9a-f]{1,4}$/.test(h))) return raw
  return `${prefix.map(h => h.padStart(4, '0')).join(':')}::/64`
}
