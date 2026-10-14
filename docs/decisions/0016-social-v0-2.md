# 0016 Social v0.2: notes, waves, rank neighbours, update notice

Date: 2026-10-14. Status: accepted. Supersedes the "social features wait" clause of [0002](0002-core-loop.md). Amends [principles](../product-principles.md) (the toast rule).

## Context
Nibbl has 13 real users and no sense that a person made it or that other people are around the pet. 0.1.0 also cannot tell users that a new version exists. The owner wants warmth and reach without chat, moderation load or guilt mechanics.

## Decision
- **Maker notes.** 20 notes bundled in the mod (works offline), shown as a toast `✉ from the maker: ...`. Delivered at the end of an answered turn when the pet is hatched, at least 48 h passed since the last note and the session has at least 3 answered turns. Order is note 1 first, note 20 last, and a per-pet shuffle (`mulberry32(seed)`) of the 18 between, so no repeats; after 20 they stop. Note 3 (the naming tip) is skipped for a named pet and note 10 (level 10 tease) from level 10. A note never lands on the hatch turn: 3 answered turns after the hatch are needed. `/nibbl notes` lists them.
- **Waves.** `/nibbl wave <serial>` sends a heart to another nibbl. At most 10 a day, 1 per target per day, no self-waves. No text, no XP (so no farming). Waves reach the target on its next sync, aggregated into one toast per sync. Bots can be waved at too (they never read them; undelivered waves are pruned after 30 days).
- **Rank neighbours.** `/nibbl` shows the rank and the nibbl just above, with the command to wave at it. Toasts only on firsts: entering the top 10 and reaching #1.
- **Update notice.** The server sync answer carries `latest`; when it is newer than the mod's version, `/nibbl` shows the update commands and a toast appears once per version.
- **Toast rule.** Allowed toasts are: hatch, level-up, a maker note (at most 1 per 48 h), a wave (at most 1 toast per sync, aggregated), a rank milestone (first top 10, first #1) and an update notice (once per version).
- The hatch toast ends with `/nibbl name to name it`.

## Why
Notes give a person behind the pet at no server cost and no dependency on being online. Waves and rank neighbours give "other people around" with the smallest possible surface: a number in, a heart out.

## Rejected alternatives
- Free-text chat or messages: moderation burden and a harassment surface.
- A server-delivered letter: users are offline often, so it is fragile.
- XP for waves: invites farming with throwaway pets.
- A push-style update nag: breaks "quiet". Once per version, and passive in `/nibbl`.

## Sync contract and cost
- **Capability flag.** The 0.2.0 mod sends `v: <version>` in the `/api/sync` body. Only then does the server read and mark the wave inbox and answer `waves`. A client without `v` (0.1.0) gets exactly the old answer plus `latest`, and its waves stay undelivered until it updates.
- **Rank on request.** Rank is computed only when the body has `v` and `rank: true`. The mod sets it when `v1.rankAt` is missing or older than 24 h, and stores `rankAt` when a rank arrives. A hidden pet is answered `rank: null`. `total` comes from `counters.hatched` (an upper bound: bots and hidden pets included), never below the position.
- **Cost.** The position is a COUNT over the pets above the syncing one: O(position) rows read per rank request, at most one per pet per day. This is fine for the current scale; past about 2k pets, ranks must be computed by the cron into a table and read by serial.
- **Atomicity.** The rank reads and the wave marks run in the same `DB.batch` as the sync UPDATE, so a committed sync cannot fail afterwards with a 500. Wave delivery is at most once: a response lost after the commit loses that toast.
- **Cron.** Delivered waves are pruned once their UTC day ends (until then they still count toward the daily limits); undelivered ones after 30 days.
- **Mod state.** `rank`, `rankAt`, `bestRank`, `waves`, `noteIdx` and `noteAt` belong to one pet and are cleared when another serial takes the machine (import, moved, re-hatch); `latest` and `updateSeen` stay. The first rank ever seen only seeds `bestRank`: no milestone toast.

## Consequences
- The quiet rules hold: nothing blocks, no FOMO, no free text from users.
- The sync answer gains optional `waves`, `rank` and `latest` (see the contract above). The mod reads them leniently (missing or malformed means ignored), so 0.2.0 works against an older server, and 0.1.0 ignores them.
- The privacy list gains one item: the serial you wave at.
- 0.1.0 users learn of 0.2.0 only outside the mod (site, release notes, README).
