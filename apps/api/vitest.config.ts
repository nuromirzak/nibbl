import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'))
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // Fresh random values per run: tests read them from env, never from a literal.
          bindings: { TEST_MIGRATIONS: migrations, ROLL_SECRET: randomBytes(32).toString('hex'), IP_SALT: randomBytes(32).toString('hex') },
        },
      }),
    ],
    test: { include: ['test/**/*.test.ts'], setupFiles: ['./test/setup.ts'], fileParallelism: false },
  }
})
