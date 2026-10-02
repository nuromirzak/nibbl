# 0004 Rarity and scarcity

Date: 2026-10-02. Status: accepted. Spec: [section 4.2](../superpowers/specs/2026-10-02-nibbl-design.md).

## Context
Rarity drives pride and sharing, but each machine gets exactly one roll, so odds must be kinder than in games with many rolls.

## Decision
- Tier odds 40 / 30 / 18 / 9 / 3 (common to legendary). Shiny 4%, independent.
- Benchmarks: CS2 knife 0.26%, Genshin 0.6% per pull, Pokemon shiny 1/4096, Hearthstone about 5% per pack, Overwatch 7.4% per box. Those players roll many times; we give one roll per machine, so per-roll odds must be much higher.
- Scarcity comes from: a unique serial (globally unique id), a Genesis badge for the first 30 days by server clock, and evolution by real milestones.
- **Honest odds.** Shown values equal real frequencies. An earlier "spice" substitution was removed: it showed freckles at 3.2% while 43% of pets had them.
- Every pet has a **mark** gene with 24 values, each 1/24 (about 4.2%), so every pet has a trait under 5%.
- Hats only on epic (bow) and legendary (crown).

## Why
Honesty is principle 1. One roll plus high odds keeps rare feeling reachable without gacha mechanics.

## Rejected alternatives
- Paid rerolls, loot boxes: contradict "we sell nothing".
- Invite-only waitlist: kills the work-right-after-install goal.
- Streak loss: guilt mechanic.

## Consequences
- `traitOdds` must be computed analytically and checked by a 200 000-roll property test.
- Genes are never rewritten after the roll.
