# 0018 Guests and gifts v0.4: visits, coding today, badge, gift eggs

Date: 2026-10-28. Status: accepted. Extends [0016](0016-social-v0-2.md) and [0017](0017-retention-v0-3.md) and amends [principles](../product-principles.md) (the toast rule).

## Context
Real usage is 16 users, about 7 of them active daily. Retention is fine, but the social features are unused: zero invites and zero user-to-user waves. A wave is a toast line and an invite is a serial number, so nibbl still feels isolated. The owner wants friends to be visible in the scene, without chat, guilt or any advantage.

## Decision
- **Guest visit.** When a wave arrives, the sender's pet walks into your scene and stays for about 90 seconds, and your pet steps aside. This replaces the wave toast for clients at 0.4.0 or newer. Older clients, and waves from an older server without the sender's look, keep the toast.
- **"N nibbls coding today".** An aggregate count of real, visible pets that synced in the last 24 hours, computed by a cron from sync times the server already has. A live "online now" is not possible with a sync every few hours, and no per-pet online status is shown anywhere. The number appears on the landing page, in `/nibbl` and, while the pet is idle, as a status line in the band.
- **`/nibbl badge`.** Prints the ready markdown for a GitHub profile README. No network call.
- **Gift eggs.** A pet lays one egg at level 10 and one at level 25, two for its whole life. Each egg is a one-time code, shown by `/nibbl egg`. A friend who hatches with it gets a pet that inherits the parent's mark when possible. Inheritance is best-effort: the server filters its candidates by mark, and if none matches it falls back to a normal roll, so a hatch never fails. The parent link ("child of #000013") and "eggs hatched" are public on both cards. No XP, no change in odds or rarity.
- **Legacy invite.** The 0.3.0 serial invite is still accepted by the server and by `/nibbl invite <serial>`. `/nibbl invite` is now an alias of `/nibbl egg`.
- **Toast queue.** The wave toast is replaced by the visit. A new toast for a hatched gift egg ("Your egg hatched at a friend's: #000031 has your mark", kind invite) takes the invite slot. Priority order and the 1-per-turn rule from 0017 are unchanged.
- **Toast rule.** Allowed toasts: hatch, level-up, evolution, week win, achievement, invite and gift-egg hatched, wave (only without a look, for older servers), rank milestone, daily greeting, maker note and update notice. Never more than one social toast per answered turn. A visit is a scene change, not a toast.

## Why
A pet that walks into your scene is a stronger signal than one more line of text, and it costs nothing to the receiver. An egg is a gift with a story ("this one has my mark"), which is a better reason to bring a friend than a typed serial. The coding-today count shows life without ranking anyone or exposing who is online.

## What we still refuse
- **Streaks, guilt, FOMO, chat, paid anything**, as in 0017.
- **Online status per pet.** Only the aggregate count.
- **Advantages for gifting or being gifted.** No XP, no better odds, no rarity.
- **Selling or trading codes.** An egg is one-time and tied to the parent, it grants nothing.

## Rejected alternatives
- A live "online now" count: impossible at this sync cadence, and a per-pet status would be surveillance.
- Guaranteed mark inheritance: the roll must stay server-side and fair, so it is best-effort within 96 candidates (the mark gene is 1 in 24).
- More than two eggs per pet: the codes would be farmed with throwaway pets.
- Keeping the wave toast next to the visit: two signals for one event.

## Data kept
- **Gift codes**: a hash of each code, the parent serial, the milestone, and once redeemed, the child serial and time. The parent link is public on both cards.
- **Active count**: one number, refreshed by cron, derived from existing sync times. No new per-user data is collected.
- The only new thing that leaves the machine is the gift code, once, at hatch (replacing the inviter serial).

## Consequences
- The privacy page and [how it works](../how-it-works.md) replace the inviter serial row with the gift code, and list the parent link, eggs hatched and the aggregate count.
- The sync answer gains `active`, richer `waves` items and `gift` and `mark` on `invites`, sent only to clients at 0.4.0 or newer. Older clients keep their exact response shape.
- A hidden or deleted parent is not shown on a card, and a gift from a hidden or bot parent is refused.
