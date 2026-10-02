# 0009 Bots on the leaderboard

Date: 2026-10-02. Status: accepted (owner decision). Spec: [section 9.4](../superpowers/specs/2026-10-02-nibbl-design.md).

## Context
An empty leaderboard at launch makes early users feel alone.

## Decision
12 seeded bots (`is_bot`) with realistic names and plausible XP growth within the same caps as players. They are excluded from public counts.

## Why
Early users get a populated board and something to compare against.

## Rejected alternatives
- Empty board: weak first impression.
- Labeling bots from day one: defeats the purpose at launch.

## Consequences
- Known risk: client and API behavior are inspectable, so the community may notice.
- `is_bot` lets the owner label or retire them at any time, for example after 100 real pets.
