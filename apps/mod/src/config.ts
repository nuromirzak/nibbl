// Every tunable of the mod in one place. Game rules (XP values, caps, levels, odds) live in @nibbl/core.
export const DEFAULT_API = 'https://getnibbl.pages.dev'

export const HATCH_AFTER_TURNS = 10
export const HATCH_DELAY_MS = 1_500

export const SYNC_EVERY_MS = 150 * 60_000
export const SYNC_SOON_PENDING = 500
export const QUEUE_CAP = 1_000
export const MAX_BATCH = 1_000
export const TRIM_AFTER_413 = 500
export const LEASE_MS = 60_000
export const ORPHAN_MS = 15 * 60_000
export const BEAT_MS = 5 * 60_000
export const BACKOFF_BASE_MS = 60_000
export const BACKOFF_MAX_MS = 60 * 60_000
export const CONFLICT_RETRY_MS = 30_000
export const SESSION_END_WAIT_MS = 2_500
export const POST_TIMEOUT_MS = 20_000

export const TICK_MS = 500
export const MOOD_MS = 6_000
export const HEART_MS = 2_000
export const LOOT_MS = 4_000
export const BOX_MS = 6_000
export const SLEEP_AFTER_MS = 3 * 60_000
export const MAX_BUGS = 3
export const HOME_X = 8
export const AWAY_X = 16
export const NIGHT_FROM_HOUR = 2
export const NIGHT_TO_HOUR = 5

export const NAME_MAX = 16
export const LABEL_MAX = 24
export const MIN_FULL_ROWS = 8
export const MIN_FULL_COLUMNS = 60

// A check word as its own command-line token: `pnpm test`, `npx tsc -p .`, `npm run test:unit`,
// but not `cat test.txt` or `ls build/`.
export const CHECK_COMMAND = /(?:^|[\s;&|(/])(?:test|vitest|jest|pytest|tsc|lint|build)(?=$|[\s;&|):])/

// `git commit ...` and `git -C <dir> commit ...`, but not `git log --grep commit` or `git commit-tree`.
export const COMMIT_COMMAND = /\bgit(?:\s+-[A-Za-z]\s+\S+|\s+--?[\w-]+(?:=\S+)?)*\s+commit(?![\w-])/

export const K = {
  pet: 'v1.pet',
  egg: 'v1.egg',
  hidden: 'v1.hidden',
  lease: 'v1.lease',
  syncWait: 'v1.syncWait',
  hatchWait: 'v1.hatchWait',
  installId: 'v1.installId',
  machineHash: 'v1.machineHash',
  installSerial: 'v1.installSerial',
  spikePet: 'pet',
  spikeEggTurns: 'eggTurns',
} as const

export const QUEUE_PREFIX = 'v1.q.'

// Every key the local-only spike (0.0.1-spike) wrote; deleted once its pet is adopted.
export const SPIKE_KEYS = ['pet', 'eggTurns', 'windows', 'lastScoredAt', 'mode'] as const
