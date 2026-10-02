export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  ROLL_SECRET: string
  IP_SALT: string
  LAUNCH_AT: string
}

// Injected so tests control time; production passes Date.now.
export type Deps = { now: () => number }
