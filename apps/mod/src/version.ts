// Injected by esbuild `define` in build.mjs; vitest (no bundle) falls back to a dev marker.
declare const __NIBBL_VERSION__: string

export const VERSION: string = typeof __NIBBL_VERSION__ === 'string' ? __NIBBL_VERSION__ : '0.0.0-dev'

const SEMVER = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/

export const parseSemver = (v: unknown): [number, number, number] | null => {
  const m = typeof v === 'string' ? SEMVER.exec(v) : null
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

// True when `latest` is a strictly higher x.y.z than `current`; anything unparseable is "not newer".
export const isNewer = (latest: unknown, current: string = VERSION): boolean => {
  const a = parseSemver(latest)
  const b = parseSemver(current.split('-')[0])
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i]! !== b[i]!) return a[i]! > b[i]!
  return false
}
