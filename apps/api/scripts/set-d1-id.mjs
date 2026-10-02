// Writes the real D1 database id into wrangler.jsonc, keeping comments intact.
import { readFileSync, writeFileSync } from 'node:fs'

const id = process.argv[2] ?? ''
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
  console.error('usage: node scripts/set-d1-id.mjs <database uuid>')
  process.exit(1)
}
const path = new URL('../wrangler.jsonc', import.meta.url)
const before = readFileSync(path, 'utf8')
if (!/"database_id":\s*"[^"]*"/.test(before)) {
  console.error('database_id not found in wrangler.jsonc')
  process.exit(1)
}
writeFileSync(path, before.replace(/("database_id":\s*")[^"]*(")/, `$1${id}$2`))
console.log(`wrangler.jsonc database_id = ${id}`)
