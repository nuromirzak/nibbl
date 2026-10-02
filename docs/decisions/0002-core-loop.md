# 0002 Core loop

Date: 2026-10-02. Status: accepted. Spec: [sections 2 and 5.3](../superpowers/specs/2026-10-02-nibbl-design.md), [principles](../product-principles.md).

## Context
Scope for v1 had to be small enough to ship and still give a reason to come back.

## Decision
- Core v1 = **pet + expeditions + verified roll**. While Claude works, the pet goes on an expedition and returns with loot when the turn completes. The roll is server-side and verifiable.
- Single-user only. Multiplayer, duels and trading come later.
- No seasons. One roll per machine, forever.
- Tamagotchi lessons applied: the pet never dies, no guilt, time stops without you, bugs instead of poop, sleeps at night. No streaks.

## Why
- Expeditions map onto the dead time the mission targets: waiting for Claude.
- Seasons and streaks create FOMO and pressure, which the principles forbid.

## Rejected alternatives
- Multiplayer or duels in v1: too much scope and moderation burden.
- Seasonal resets: break "yours" and add pressure.
- Streaks and death from neglect: guilt mechanics.

## Consequences
- Progress depends only on real work, never on absence.
- Social features wait for a later version.
