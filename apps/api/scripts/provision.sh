#!/usr/bin/env bash
# Finds or creates every Cloudflare resource nibbl-pet needs that a deploy does not create.
# Safe to run again: existing resources are reused, applied migrations are skipped.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_NAME="nibbl-pet"
DB_LOCATION="weur"
WRANGLER=(pnpm exec wrangler)

if ! "${WRANGLER[@]}" whoami >/dev/null 2>&1; then
  echo "Not logged in to Cloudflare. Run: pnpm -C apps/api exec wrangler login" >&2
  exit 1
fi

db_id() {
  "${WRANGLER[@]}" d1 list --json | node -e '
    let s = ""
    process.stdin.on("data", d => (s += d)).on("end", () => {
      const db = JSON.parse(s).find(d => d.name === process.argv[1])
      process.stdout.write(db ? db.uuid : "")
    })' "$DB_NAME"
}

ID="$(db_id)"
if [ -z "$ID" ]; then
  echo "Creating D1 database $DB_NAME ($DB_LOCATION)"
  # --update-config=false: scripts/set-d1-id.mjs is the only writer of the id into wrangler.jsonc.
  "${WRANGLER[@]}" d1 create "$DB_NAME" --location "$DB_LOCATION" --update-config=false >/dev/null
  ID="$(db_id)"
fi
if [ -z "$ID" ]; then
  echo "Could not find D1 database $DB_NAME after creating it" >&2
  exit 1
fi
echo "D1 $DB_NAME = $ID"
node scripts/set-d1-id.mjs "$ID"

echo "Applying migrations to remote D1"
"${WRANGLER[@]}" d1 migrations apply "$DB_NAME" --remote

echo "Done. Next: pnpm -C apps/api run deploy, then pnpm -C apps/api secrets"
