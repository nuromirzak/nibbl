# Nibbl infrastructure

Everything that can be code lives in `apps/api/` (Worker, D1, cron) and `apps/web/` (Pages project and the two forwarding Functions): `apps/api/wrangler.jsonc` (Worker, D1 binding, cron, vars, compatibility date), `apps/web/wrangler.toml` (Pages project), `apps/api/migrations/` (schema and seeded bots), `apps/api/scripts/provision.sh` (D1 and remote migrations), `scripts/set-d1-id.mjs` (the only writer of the D1 id into `wrangler.jsonc`) and `scripts/set-secrets.sh` (secrets). This page lists every Cloudflare resource and the few steps that cannot be code.

## Cloudflare account

Everything lives in the owner's personal account (Nur.omirzaq@gmail.com), id `42544c84ffaa32a531766a26562c080d`. It is pinned as `account_id` in `apps/api/wrangler.jsonc` (Worker) and through `CLOUDFLARE_ACCOUNT_ID` in the `apps/web/package.json` scripts (Pages). The owner's wrangler login also sees a second account. Never run wrangler, the provisioning scripts or the Cloudflare MCP against any other account; if a command prints a different account id, stop. Do not remove or override the pins.

## Public host

`https://getnibbl.pages.dev` is a Cloudflare Pages project named `getnibbl` (config `apps/web/wrangler.toml`, static files from `apps/web/prototype`). It is the only public URL. The Worker `nibbl` has no public URL: `workers_dev: false` and `preview_urls: false` in `apps/api/wrangler.jsonc`. Reason: the account's workers.dev subdomain contains the owner's name, and the owner wants their name out of every public URL. The old `nibbl.<subdomain>.workers.dev` host is disabled and stays that way.

Pages Functions `apps/web/functions/api/[[path]].js` and `apps/web/functions/p/[[path]].js` forward every `/api/*` and `/p/*` request unchanged to the Worker `nibbl` through a service binding named `API`. Static files never invoke a function. All absolute URLs (OG image, canonical) come from the request origin, so a custom domain later needs only a custom domain on the Pages project plus updated install docs (decision 0012).

| Path | Served by |
|---|---|
| `/api/*` | Pages Function, forwarded via service binding `API` to the Worker (JSON API) |
| `/p/:serial`, `/p/:serial.png`, `/p/:serial/badge.svg` | Pages Function, forwarded via `API` to the Worker (cards) |
| everything else (landing, `/marketplace.json`, `/plugin/*.zip`) | Pages static files from `apps/web/prototype` (free, no function run) |

## Resource inventory

| Name | Type | Binding | How created | How to recreate | Cost tier |
|---|---|---|---|---|---|
| `42544c84ffaa32a531766a26562c080d` | Cloudflare account (owner's personal, Nur.omirzaq@gmail.com) | n/a | Existing account, pinned as `account_id` in `wrangler.jsonc` | n/a: never use another account | Workers Free |
| `nibbl` | Worker (API, cards, cron; no public URL) | n/a | `pnpm -C apps/api run deploy` from `wrangler.jsonc` | Same command | Workers Free: 100k requests/day, 10 ms CPU per request |
| `getnibbl` | Cloudflare Pages project (`getnibbl.pages.dev`) | n/a | Once: `pnpm -C apps/web run project:create`; then `pnpm -C apps/web run deploy` | Same two commands | Free; static requests are unlimited and not billed |
| `API` | Service binding Pages -> Worker `nibbl` | `API` | `apps/web/wrangler.toml`, applied by the Pages deploy | Redeploy Pages (the Worker must exist first) | Free; calls draw from the shared Workers request pool |
| Pages Functions `api/[[path]].js`, `p/[[path]].js` | Pages Functions | n/a | `apps/web/functions/`, bundled by the Pages deploy | Redeploy Pages | Count toward the 100k Workers requests/day |
| `/marketplace.json` | Pages static file (plugin distribution) | n/a | Written into `apps/web/prototype` by `pack-plugin.mjs` | Repack and redeploy Pages | Free |
| `/plugin/nibbl-<version>.zip` | Pages static file (plugin distribution) | n/a | Written into `apps/web/prototype` by `pack-plugin.mjs` | Repack and redeploy Pages | Free |
| `nibbl` | D1 database | `DB` | `scripts/provision.sh` (`wrangler d1 create --location weur --update-config=false`) | `provision.sh`, then restore data (see Backups) | D1 Free: 5M rows read, 100k rows written per day (index writes count), 5 GB |
| D1 schema | Migrations `0001_init.sql`, `0002_seed_bots.sql` | n/a | `provision.sh` or `pnpm -C apps/api migrate:remote` | Same | Free |
| `*/5 * * * *` | Cron Trigger | `scheduled()` | `triggers.crons` in `wrangler.jsonc`, applied by deploy | Redeploy | 288 invocations/day, inside the Workers Free limit |
| `ROLL_SECRET` | Worker secret | `env.ROLL_SECRET` | `scripts/set-secrets.sh` (random 48 bytes) | `set-secrets.sh` after deleting it; existing pets are unaffected (they are stored), only future rolls change | Free |
| `IP_SALT` | Worker secret | `env.IP_SALT` | `scripts/set-secrets.sh` (random 48 bytes) | Same; a new salt only resets today's per-IP hatch counts | Free |
| `LAUNCH_AT` | Worker var | `env.LAUNCH_AT` | `vars` in `wrangler.jsonc` | Edit and redeploy | Free |
| workers.dev route | Disabled on purpose | n/a | `workers_dev: false` and `preview_urls: false` in `wrangler.jsonc` | Keep disabled | n/a |
| Account workers.dev subdomain | Account setting (contains the owner's name, never published) | n/a | Dashboard, once | n/a | Free |
| Workers Logs | Observability | n/a | `observability.enabled` in `wrangler.jsonc` | Redeploy | Free: 200k log events/day, 3-day retention |

## Plugin distribution

No public repo. Pages serves the plugin as static files:

| Path | What |
|---|---|
| `/marketplace.json` | URL marketplace, generated by `pack-plugin.mjs` |
| `/plugin/nibbl-<version>.zip` | Built plugin, pinned in the marketplace by `sha256` |

Release: bump `version` in the built plugin's `plugin.json`, then
`node apps/api/scripts/pack-plugin.mjs --plugin-dir apps/mod/dist --origin https://getnibbl.pages.dev --mirror plugin` (also refreshes the committed `plugin/` folder, which mod directories scan for `hooks/hooks.json`)
and `pnpm -C apps/web run deploy`. Commit the two generated files under `apps/web/prototype/`. Users update with `/plugin marketplace update nibbl`.

The pack script zips an allowlist only: `.claude-plugin/plugin.json`, `hooks`, `types`, `assets`. Never pack a dev plugin directory by other means: the engine writes `.claude-plugin/types/` into a dev plugin, including claude-code-mcp types that list the author's connected MCP servers.

Incident note, 2026-10-02: a zip briefly published that types file on the old workers.dev host. It was removed within about an hour by disabling workers.dev and repacking with the allowlist. No other data was in the file. Check `unzip -l` on every new zip before deploying.

Install (users): `/plugin marketplace add https://getnibbl.pages.dev/marketplace.json`, then `/plugin install nibbl@nibbl`. Needs Claude Code 2.1.224 or later.

## What cannot be code

| Item | Why | Where it lives |
|---|---|---|
| Cloudflare login | Interactive OAuth | `pnpm -C apps/api exec wrangler login` on the owner's machine |
| Account workers.dev subdomain | Account-wide dashboard setting | Exists and contains the owner's name. It is never used publicly: the Worker has workers.dev disabled. Only the dashboard can change it |
| Pages project creation | Once per project, needs the login | `pnpm -C apps/web run project:create` (creates `getnibbl`) |
| Secret values | Must never be in git | Generated by `set-secrets.sh`, stored only in Cloudflare. No human copy is needed: losing them changes only future rolls and the IP limit |
| D1 database id | Assigned by Cloudflare at creation | Written into `wrangler.jsonc` by `provision.sh` via `set-d1-id.mjs` and committed (not a secret) |

## Security notes

- `machineHash` (sha256 of the hardware UUID + "nibbl") is a bearer credential for re-hatch recovery. It is never shown to users and never logged.
- Pet tokens are returned once and stored only as sha256 hashes.
- IP addresses are stored only as daily-salted hashes (`sha256(bucket|IP_SALT|utcDay)`, where the bucket is the IPv4 address or the IPv6 /64 prefix), never raw.
- Secrets are generated by `set-secrets.sh` and piped straight to wrangler. They are never displayed, echoed or written to disk.
- No CORS headers on any route. Every `/api/*` POST must send `content-type: application/json` (else 415 `unsupported_media_type`), which is not CORS-safelisted, so a cross-site page cannot drive the API without a preflight that fails. D1 exports contain token hashes and machine hashes, so keep them out of git.

## Local development

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm -C apps/api migrate        # local D1 under apps/api/.wrangler
pnpm -C apps/api dev            # http://localhost:8787
pnpm -C apps/api test           # Miniflare with real local D1, migrations applied
pnpm -C apps/api deploy:dry     # bundles into apps/api/dist, uploads nothing
```

## Deploy runbook (owner approval required)

Nothing below runs without the owner's explicit go-ahead.

First deploy:

1. `pnpm -C apps/api exec wrangler login`
2. Set `LAUNCH_AT` in `apps/api/wrangler.jsonc` to the real launch moment.
3. `pnpm -C apps/api provision` (creates or finds D1, writes its id, applies remote migrations). Commit the changed `wrangler.jsonc`.
4. `pnpm -C apps/api run deploy` (use `run`: `pnpm deploy` is a pnpm built-in). The Worker must exist before Pages, because the service binding targets it.
5. `pnpm -C apps/api secrets` (sets `ROLL_SECRET` and `IP_SALT` if missing). Until this step, `/api/hatch` answers `503 not_configured`.
6. `pnpm -C apps/web run project:create` (once), then `pnpm -C apps/web run deploy`.
7. Smoke test:
   ```bash
   HOST=https://getnibbl.pages.dev
   curl -s $HOST/api/stats                       # {"hatched":12} at launch (the seeded bots count)
   curl -s $HOST/api/leaderboard | head -c 300   # the 12 bots
   curl -sI $HOST/p/000001.png                   # 200 image/png
   ```

Later deploys, in this order:

- Schema change: `pnpm -C apps/api migrate:remote` first (new numbered file in `apps/api/migrations/`).
- API change: `pnpm -C apps/api run deploy` (Worker).
- Static change (landing, plugin zip, marketplace): `pnpm -C apps/web run deploy` (Pages).

## Moderation and bots

The 12 seeded bots count in `counters.hatched` (migration 0002 sets it to 12), so `/api/stats` starts at 12, not 0 (decision 0009). Real hatches add to it. Hiding or retiring a bot never changes the counter.

```bash
# Hide a pet (off the leaderboard, card shows "nibbl #000042")
pnpm -C apps/api exec wrangler d1 execute nibbl --remote --command "UPDATE pets SET is_hidden = 1 WHERE serial = 42"
# Retire all bots (they stop growing and leave the leaderboard)
pnpm -C apps/api exec wrangler d1 execute nibbl --remote --command "UPDATE pets SET is_hidden = 1 WHERE is_bot = 1"
```

## Backups

- D1 Time Travel restores to any minute in the last 7 days on the free plan: `pnpm -C apps/api exec wrangler d1 time-travel restore nibbl --timestamp <unix seconds>`.
- Full export: `pnpm -C apps/api exec wrangler d1 export nibbl --remote --output backup-$(date +%F).sql`. Keep exports out of git (they hold token hashes and machine hashes).

## Free-tier budget (spec 6.7)

D1 bills an index entry as one more written row whenever a write touches an indexed column ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)). At the daily limit D1 stops answering queries until the next UTC day, so the binding limit is rows written.

| Operation | Rows written |
|---|---|
| Sync that changes XP | 3-5: the `pets` row, its `pets_board` index entry (xp changed), and 1-3 `xp_windows` rows |
| Sync with nothing new | 1: `pets.last_sync_at` |
| New hatch | about 9: 2 counters, the `pets` row plus 4 index entries (machine_hash, genome_key, visual_key, pets_board), the `hatch_ip` row plus its `hatch_ip_last` entry |
| Re-hatch, label change, rename | 1 |
| Bots, per completed hour | 13 (12 bot rows + the `bot_hour` counter), plus up to 12 `pets_board` entries for bots that gained XP; about 300-600 a day |
| Leaderboard rebuild | 1 per 5 min, 288 a day |

Realistic free ceiling: about 3-5k daily users at about 5 XP-changing syncs a day (5 x 4 rows = about 20 rows per user per day against 100k). Worker and Pages Functions requests (both draw from the same Workers free pool of 100k/day; static Pages requests are free and unlimited) and D1 reads (5M/day: a sync reads about 5 rows, the leaderboard rebuild about 100 x 288) are not the bottleneck. CPU: the PNG render is about 3-5 ms (1200x630 indexed, native deflate); everything else is under 1 ms.

Move to Workers Paid ($5/month: 50M rows written and 25B rows read a month included) when D1 rows written pass about 70k on any day in the dashboard, or daily users pass about 3k. Do it before launch-day spikes, not after the first outage.

## DoS posture

No Workers Rate Limiting binding: its [docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) do not say it is available on the Workers Free plan, so the API relies on per-pet and per-IP limits stored in D1:

| Path | Limit | Cost to an attacker |
|---|---|---|
| `POST /api/hatch` (new machine) | 100 per IP (IPv6: per /64) per UTC day | Each pet needs its own address or /64; 100 hatches is about 900 rows written |
| `POST /api/hatch` (known machine) | 1 per 60 s per pet | Needs the machineHash; 1 row per minute |
| `POST /api/sync` | 1 per 30 s per pet; XP capped per hour | Needs a token; at most 5 rows per 30 s per pet |
| `POST /api/name` | label 1 per 60 s, name 1 per 7 days per pet | Needs a token; 1 row per minute |
| `POST /api/import` | none | Needs a token; 1-2 rows per call |
| Any `/api/*` POST | JSON content-type required, bodies capped at 4-64 KB | Cross-site drive-by is blocked by the failed preflight |

What an attacker can still do: rotate IPv6 /64s or IPv4 addresses to hatch more, loop authenticated syncs, labels or imports across many owned pets, or flood any route with requests that are rejected before D1. Each costs one Worker request; the write paths cost at most a few D1 rows per pet per minute. A determined attacker with many addresses can exhaust the free 100k daily writes (about 11k hatches) or the 100k daily requests, which takes the API down until the next UTC day. The answer then is Workers Paid ($5/month), and if abuse persists a WAF rate-limiting rule on `/api/*` or the Rate Limiting binding once Paid. Card and asset routes are read-only and cached for 5 minutes.
