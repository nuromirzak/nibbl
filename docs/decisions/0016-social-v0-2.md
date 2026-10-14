# 0016 Social v0.2: notes, waves, rank neighbours, update notice

Date: 2026-10-14. Status: accepted. Supersedes the "social features wait" clause of [0002](0002-core-loop.md). Amends [principles](../product-principles.md) (the toast rule).

## Context
Nibbl has 13 real users and no sense that a person made it or that other people are around the pet. 0.1.0 also cannot tell users that a new version exists. The owner wants warmth and reach without chat, moderation load or guilt mechanics.

## Decision
- **Maker notes.** 20 notes bundled in the mod (works offline), shown as a toast `✉ from the maker: ...`. Delivered at the end of an answered turn when the pet is hatched, at least 48 h passed since the last note and the session has at least 3 answered turns. Order is a per-pet shuffle (`mulberry32(seed)`), so no repeats; after 20 they stop. `/nibbl notes` lists them.
- **Waves.** `/nibbl wave <serial>` sends a heart to another nibbl. At most 10 a day, 1 per target per day, no self-waves. No text, no XP (so no farming). Waves reach the target on its next sync, aggregated into one toast per sync.
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

## Consequences
- The quiet rules hold: nothing blocks, no FOMO, no free text from users.
- The sync answer gains optional `waves`, `rank` and `latest`. The mod reads them leniently (missing or malformed means ignored), so 0.2.0 works against an older server, and 0.1.0 ignores them.
- The privacy list gains one item: the serial you wave at.
- 0.1.0 users learn of 0.2.0 only outside the mod (site, release notes, README).
