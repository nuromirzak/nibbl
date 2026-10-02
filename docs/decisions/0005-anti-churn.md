# 0005 Anti-churn

Date: 2026-10-02. Status: accepted. Spec: [section 2, 4.2, 6.2](../superpowers/specs/2026-10-02-nibbl-design.md).

## Context
A user who rolls common may feel "I got a crappy one" and leave.

## Decision
- Unique genome: no two pets look alike, deduped by genome key AND by picture hash.
- The rarest trait is shown at hatch.
- The evolution branch is decided by coding style, not luck.
- Rarity never affects XP or level.
- A hatch ceremony makes the moment feel special.
- Metric guardrail: D7 gap between common and rare+ pets must stay at or under 5 pp.

## Why
Luck should set the start, effort the form (principle 4). Every pet needs something to be proud of.

## Rejected alternatives
- Rarity-based XP bonuses: would make common pets objectively worse.
- Letting users reroll: breaks one-roll scarcity.

## Consequences
- Dedupe by picture hash costs an extra key column and candidate retries.
- If the D7 gap exceeds 5 pp, revisit the hatch ceremony and trait display first.
