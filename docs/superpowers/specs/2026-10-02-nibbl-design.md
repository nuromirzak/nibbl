# Nibbl: design spec

Date: 2026-10-02. Status: draft for owner review.

Nibbl is a tamagotchi-inspired pixel pet that lives in the band above the Claude Code prompt. It hatches from an egg after real work, reacts to what actually happens in the session, and grows over months. Every nibbl has a unique serial and a unique genome. A minimal Cloudflare backend assigns serials and rolls, keeps XP honest, and powers a public leaderboard on a pixel landing page.

## 1. Philosophy: quiet, honest, yours

1. **Honest.** The pet reacts only to real events (tool errors, passing checks, commits, turns). No emotions on a timer.
2. **Quiet.** Never blocks work, never nags, never guilt-trips. A nibbl never dies.
3. **Yours.** Unique genome and serial. No two nibbls look alike.
4. **Earned.** Luck sets the starting genes. Effort sets the form.
5. **Tiny.** 32×16 pixel scene, zero model tokens, keeps working offline.

Feelings, success metrics and the Tamagotchi lessons live in `docs/product-principles.md`. Every feature is checked against these five. A feature that nags, costs tokens without opt-in, or fakes an emotion is out.

## 2. Decisions

| Area | Decision |
|---|---|
| Name | **Nibbl**. Pets are "nibbls". The pet nibbles bugs (a nibble is half a byte). |
| Scope | Single-user only. No multiplayer, duels or trading in v1. |
| Seasons | None. One roll per machine, forever. |
| Identity | No OAuth, no login. Identity is the machine (`machineHash`) plus a server-issued pet token. Works right after install. |
| Uniqueness | `serial` is the only unique id. Genome is deduplicated on the server, so no two nibbls share one. |
| Names | User sets `name` (≤16 chars) and `label` (≤24 chars). Not unique. Basic filter. Displayed as `Name #000042`. |
| Roll | Server-side, never client-side. Odds 40 / 30 / 18 / 9 / 3 (common → legendary), shiny 4% on top. |
| Anti-churn | Unique genome, guaranteed trait rarer than 5% shown at hatch, rarity never affects XP or level, hatch ceremony. |
| Scarcity | Serial number, Genesis badge for pets hatched in the first 30 days after launch (server clock), rarity tiers. |
| XP | Server is authoritative. Click/pet: ≤5 XP-granting interactions per UTC clock-hour bucket, shown as `♥♥♥♡♡`. Turns: ≤20 per hour. |
| Art | Procedural, layered, from a shared TS generator. Scene 32×16, pet up to 16×16. Palette Sweetie 16. |
| Rendering | One source (pixel grid), renders chosen by terminal. `Raster` half-blocks are the MVP renderer. |
| Code | Private monorepo. A readable (not obfuscated) bundle is published to a public marketplace repo, license "All rights reserved". |
| Backend | Cloudflare Workers + D1 + Pages, free tier. Infra as code with wrangler. |
| Seeded bots | 12 seeded nibbls on the leaderboard at launch so early users are not alone (owner decision, see §9.4). |

## 3. Architecture

```
nibbl/                      private monorepo (pnpm workspaces)
  packages/core             pure TS, zero deps: PRNG, odds, genome, compat rules, draw() → 32×16 RGBA grid
  apps/mod                  Claude Code mod (function hooks) → esbuild bundle → public repo
  apps/api                  Cloudflare Worker + D1 (+ cron)
  apps/web                  landing + leaderboard → Cloudflare Pages
  docs/                     specs, plans
nibbl-dev/nibbl             public repo: .claude-plugin/marketplace.json + built plugin (dist only)
```

**One generator for everything.** `core` is the single implementation of genes and drawing. The mod, the API (OG images) and the web (canvas) all import it, so a nibbl looks identical everywhere and can be re-derived from its seed. Anti-pattern: separate renderers per surface. They drift and break verification.

Data flow:

```
install → egg (local) → 10 main-loop turns → POST /hatch {machineHash}
        ← {serial, token, seed, tier, shiny, genesis, hatchedAt}
mod draws core.draw(seed) every frame; queues events locally
every 2-3 h and on session.end → POST /sync {serial, token, events[]}
        ← {xp, level, heartsLeft}   (server XP replaces local optimistic XP)
web → GET /leaderboard (cached), GET /p/:serial (card page + OG image)
```

## 4. `packages/core`

### 4.1 Determinism
- PRNG: mulberry32 seeded from a 32-bit seed. All randomness in `core` comes from it.
- `genome(seed, tier, shiny) → Genome`. Same input, same output, on every platform.
- `draw(genome, stage, expression, frame) → Grid` where `Grid` is 32×16 cells of palette index or transparent.

### 4.2 Odds
| Tier | Probability | Gene pools |
|---|---|---|
| Common | 40% | base palettes, no hat |
| Uncommon | 30% | + uncommon patterns |
| Rare | 18% | + rare palettes, eyes, horns |
| Epic | 9% | + epic patterns, bow hat |
| Legendary | 3% | + legendary palettes, crown hat, animated aura |
| Shiny | 4%, independent | dedicated shiny ramp per palette, corner sparkle, scene twinkle |

Legendary shiny is about 1 in 830. Odds are public in the README, on the landing and via `/nibbl odds`.

**Rare-trait guarantee:** every genome has at least one trait whose theoretical probability is below 5%. Every pet rolls a **mark**: a 1-3 pixel motif (dot, star, heart, scar, sparkle, swirl) at one spot (left cheek, right cheek, forehead, belly), both drawn uniformly, so each of the 24 marks has odds of exactly 1/24 (4.17%). No gene is ever rewritten after the roll. At hatch the mod shows the rarest trait: "Pattern *constellation*: 0.7% odds" or "Mark *star on forehead*: 4.17% odds".

**Honest odds:** `traitOdds` reports the exact probability of each final gene value, compatibility rules included (sprout always has a leaf, a hat clears ears and horns). Genes are independent given the tier, so each value's odds are the sum over tiers of P(tier) × P(value | tier), computed analytically from the generator's own pools. A 200 000-roll property test checks every reported value against its observed frequency.

### 4.3 Sprite anatomy (pet ≤16×16, bottom to top)
1. Shadow (1 px ellipse)
2. Back accessory: tail, wings, cape
3. **Body silhouette** per family and stage, with outline and 3-tone ramp (shade, base, highlight, light from top-left)
4. Pattern masked to the body: spots, stripes, stars, constellation
5. Belly or face patch
6. Eyes: shape gene × expression
7. Mouth: expression
8. Blush: on or off
9. Mark: 1-3 pixels in a color outside the pet's ramp, clipped to the body, never on eye pixels
10. Head: ears, horns (rare and up), leaf
11. Hat: epic gets a bow, legendary a crown; common, uncommon and rare have none
12. Aura or shiny sparkle: drawn in code (shiny: a 2-pixel sparkle in the top-right corner of the 16×16, clear of the outline, plus a frame-based twinkle in the scene)

**Compatibility rules** live in `core` (e.g. sprout has no ears; belly never overlaps eyes; a non-sprout pet with a hat has no head part; the leaf is skipped under a hat). Pattern placement is seeded by the keyed `patternVariant` gene (0..15) and retries until spots and stars land on the body, off the face and the mark. The spike showed that unconstrained genes produce ugly pets.

MVP content: 3 families (mochi, critter, sprout), 6+ palettes plus shiny ramps, 4+ patterns, 4+ eye shapes, 4+ head parts.

### 4.4 Expressions and motion
- 6 expressions change only eyes and mouth: idle, blink, happy, sad, sleep, surprised.
- Motion is whole-body offset: breathing (1 px squash), hop (−2 px y), walk (2 foot frames), x-position across the scene.
- Animation is frame by frame, 2-4 frames per action.

### 4.5 Stages
| Stage | Level | Body |
|---|---|---|
| Egg | before hatch | 12×14 egg + 3 crack frames |
| Baby | 1 | ~10×10 per family |
| Teen | 10 | ~13×13 per family |
| Adult | 25 | 16×16 per family (branches in v1.1) |
| Elder | 50 | adult + aura (v1.1) |

## 5. `apps/mod`

### 5.1 Layout (AbovePrompt band)
```
 Byte #000042 · night coder      ┌──── scene 32×16 px = 32 cols × 8 rows ────┐
 lvl 7  ▓▓▓▓▓▓░░░ 62%            │   effects                                 │
 ♥♥♥♡♡                           │        [pet]  → walks            🐛       │
 ⛏ on expedition 0:42            │ ▁▁▁▁▁▁▁▁▁▁▁▁▁▁ ground ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁ │
                                 └───────────────────────────────────────────┘
 HUD = Text                        scene = Raster, transparent background
```
- Hover card (absolute Box): tier, rarest trait and its %, owner label, serial, Genesis badge.
- Click on the pet (Button `onPress`) or its hotkey: pet interaction.
- Narrow terminal (< 60 columns): collapse to one line `Byte #000042 · lvl 7 ♥♥♥♡♡`.
- `hasSurvey` or hidden: draw nothing, `next(e)`.

### 5.2 Rendering tiers
| Terminal | Renderer |
|---|---|
| Truecolor (Ghostty, kitty, iTerm2, WezTerm, VS Code) | `Raster`, half-block `▀`, fg + bg per cell |
| 256-color | `Raster` with colors quantized to xterm-256 |
| No color or desktop fallback | one-line text |
| Ghostty/kitty HD (`Image`) | v1.1, only if a higher-resolution source exists |

### 5.3 Events → reactions (zero tokens)
| Hook | Condition | Scene reaction | Event queued |
|---|---|---|---|
| `turn.start` (main loop) | | pet walks off on expedition, timer in HUD | |
| `turn.complete` | `agentId` undefined, `reason === 'answer'` | pet returns with loot | `turn` |
| `tool.call` result | `isError` | a bug 🐛 appears, pet sad | `error` |
| `tool.call` Bash | matches `test|vitest|jest|pytest|tsc|lint|build`, no error | pet eats bugs, happy | `check_pass` |
| `tool.call` Bash | `git commit` | pet carries a box | `commit` |
| local clock | 02:00-05:00 | nightcap, yawns | |
| idle > 3 min | | sleeps (zzz) | |
| Button press | | hearts float | `pet` |

### 5.4 XP rules (server-authoritative, local optimistic)
| Event | XP | Cap per UTC clock hour |
|---|---|---|
| `pet` | 2 | 5 events (hearts `♥♥♥♡♡`) |
| `turn` | 3 | 20 events |
| `check_pass` | +2 | counted within turns |
| `commit` | +2 | 10 events |

Interactions stay below ~20% of a heavy user's hourly XP. Over the cap the pet still reacts, it just gives no XP. Level curve: XP from level n to n+1 = `round(10 · n^1.4)`. Roughly: level 10 ≈ 900 XP (≈ 2 weeks of regular use), level 25 ≈ 9 000 XP (≈ 2-3 months). Constants live in `core` and are tunable.

### 5.5 Commands
| Command | Effect |
|---|---|
| `/nibbl` | Stats: name, serial, tier, level, XP, hearts, card URL |
| `/nibbl name <text>` | Set name (server, filtered, rate-limited 1/week) |
| `/nibbl label <text>` | Set label (server, filtered) |
| `/nibbl odds` | Odds table and this pet's rarest trait |
| `/nibbl export` | Prints `nibbl1:<serial>:<token>` and writes it to a file |
| `/nibbl import <code>` | Moves the pet to this machine after server check |
| `/nibbl hide` | Toggle the band |

### 5.6 Local state
- `$.store` (persistent): `serial`, `token`, `seed`, `tier`, `shiny`, `genesis`, `hatchedAt`, `name`, `label`, last server `xp`, pending event queue, `turnsBeforeHatch`.
- `$.state` atoms (session): `frame`, `expression`, scene props (bugs, loot), `isOnExpedition`, `heartsLeft`.
- `machineHash = sha256(IOPlatformUUID + "nibbl")` via `$.process.run` (`ioreg` on macOS, `/etc/machine-id` on Linux, `MachineGuid` on Windows). Only the hash leaves the machine.

### 5.7 Failure handling
- Server unreachable: egg keeps counting, hatched pet keeps living, events stay queued (cap 1 000, oldest dropped).
- Hatch fails: egg stays, retries on the next turn with backoff.
- Corrupt store: show the egg again and re-hatch with the same `machineHash` (server returns the same pet).
- Any hook error is caught and logged with `$.ui.log`; the band then draws nothing.

## 6. `apps/api` (Cloudflare Worker + D1)

### 6.1 Endpoints
API routes live under the `/api/` prefix. Card routes (`/p/:serial`, `/p/:serial.png`, `/p/:serial/badge.svg`) are served by the same Worker without the prefix. Everything else is a static asset.

| Method | Path | Body / result |
|---|---|---|
| POST | `/api/hatch` | `{machineHash}` → `{serial, seed, tier, shiny, genesis, hatchedAt, name, label, xp, level, token}` (the owner view plus a fresh token). Idempotent per `machineHash`: the same machine gets the same pet, at most one re-hatch per 60 s. |
| POST | `/api/sync` | `{serial, token, events:[{type, at}]}` → `{xp, level, heartsLeft}` |
| POST | `/api/name` | `{serial, token, name?, label?}` → `{name, label}`. Rename once per 7 days, label change once per 60 s. |
| POST | `/api/import` | `{serial, token, machineHash}` → pet, rebinds machine |
| GET | `/api/leaderboard` | top 100 by XP, cached, rebuilt by cron every 5 min |
| GET | `/p/:serial` | HTML card page with OG tags (not under `/api/`) |
| GET | `/p/:serial.png` | OG image rendered by `core` |
| GET | `/p/:serial/badge.svg` | Embeddable badge |
| GET | `/api/stats` | `{hatched}` for the live counter |

### 6.2 Roll
- `core.rollFromBytes(HMAC-SHA256(ROLL_SECRET, machineHash))` reads big-endian uint32 words: offset 0 is the seed, offset 4 the tier roll, offset 8 the shiny roll (at least 12 bytes, else it throws).
- Uniqueness is checked on two keys: `core.genomeKey(genome)` (every keyed gene, including mark and, when there is a pattern, `patternVariant`) and `core.visualKey(genome)` (hash of the adult idle frame), so no two pets look the same even if their genes differ.
- The server keeps the tier and shiny of the first roll and builds candidates from the seeds of `HMAC(ROLL_SECRET, machineHash + ":" + n)` for n = 0..15, queries D1 once with `IN (...)` on both key columns, then calls `core.pickUnique(candidates, isTakenKey, isTakenVisual)`, which returns the first candidate free on both. A simulation of 100 000 sequential hatches finds a free candidate every time.
- Serial = next value of a counter, zero-padded to 6 digits.
- Genesis = `hatchedAt < LAUNCH_AT + 30 days`.
- Rate limit (owner decision 2026-10-02): 100 new hatches per IP per UTC day, IPv6 counted per /64. The 101st answers 429 `hatch_rate_limited` with `retryAt` = next UTC midnight. Re-hatches of a known `machineHash` never count against it.
- Every `/api/*` POST must be `content-type: application/json`, else 415 `unsupported_media_type`.

### 6.3 Auth
- `token` = 32 random bytes, returned once at hatch. D1 stores only `sha256(token)`.
- Every write endpoint checks `serial` + `token`. No private keys or certificates in v1: the server is the source of truth and `/p/:serial` is the public proof.

### 6.4 XP
- Server drops events from before `hatchedAt`, pulls events up to 5 min in the future back to `now` and drops later ones, then buckets by hour (`at` within `[lastSyncAt − 3h, now]`, or the 24 h first-sync lookback), applies caps from §5.4, computes XP and level with `core`.
- No daily XP cap (owner decision 2026-10-02, decision 0006).
- Events beyond the caps are dropped silently. A cheater can match the most active honest player, never exceed them.

### 6.5 Schema (D1)
```sql
CREATE TABLE pets (
  serial       INTEGER PRIMARY KEY,
  machine_hash TEXT UNIQUE NOT NULL,
  token_hash   TEXT NOT NULL,
  seed         INTEGER NOT NULL,
  genome_key   TEXT UNIQUE NOT NULL,
  visual_key   TEXT UNIQUE NOT NULL,
  tier         TEXT NOT NULL,
  shiny        INTEGER NOT NULL,
  genesis      INTEGER NOT NULL,
  name         TEXT,
  label        TEXT,
  xp           INTEGER NOT NULL DEFAULT 0,
  level        INTEGER NOT NULL DEFAULT 1,
  is_bot       INTEGER NOT NULL DEFAULT 0,
  is_hidden    INTEGER NOT NULL DEFAULT 0,
  hatched_at   INTEGER NOT NULL,
  last_sync_at INTEGER,
  name_changed_at INTEGER,
  label_changed_at INTEGER,
  rehatched_at INTEGER
);
CREATE TABLE xp_windows (
  serial INTEGER NOT NULL, hour INTEGER NOT NULL,
  pets INTEGER NOT NULL DEFAULT 0, turns INTEGER NOT NULL DEFAULT 0, commits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (serial, hour)
);
CREATE TABLE hatch_ip (ip_hash TEXT PRIMARY KEY, count INTEGER NOT NULL, last_at INTEGER NOT NULL);
CREATE INDEX hatch_ip_last ON hatch_ip (last_at);
CREATE TABLE leaderboard_cache (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, built_at INTEGER NOT NULL);
```

### 6.6 Name filter
Length limits, printable characters only, no URLs, a word blocklist (EN + RU), and `is_hidden` for owner moderation.

### 6.7 Capacity (free tier)
Workers: 100k requests/day. D1: 5M rows read and 100k rows written per day, 5 GB, and every index entry a write touches counts as one more written row. Rows written are the binding limit: a sync that changes XP writes 3-5 rows (the `pets` row, its `pets_board` entry, 1-3 `xp_windows` rows), bots write 13 rows per completed hour (plus `pets_board` entries for bots that gained XP), a hatch about 9. At about 5 syncs a day the free tier holds about 3-5k daily users. Leaderboard is served from `leaderboard_cache`. Move to Workers Paid ($5/month) once rows written pass about 70k on a day or daily users pass about 3k. Details and the DoS posture: `docs/infra.md`.

**Genome capacity (decision 2026-10-02).** Expected scale is at most 10 000 nibbls. Measured headroom: 100 000 sequential hatches with 16 candidates each all find a unique pet, and the first misses appear after about 115 000 common-tier pets. This is far above the expected scale, so no more genes or candidates are added now. The Worker still handles `pickUnique` returning `null` by retrying with a fresh candidate batch (n = 16..31) and, if that also fails, answering 503 so the mod retries the hatch later. Revisit only if real hatches pass 50 000.

### 6.8 Infra as code
One Worker with static assets, configured in `apps/api/wrangler.jsonc` (Worker, `account_id` pinned to the owner's account, static assets with `run_worker_first` for `/api/*` and `/p/*`, D1 binding, cron trigger). `LAUNCH_AT` is a plain var in `wrangler.jsonc`. SQL migrations live in `apps/api/migrations`; secrets (`ROLL_SECRET`, `IP_SALT`) are set by `scripts/set-secrets.sh` via `wrangler secret put`. No Pages project. Cloudflare MCP is for logs and ad-hoc queries only, never for creating resources. Inventory and runbook: `docs/infra.md`.

## 7. `apps/web` (landing + leaderboard)

Static export on Cloudflare Pages (Next.js `output: 'export'`, per the owner's rule for SEO pages). Sections:
1. Hero: egg-shaped device shell with an animated nibbl on an LCD screen, tagline, install command with copy, live counter.
2. "How it lives": mock terminal with HUD + scene.
3. Reactions strip: tests pass, error, commit, 2am.
4. Odds table with tier badges and a rarest-trait example.
5. Leaderboard (top 100 from `/leaderboard`), each row drawn by `core`.
6. Example shareable card.

`/p/:serial` is served by the Worker (needs per-pet OG tags).

## 8. Design kit

- **Fonts** (Google Fonts): Pixelify Sans (headings), Silkscreen (small labels), JetBrains Mono (body, commands).
- **Grid** 8 px. Pixel art scales by integers only, `image-rendering: pixelated`.
- **Shape:** stepped pixel corners, no `border-radius`, hard 4 px shadows without blur.
- **Motion:** frame by frame with `steps()`, 2-4 frames.
- **Pet palette:** Sweetie 16: `#1a1c2c #5d275d #b13e53 #ef7d57 #ffcd75 #a7f070 #38b764 #257179 #29366f #3b5dc9 #41a6f6 #73eff7 #f4f4f4 #94b0c2 #566c86 #333c57`.
- **Brand tokens:** night `#0f111a`, shell `#f4ead5`, LCD `#c5d1a5 #8b9a6b #4d5a3c #1f2418`, accent `#ef7d57`, bug `#a7f070`.
- **Rarity:** common `#94b0c2`, uncommon `#a7f070`, rare `#41a6f6`, epic `#c77dff`, legendary `#ffcd75`, shiny stepped shimmer `#73eff7 → #ffcd75`.

## 9. Distribution and launch

### 9.1 Build and publish
- No public repo for now. `pnpm -C apps/api pack:plugin` packs the built plugin into `/plugin/nibbl-<version>.zip` and writes `/marketplace.json` (pinned by `sha256`) into the Worker's static assets directory; the next deploy serves both from the Worker.
- The archive holds the plugin manifest, `hooks/hooks.json`, `hooks/register.js` and a README with odds and the privacy note (what leaves the machine: `machineHash`, serial, token, event counts).

### 9.2 Install
```
/plugin marketplace add https://nibbl-pet.<account-subdomain>.workers.dev/marketplace.json
/plugin install nibbl@nibbl
```
Needs Claude Code 2.1.224 or later. Verify before launch whether function hooks still need `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. If they do, the README and landing must say so on the first line.

### 9.3 Channels
Landing GIF first. Then Show HN, r/ClaudeCode, X with @ClaudeCode, a PR to `awesome-claude-code-mods`. Target launch before 2026-10-31 with a Genesis-only pumpkin hat.

### 9.4 Seeded bots
12 seeded nibbls (`is_bot = 1`) with realistic names, varied tiers (including one shiny and two Genesis) and levels 9-31. A cron gives them plausible XP growth within the same caps as players. They count in `/api/stats` (`counters.hatched` starts at 12, owner decision 2026-10-02, so there is no 0-vs-12 tell); retiring a bot does not change the counter. Owner decision. Known risk: the client and API behaviour are inspectable, so the community may notice. `is_bot` lets the owner label or retire them at any time, for example once 100 real nibbls exist.

## 10. Risks to verify first (prototype gate)

| Risk | Check | Fallback |
|---|---|---|
| `Raster` without background = terminal background | Draw a Raster with transparent cells in Ghostty and in a light theme | Draw HUD-only one-line mode, or pick bg per theme |
| Click on the pet | `Button` wrapping or overlaying the `Raster` (absolute Box) | Hotkey + a small `[♥]` Button next to the scene |
| Band height | `maxRows ≥ 8` in typical layouts | 4-row scene (16×8 px) when `maxRows < 8` |
| Function hooks flag | Fresh install via marketplace | Document the env var |
| `$.process.run` for `ioreg` | Works in a mod on macOS | Random install id in `$.store` (reinstall = new egg) |
| SHA-256 in the mod runtime | `crypto.subtle` available | Small pure-TS SHA-256 in `core` |

## 11. Out of scope for v1

Evolution branches by coding style (v1.1), elder stage and aura (v1.1), eggs at level milestones and album, multiplayer and duels, README badge, weekly Wrapped card, `Image` HD renderer, sound, model-backed reactions.

## 12. Testing

- `core`: unit tests (vitest) for determinism (same seed → same grid, snapshot hashes), odds (10^6 rolls within ±0.2% of targets), compatibility rules, rare-trait guarantee on 10^5 genomes, uniqueness of `genomeKey` on 10^5 seeds after dedupe.
- `mod`: `claude plugin test` for reactions, XP caps and hearts, egg → hatch flow with a mocked `/hatch`, offline queueing; `claude plugin validate` and `tsc` in CI.
- `api`: vitest with Miniflare/`wrangler dev` D1: hatch idempotency, IP rate limit, genome dedupe, XP caps, name filter, token check.
- `web`: Playwright smoke: page renders, leaderboard rows draw sprites, no console errors, 390 px has no horizontal scroll.

## 13. Open decisions

- Domain name for the landing and API.
- GitHub org name (`nibbl-dev` assumed).
