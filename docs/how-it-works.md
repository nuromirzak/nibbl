# How nibbl works

The technical side, for the curious and for contributors. The [README](../README.md) is the short version.

## Repo layout

| Path | What |
|---|---|
| `packages/core` | Zero-dependency TypeScript: odds, genome, pixel drawing, XP. The only implementation of the art and the rules, shared by the mod, the server and the website. |
| `apps/mod-spike` | The Claude Code mod (function hooks). It draws the pet above the prompt and reacts to tool calls and turns. |
| `apps/api` | Cloudflare Worker + D1: hatch, sync, names, import, leaderboard, rank, card pages, PNG and SVG badges, cron. |
| `apps/web` | Cloudflare Pages project: the landing page, the leaderboard page and the plugin files. It forwards `/api/*` and `/p/*` to the Worker. |
| `tools/assets` | Regenerates the README GIFs and images from the real generator. |
| `docs/` | Spec, plans, decisions, infrastructure. |

## The pet

- **Scene:** 32×16 pixels, like the original Tamagotchi screen; the pet is up to 16×16. Drawn with half-block characters so it works in any truecolor terminal, with integer-only math so every runtime draws the same pixels.
- **Palette:** [Sweetie 16](https://lospec.com/palette-list/sweetie-16) by GrafxKid.
- **Genome:** family, body, palette, pattern, eyes, head, hat, mark. Every pet is unique: the server rejects a genome or a picture that already exists.
- **Stages:** egg, baby (level 1), teen (10), adult (25), elder (50).

## Odds

Every roll happens on the server, once per machine, forever. These are the real odds, the same ones the generator uses.

| Tier | Chance |
|---|---|
| Common | 40% |
| Uncommon | 30% |
| Rare | 18% |
| Epic | 9% |
| Legendary | 3% |
| Shiny (rolled separately, any tier) | 4% |

Every nibbl also carries at least one trait rarer than 5% (its mark: 24 kinds, each 1/24). Rarity never changes XP or level. The shown percentages are base odds, computed from the generator itself and checked against real roll frequencies in the tests.

## XP and hearts

| Event | XP | Cap per hour |
|---|---|---|
| Pet (click or hotkey) | 2 | 5 |
| A Claude turn | 3 | 20 |
| Tests, typecheck, lint or build passing | 2 | 20 |
| `git commit` | 2 | 10 |

The server computes XP, so a modified client cannot outgrow the most active honest player. Level n to n+1 costs `round(10 · n^1.4)` XP.

## Privacy

What leaves your machine, and nothing else:

| Data | Why |
|---|---|
| `machineHash` (SHA-256 of your hardware UUID plus a salt) | So the same machine always gets the same pet. The raw UUID never leaves. |
| `serial` and `token` | Your pet's id and its secret. The server stores only a hash of the token. |
| Event counts (type and time: turn, check passed, commit, error, pet, hide) | To compute XP on the server with hourly caps. |

- No code, prompts, file names, commands or outputs are ever sent. The mod sees that a test passed, not what the test was.
- Zero model tokens: reactions are plain code, not model calls.
- Your IP address is visible to Cloudflare like any web request; the API keeps only a daily-salted hash of it, for a per-day hatch limit.
- Sync runs every few hours and at session end. Offline, the pet keeps living and events wait in a local queue.

## Infrastructure

Everything is code: `apps/api/wrangler.jsonc`, `apps/web/wrangler.toml`, SQL migrations and provisioning scripts. The full inventory, deploy runbook and free-tier budget are in [docs/infra.md](infra.md).

## Development

```
pnpm install
pnpm test          # every suite
pnpm assets        # regenerate README images
pnpm -C apps/api dev
```
