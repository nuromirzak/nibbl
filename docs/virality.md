# Nibbl: launch and growth playbook

Date: 2026-10-02. Status: draft for owner review. Companion to `docs/superpowers/specs/2026-10-02-nibbl-design.md` and `docs/product-principles.md`.

Placeholders used below: GitHub `nuromirzak/nibbl`, landing `https://nibbl-pet.pages.dev`. Both are open decisions (spec §13).

## 1. What makes it shareable

Nibbl spreads only if people *want* to show it. We never make them. Four levers:

| Lever | What it is | Where it lives |
|---|---|---|
| **The artifact** | A pet that is one of a kind: unique genome, unique serial, its own card page with an OG image. Something you own is something you show. | `/p/:serial`, OG image from `core` |
| **The comparison** | "Mine is a rare with horns, what did you get?" Every hatch invites a reply. Public odds make the comparison fair and fun instead of envious. | Hatch toast, card page, `/nibbl odds` |
| **The rarity** | Tiers, shiny (4%), a guaranteed trait rarer than 5%, low serial numbers, Genesis badge. Scarcity that is honest and never for sale. | Hover card, card page |
| **The first impression** | A 3-second GIF that explains everything: egg, crack, pet, bug, nibble. No reading needed. | `docs/assets/hero.gif`, `docs/assets/band.gif`, landing hero |

Landing rule we keep in every public asset: **show the loop, hide the outcomes.** Eggs, babies and common, uncommon and rare pets are fine. Teen, adult and elder looks, evolution branch names, the secret form, and epic, legendary and shiny looks are never shown before someone earns them. Odds percentages are public.

Anti-pattern: a launch post with a grid of legendary adults. It spoils curiosity (the main reason to keep going) and sets up "I got a crappy one" for 70% of people.

## 2. Share loops

### 2.1 Card page `/p/:serial`
- Every pet has one. `/nibbl` prints the URL. Nothing is posted automatically.
- OG image: the pet in its scene, name, serial, tier color, level. This is what shows up in Slack, Discord, X and iMessage unfurls, so it does the selling.
- The page ends with one line and one button: "Get your own nibbl" linking to the landing install block.
- Loop: owner shares card → friend sees a unique pet → installs → gets their own card.

### 2.2 README badge on GitHub profiles
- Profile READMEs are seen by every visitor of a developer's profile. A pet there is a quiet, permanent ad.
- v1 (works with the spec as written): the card PNG linked to the card page.
  ```markdown
  [![My nibbl](https://nibbl-pet.pages.dev/p/000042.png)](https://nibbl-pet.pages.dev/p/000042)
  ```
- After v1: a compact SVG badge (example in `docs/assets/badge-example.svg`, pure rects, about 14 KB). Needs a new Worker route `/p/:serial/badge.svg`; the spec lists "README badge" as out of scope for v1 (§11), so this is a v1.1 item.
- Level shown on the badge updates by itself (the Worker renders it), so a badge stays a living thing, not a screenshot.

### 2.3 The hatch moment screenshot
- Hatching is the peak emotion: wobble, three cracks, flash, a new face, and "Mark *star on forehead*: 4.17% odds".
- Make it screenshot-friendly: the hatch toast shows name, serial, tier and rarest trait in one compact block, readable in a cropped screenshot.
- Optional, opt-in only: after the hatch toast, one line `share: nibbl-pet.pages.dev/p/000042`. No prompts, no "share to unlock".

### 2.4 Genesis serials
- Pets hatched in the first 30 days after launch get the Genesis badge (server clock, spec §2).
- Low serials (`#000001` to `#000999`) are naturally scarce. People show them off on their own; we only need to display them clearly.
- Say it once, plainly, in launch posts: "Genesis badge for pets hatched in the first 30 days." No countdown timers, no "hurry".

## 3. Launch checklist (order and timing)

Today is 2026-10-02. Target: launch day on **Tuesday 2026-10-20**, which leaves 11 days of Genesis window before Halloween and a buffer if anything slips. Hard latest: 2026-10-27.

| When | Step | Done when |
|---|---|---|
| T-14 | Gate checks from spec §10 pass (Raster transparency, click, band height, function hooks flag, `ioreg`, SHA-256) | All six rows green or fallback chosen |
| T-10 | **Landing GIF first.** `pnpm assets`, put `hero.gif` and `band.gif` on the landing and in the public README | GIFs render at 640 and 880 px, under 1.5 MB |
| T-10 | Set GitHub social preview to `docs/assets/social-preview.png` (repo Settings → General → Social preview) | Link unfurl shows the preview |
| T-7 | 5-10 friends install from the real marketplace path, on a clean machine | 100% hatch within a day, zero support questions you cannot answer in one line |
| T-5 | Submit the PR to `awesome-claude-code-mods` (draft below). Lists merge slowly, so start early | PR open |
| T-3 | Record a 20-second screen capture of a real session for X (real terminal, real hatch) | MP4 under 15 MB |
| T-1 | Seeded bots: decide whether to label them on the leaderboard before launch (see §5) | Decision written down |
| **T0 08:00 ET** | **Show HN** post | Live, you are online for 4 hours to answer comments |
| T0 +2 h | r/ClaudeCode post | Live |
| T0 +3 h | X thread tagging @ClaudeCode | Live |
| T0 to T+2 | Reply to every comment and issue within hours. Fix the top bug same day | |
| T+3 | Short follow-up on X: first numbers (hatched count from `/stats`, rarest pet so far), honest and small | |
| T+11 (2026-10-31) | Halloween Genesis pumpkin hat goes live (§3.6) | |
| T+30 | Genesis window closes. One post: "Genesis is closed, N pets got it." | |

Verify before posting: the exact X handle for Claude Code and that `awesome-claude-code-mods` exists and how it takes submissions. Adjust names if they differ.

### 3.1 Show HN title options

Pick one. HN prefers plain, concrete, no hype, no emoji.

1. `Show HN: Nibbl, a tiny pixel pet that lives above your Claude Code prompt`
2. `Show HN: A Tamagotchi for Claude Code that eats bugs when your tests pass`
3. `Show HN: Nibbl - a pixel pet that reacts to real coding events, zero tokens`

Recommended: option 2. It explains the loop in one line and the "eats bugs when tests pass" image is the hook.

**First comment (post it right after submitting):**

> Hi HN. I spend a lot of time waiting for Claude Code, so I made something small to keep me company.
>
> Nibbl is a pixel pet that lives in the band above the prompt. It hatches from an egg after 10 turns. After that it reacts only to things that really happen: a failed tool call drops a bug on the scene, passing tests make it eat the bug, a commit makes it carry a box, and after 2am it puts on a nightcap. It never nags, has no streaks, and it cannot die.
>
> Some details people may care about:
> - Zero model tokens. Reactions are plain code driven by hook events.
> - Every pet is unique: the server rolls a genome once per machine and dedupes it, so no two pets look alike. Odds are public (40/30/18/9/3, shiny 4%) and every pet has at least one trait rarer than 5%.
> - What leaves your machine: a hash of the hardware UUID, the pet's serial and token, and event counts (type and time). No code, prompts or file names.
> - Art is procedural: one generator (under 1,000 lines of TypeScript, zero dependencies) draws a 32x16 scene with the Sweetie 16 palette, and the same code draws the card images on the server.
>
> Install is two commands inside Claude Code. Happy to answer anything, especially about the procedural pixel art and keeping XP honest without accounts.

### 3.2 r/ClaudeCode post draft

**Title:** I made a tiny pixel pet that lives above the Claude Code prompt and eats bugs when your tests pass

**Body:**

> Waiting for Claude felt a bit lonely, so I built Nibbl, a Tamagotchi-style pet for Claude Code.
>
> [band.gif]
>
> How it works:
> - An egg appears above your prompt and hatches after 10 turns.
> - A tool error drops a bug into its little 32x16 scene. When tests pass, it eats the bug.
> - Commits, late nights and idle time all get their own reactions. It only reacts to real events.
> - It levels up over weeks and months. I am not showing what it grows into; you find out by getting there.
>
> What it does not do: cost tokens, nag you, send your code anywhere, or die if you go on holiday.
>
> Every pet is unique with a serial number, and pets hatched in the first 30 days get a Genesis badge. Odds are public in the README.
>
> Install:
> ```
> /plugin marketplace add nuromirzak/nibbl
> /plugin install nibbl@nibbl
> ```
>
> I would love to see what you hatch. Feedback and bug reports very welcome.

Rules: read the subreddit rules first (self-promotion limits, flair). Post once. Do not cross-post the same text to five subreddits on the same day.

### 3.3 X thread draft (tag @ClaudeCode)

> **1/** I made a tiny pixel pet that lives above your @ClaudeCode prompt. It hatches from your work and eats your bugs. [hero.gif]
>
> **2/** It reacts only to real events. Tool error: a bug drops in. Tests pass: it eats the bug. Commit: it carries a box. 2am: nightcap. [band.gif]
>
> **3/** Every nibbl is one of a kind. Unique genome, unique serial, public odds: 40 / 30 / 18 / 9 / 3, plus a 4% shiny. Everyone gets at least one trait rarer than 5%. [pets-sheet.png]
>
> **4/** Zero tokens. Never nags. No streaks. It cannot die. Your code never leaves your machine.
>
> **5/** Pets hatched in the first 30 days get a Genesis badge. Two commands to install: nibbl-pet.pages.dev
>
> Show me what you hatch.

Post the thread from the owner's personal account, not a brand account. Reply to people who share hatches; quote-post the best ones (with permission if it is more than a public reply).

### 3.4 PR to `awesome-claude-code-mods`

**PR title:** Add Nibbl, a pixel pet in the AbovePrompt band

**Entry (match the list's format):**

```markdown
- [Nibbl](https://github.com/nuromirzak/nibbl) - A tiny pixel pet above your prompt that reacts to real events (errors, passing tests, commits). Zero tokens, works offline.
```

**PR body:**

> Adds Nibbl, a mod that draws a 32x16 pixel pet in the band above the prompt using function hooks. It reacts to tool errors, passing checks and commits, costs zero model tokens, and ships as one readable bundle. Happy to adjust the description to the list's style.

### 3.5 Timing notes
- HN: weekday morning US Eastern (08:00-10:00). Tuesday to Thursday. Avoid days with a big Anthropic launch, since attention goes there.
- Reddit: same day, a few hours later, so you can handle both comment streams.
- X: when the HN post has a link to quote, or right after Reddit.

### 3.6 Halloween Genesis pumpkin hat (before 2026-10-31)
- Idea: every Genesis pet (hatched in the first 30 days) wears a small pumpkin hat on 2026-10-31 local date only, then it goes back in a "Genesis wardrobe" shown on the card page.
- Why it works: a real event on a real date, rewards early users without paywalls, makes a natural second post ("Byte got a pumpkin for Halloween") a week after launch.
- Honesty rules: it is a cosmetic overlay, not a gene. It does not change `genomeKey`, `visualKey`, odds or rarity, and the card page says so.
- Hide-the-outcomes rule: tease it with a silhouette or "something happens on Oct 31 for Genesis pets", do not post the finished look before the day.
- Needs work in `packages/core` (not done here): the pumpkin as a new hat sprite, and a rule for pets whose head part would clash (spec §4.3: a hat clears ears and horns; for a cosmetic overlay it should sit above ears instead of removing them, since it must never change the genome's look outside that day).
- Only works if launch is at least about a week before Oct 31, so there are Genesis pets to wear it.

## 4. What to measure

All product metrics and targets live in [`docs/product-principles.md`](./product-principles.md#success-metrics): Weekly Active Nibbls (north star), activation, D7/D30, named pets, `/nibbl hide` guardrail, common vs rare D7 gap, zero tokens. Virality adds only these:

| Signal | Source | Why |
|---|---|---|
| Visits to `/p/:serial` and click-through to the landing | Worker logs (counts only, no cookies) | Do cards bring people? |
| Card visits by referrer domain | `Referer` header, aggregated | Which loop works: github.com (badge), x.com, slack |
| GitHub stars per day | star-history.com chart, GitHub API | Launch day curve and the tail |
| Repo views and unique visitors | GitHub Insights → Traffic (14 days, owner only) | Source of truth for README traffic |
| README view counter | hits.sh badge | Public, rough social proof |
| Hatches per day | `/stats` (bots excluded) | The only number that matters for growth |
| Install → hatch within 24 h | Server (hatch time) | First impression worked |

Anti-pattern: tracking pixels, fingerprinting, or adding analytics to the mod. The privacy section in the README is a promise; growth numbers come from the server data we already have.

## 5. Anti-patterns (do not do)

| Do not | Why | Instead |
|---|---|---|
| Post the same text in many subreddits, Discords and Slack groups on one day | It is spam and gets the domain flagged | One post per community, written for it, after reading its rules |
| Ask friends to upvote, or post fake reviews and testimonials | Vote rings get HN posts killed and are dishonest | Ask friends to try it and comment only if they have something real to say |
| Forced sharing: "share to unlock", XP for shares, a share prompt after every level | Breaks "Quiet" and "Sharing is opt-in only" (FarmVille lesson in product-principles) | The `/nibbl` command prints the card URL; that is all |
| Show epic, legendary, shiny or adult looks in marketing | Spoils curiosity, sets up disappointment for most hatches | Show the loop: egg, crack, baby, bug, nibble |
| Count seeded bots as users ("join 500 nibblers!") | Bots exist for an empty-leaderboard problem (spec §9.4); using them as social proof is a lie and the API is inspectable | Quote only `/stats`, which excludes bots. Consider labeling bots before launch |
| Countdown timers and FOMO for Genesis | Product principle: no FOMO and streak pressure | State the 30-day rule once, plainly |
| DM people or tag big accounts asking for retweets | Spammy, and it burns goodwill | Tag @ClaudeCode once in the thread; let the work speak |
| Claim speed or token numbers you have not measured | One wrong claim in an HN thread sinks trust | "Zero model tokens" is true by design; say only that |

## 6. View and badge services

All of them are third-party image services fetched by GitHub through its camo proxy. None of them sees the reader's IP or cookies (camo hides them), but each one is a dependency that can go down or change.

| Service | Used for | Privacy | Uptime and tradeoffs |
|---|---|---|---|
| [shields.io](https://shields.io) | Stars, version, license, "made for Claude Code" badges | Sees only camo requests; for dynamic badges it calls the GitHub API | Very reliable, widely used. Dynamic badges cache for minutes, so numbers lag. Static badges never change |
| [hits.sh](https://hits.sh) (**chosen** view counter) | `hits.sh/github.com/nuromirzak/nibbl.svg` | Counts image requests; stores the URL key and counts, no user data from GitHub readers | Keyed by any URL, so it works for a repo README (not only profiles), shields-style options to match the badges row. Counts camo fetches, so caching can under- or over-count; treat it as rough social proof. If it goes down the badge breaks, nothing else |
| [komarev.com ghpvc](https://komarev.com/ghpvc/) (alternative) | `komarev.com/ghpvc/?username=...` | Same model as hits.sh | Built for profile READMEs, keyed by a username string. Works for a repo with a made-up key, but hits.sh is the more natural fit for a repo. Good choice later for a "nibbl on your profile" counter |
| [star-history.com](https://star-history.com) | Star history chart (light and dark via `<picture>`) | Calls the GitHub API for stargazer dates | Free, popular. Heavy repos can hit GitHub API limits and render slowly; the chart is a nice-to-have |
| GitHub Insights → Traffic | Real views, unique visitors, referrers | First party, owner only | Only 14 days of history; export weekly if you want a long series |

Why hits.sh: it is the one counter that is keyed by the repo URL itself and documents repo use, it needs no account, and its badge style matches shields. The true numbers still come from GitHub Insights.

## 7. Assets

Generated with code from `@nibbl/core` by `tools/assets` (`pnpm assets` at the repo root). Fixed seeds, so every run gives byte-identical files.

| File | What | Notes |
|---|---|---|
| `docs/assets/hero.gif` | Egg wobbles, cracks in 3 steps, flash, baby blinks, heart pops | 640x360, about 65 KB, loops |
| `docs/assets/band.gif` | Mock Claude Code terminal: work, failed test drops a bug, fix passes, pet eats it | 880x452, about 87 KB, loops |
| `docs/assets/social-preview.png` | 1280x640 GitHub social preview | Upload in repo Settings |
| `docs/assets/pets-sheet.png` | 12 babies, common to rare, with real odds of the rarest trait | |
| `docs/assets/badge-example.svg` | Example profile badge, pure rects | About 14 KB |

Seeds live in `tools/assets/src/pets.ts`; `tools/assets/src/survey.ts` renders 48 candidates to pick new ones by eye.
