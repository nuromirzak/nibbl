#!/usr/bin/env bash
# Sets the Worker secrets that are missing. Never overwrites an existing value.
# Values are generated here and piped straight to wrangler; they are never printed or stored.
# Run after the first deploy (a secret needs an existing Worker).
set -euo pipefail
cd "$(dirname "$0")/.."

WRANGLER=(pnpm exec wrangler)
EXISTING="$("${WRANGLER[@]}" secret list --format json)"

has_secret() {
  printf '%s' "$EXISTING" | node -e '
    let s = ""
    process.stdin.on("data", d => (s += d)).on("end", () => {
      process.exit(JSON.parse(s).some(x => x.name === process.argv[1]) ? 0 : 1)
    })' "$1"
}

for NAME in ROLL_SECRET IP_SALT; do
  if has_secret "$NAME"; then
    echo "$NAME already set, keeping it"
  else
    echo "Setting $NAME to 48 random bytes"
    openssl rand -base64 48 | tr -d '\n' | "${WRANGLER[@]}" secret put "$NAME" >/dev/null
  fi
done
