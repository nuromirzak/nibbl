# Nibbl: design spec

Date: 2026-10-02. Status: draft for owner review.

Nibbl is a tamagotchi-inspired pixel pet that lives in the band above the Claude Code prompt. It hatches from an egg after real work, reacts to what actually happens in the session, and grows over months. Every nibbl has a unique serial and a unique genome. A minimal Cloudflare backend assigns serials and rolls, keeps XP honest, and powers a public leaderboard on a pixel landing page.

## 1. Philosophy: quiet, honest, yours

1. **Honest.** The pet reacts only to real events (tool errors, passing checks, commits, turns). No emotions on a timer.
2. **Quiet.** Never blocks work, never nags, never guilt-trips. A nibbl never dies.
3. **Yours.** Unique genome and serial. No two nibbls look alike.
4. **Earned.** Luck sets the starting genes. Effort sets the form.
5. **Tiny.** 32×16 pixel scene, zero model tokens, keeps working offline.

Every feature is checked against these five. A feature that nags, costs tokens without opt-in, or fakes an emotion is out.

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
| Rare | 18% | + rare palettes, eyes |
| Epic | 9% | + epic accessories |
| Legendary | 3% | + legendary palettes, animated aura |
| Shiny | 4%, independent | alternate palette ramp per family |

Legendary shiny is about 1 in 830. Odds are public in the README, on the landing and via `/nibbl odds`.

**Rare-trait guarantee:** every genome has at least one trait whose theoretical probability is below 5%. At hatch the mod shows it: "Pattern *constellation*: 0.7% odds" (base odds, not a population count). The percentage is computed from the generator's own distributions, so it needs no population data.

### 4.3 Sprite anatomy (pet ≤16×16, bottom to top)
1. Shadow (1 px ellipse)
2. Back accessory: tail, wings, cape
3. **Body silhouette** per family and stage, with outline and 3-tone ramp (shade, base, highlight, light from top-left)
4. Pattern masked to the body: spots, stripes, stars, constellation
5. Belly or face patch
6. Eyes: shape gene × expression
7. Mouth: expression
8. Blush: on or off
9. Head: ears, horns, antenna, leaf
10. Hat: rarity tier only
11. Aura or shiny sparkle: drawn in code

**Compatibility rules** live in `core` (e.g. sprout has no ears; belly never overlaps eyes). The spike showed that unconstrained genes produce ugly pets.

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
| Method | Path | Body / result |
|---|---|---|
| POST | `/hatch` | `{machineHash}` → `{serial, token, seed, tier, shiny, genesis, hatchedAt}`. Idempotent per `machineHash`: the same machine gets the same pet. |
| POST | `/sync` | `{serial, token, events:[{type, at}]}` → `{xp, level, heartsLeft}` |
| POST | `/name` | `{serial, token, name?, label?}` → `{name, label}` |
| POST | `/import` | `{serial, token, machineHash}` → pet, rebinds machine |
| GET | `/leaderboard` | top 100 by XP, cached, rebuilt by cron every 5 min |
| GET | `/p/:serial` | HTML card page with OG tags |
| GET | `/p/:serial.png` | OG image rendered by `core` |
| GET | `/stats` | `{hatched}` for the live counter |

### 6.2 Roll
- `seed = HMAC-SHA256(ROLL_SECRET, machineHash)` truncated to 32 bits; tier and shiny come from separate HMAC outputs.
- Genome key = `core.genomeKey(genome)`. On collision, re-derive with `HMAC(ROLL_SECRET, machineHash + ":" + n)` until unique.
- Serial = next value of a counter, zero-padded to 6 digits.
- Genesis = `hatchedAt < LAUNCH_AT + 30 days`.
- Rate limit: 1 new hatch per IP per 24 h (an existing `machineHash` always succeeds).

### 6.3 Auth
- `token` = 32 random bytes, returned once at hatch. D1 stores only `sha256(token)`.
- Every write endpoint checks `serial` + `token`. No private keys or certificates in v1: the server is the source of truth and `/p/:serial` is the public proof.

### 6.4 XP
- Server buckets events by hour (`at` clamped to `[lastSyncAt − 3h, now]`), applies caps from §5.4, computes XP and level with `core`.
- Events beyond the caps are dropped silently. A cheater can match the most active honest player, never exceed them.

### 6.5 Schema (D1)
```sql
CREATE TABLE pets (
  serial       INTEGER PRIMARY KEY,
  machine_hash TEXT UNIQUE NOT NULL,
  token_hash   TEXT NOT NULL,
  seed         INTEGER NOT NULL,
  genome_key   TEXT UNIQUE NOT NULL,
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
  name_changed_at INTEGER
);
CREATE TABLE xp_windows (
  serial INTEGER NOT NULL, hour INTEGER NOT NULL,
  pets INTEGER NOT NULL DEFAULT 0, turns INTEGER NOT NULL DEFAULT 0, commits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (serial, hour)
);
CREATE TABLE hatch_ip (ip_hash TEXT PRIMARY KEY, last_at INTEGER NOT NULL);
CREATE TABLE leaderboard_cache (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, built_at INTEGER NOT NULL);
```

### 6.6 Name filter
Length limits, printable characters only, no URLs, a word blocklist (EN + RU), and `is_hidden` for owner moderation.

### 6.7 Capacity (free tier)
Workers: 100k requests/day. D1: 5M rows read and 100k rows written per day, 5 GB. With sync every 2-3 h plus session end, this holds about 10 000 daily users. Leaderboard is served from `leaderboard_cache`. Beyond that, Workers Paid is $5/month.

### 6.8 Infra as code
`wrangler.toml` (Worker, D1 binding, cron trigger, Pages project), SQL migrations in `apps/api/migrations`, secrets (`ROLL_SECRET`, `LAUNCH_AT`) via `wrangler secret put`. Cloudflare MCP is for logs and ad-hoc queries only, never for creating resources.

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
- CI in the private repo: `pnpm build` → esbuild bundles `apps/mod` + `core` into one readable ES module → pushes `plugin/` to the public `nibbl-dev/nibbl` repo with a version tag.
- Public repo holds `.claude-plugin/marketplace.json`, the plugin manifest, `hooks/hooks.json`, `hooks/register.js`, README with odds and the privacy note (what leaves the machine: `machineHash`, serial, token, event counts).

### 9.2 Install
```
/plugin marketplace add nibbl-dev/nibbl
/plugin install nibbl@nibbl
```
Verify before launch whether function hooks still need `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. If they do, the README and landing must say so on the first line.

### 9.3 Channels
Landing GIF first. Then Show HN, r/ClaudeCode, X with @ClaudeCode, a PR to `awesome-claude-code-mods`. Target launch before 2026-10-31 with a Genesis-only pumpkin hat.

### 9.4 Seeded bots
12 seeded nibbls (`is_bot = 1`) with realistic names, varied tiers (including one shiny and two Genesis) and levels 9-31. A cron gives them plausible XP growth within the same caps as players. They are excluded from `/stats` counts. Owner decision. Known risk: the client and API behaviour are inspectable, so the community may notice. `is_bot` lets the owner label or retire them at any time, for example once 100 real nibbls exist.

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
