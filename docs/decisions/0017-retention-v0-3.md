# 0017 Retention v0.3: greeting, evolution, achievements, invites, Nibbl of the week

Date: 2026-10-14. Status: accepted. Extends [0016](0016-social-v0-2.md) and amends [principles](../product-principles.md) (the toast rule).

## Context
0.2.0 gave the pet a maker and neighbours. What is still missing is a reason to open a session and smile, a moment worth showing off, and a reason to bring a friend. The owner wants this without streaks, guilt or chat.

## Decision
- **Daily greeting.** One toast per local day, on the first answered turn of that day. The day is computed from the machine's timezone offset. 32 bundled lines in 4 buckets by local hour (morning, afternoon, evening, night), one picked per day by a seeded shuffle, so it is deterministic. Skipped on the hatch turn and for eggs.
- **Time-of-day status.** When the pet is idle, its status line follows the hour: sipping coffee, sunbathing, reading the logs. The existing late-night nightcap stays. No toast, only a line.
- **Evolution toast.** When the stage changes (baby, teen, adult and beyond) the level-up toast is replaced by "{name} evolved into a teen! Show it off: /nibbl share". `/nibbl share` prints the card URL and a ready post text, plus an X intent link. No network call.
- **Achievements.** 15, awarded by the server from lifetime totals, never by the client. Unlocked ones are listed on the public card with their dates. `/nibbl achievements` shows them and the next 3 with progress. Toast on unlock, several at once are aggregated.
- **Invites.** `/nibbl invite <serial>` is accepted only while your own egg has not hatched. At hatch the serial is sent once; the server records a pair bond ("Friends") between the two pets, visible on both cards. An invite grants no XP, no better odds and no rarity: the roll stays server-side and independent. The inviter gets one toast when the friend's nibbl hatches.
- **Nibbl of the week.** A cron snapshots XP at the start of each ISO week (Monday 00:00 UTC). The winner is the real, non-hidden pet with the biggest XP gain over Monday to Sunday. Bots are excluded. The result is shown at [/week/](https://getnibbl.pages.dev/week/), marked with a crown on the leaderboard, and the winner gets one toast.
- **Toast queue.** The mod keeps a queue. At most 1 social toast per answered turn; the rest wait for later turns and stay visible in `/nibbl`. Priority order: hatch, evolution, week win, achievement, invite, wave, greeting, note, update. Hatch and level-up stay immediate. Existing wave, rank and update toasts go through the queue too.
- **Toast rule.** The allowed toasts are now: hatch, level-up, evolution, week win, achievement, invite, wave, rank milestone, daily greeting (once a day), maker note (at most 1 per 48 h) and update notice (once per version). Never more than one social toast per answered turn.

## Why
A greeting and a time-of-day line make the pet feel present at no cost. Evolution plus a share command turns the biggest visible change into a post. Achievements give long-term, honest goals tied to real events. An invite is a bond, not a transaction, so it cannot be farmed. The weekly crown gives the leaderboard a fresh winner every week, so latecomers are not locked out by lifetime XP.

## What we still refuse
- **Streaks.** No counter that resets, no "you broke it".
- **Guilt.** No copy that says the pet misses you, is sad or is waiting.
- **FOMO.** No limited-time events, no expiring rewards. Achievements never expire.
- **Chat.** No free text between users.
- **Paid anything**, and any advantage for inviting.

## Rejected alternatives
- Streak-based achievements: they punish a week off. Totals only.
- XP or better odds for invites: farming with throwaway pets.
- Client-awarded achievements: a modified client could grant itself everything.
- Toasts without a queue: three toasts in one turn would break "quiet".

## Data kept
- **Lifetime totals per pet**, of the same events already counted (turns, checks passed, commits, failed tool runs, pets, waves sent, active days). They are kept while the pet exists, and deleted with it.
- **The invite relation**: inviter serial and invited serial. Public on both cards as a friend count.
- **Achievements**: id and date, public on the card.
- **Week snapshot**: each pet's XP at the start of the week, kept for one week.
- The only new thing that leaves the machine is the inviter serial, once, at hatch.

## Consequences
- The privacy page and [how it works](../how-it-works.md) gain the items above.
- A pet that is hidden or deleted is excluded from the week and from the crown.
- The sync answer gains optional `unlocked`, `invites` and `week`, read leniently by the mod, so 0.3.0 works against an older server and older mods ignore them.
