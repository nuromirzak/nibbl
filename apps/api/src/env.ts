export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  ROLL_SECRET: string
  IP_SALT: string
  LAUNCH_AT: string
  // Newest published mod version; sync returns it so old mods can show an update notice.
  LATEST_VERSION: string
}

// Injected so tests control time; production passes Date.now.
export type Deps = { now: () => number }
