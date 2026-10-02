# 0014 Metrics

Date: 2026-10-02. Status: accepted. Source: [principles](../product-principles.md).

## Context
We need a few numbers that say whether the pet is loved without invasive tracking.

## Decision
- North star: **Weekly Active Nibbls** (synced on at least 3 distinct days in the week).
- Activation: hatch within 24 h of install, at least 70%.
- Retention: D7 / D30 at least 40% / 25%.
- Attachment: named pets at least 50%.
- Virality: `/p/:serial` visits and GitHub stars.
- Guardrails: hide under 10%, D7 gap common vs rare+ at most 5 pp, model tokens always 0.

## Why
All come from data the server already holds (sync days, hatch time, name, tier). Thresholds are the owner's targets, not industry benchmarks.

## Rejected alternatives
- Raw installs or DAU: do not show attachment.
- Streak-based engagement metrics: contradict the no-streaks rule.

## Consequences
- Needs a `hide` event in the sync payload (to be added in the mod plan).
