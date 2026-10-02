# 0006 XP and hearts

Date: 2026-10-02. Status: accepted. Spec: [sections 5.4, 6.4](../superpowers/specs/2026-10-02-nibbl-design.md).

## Context
XP must reward real work and resist click farming without a login or signatures.

## Decision
- XP is server-authoritative; the mod shows optimistic values.
- Pet click: at most 5 XP-granting per UTC clock hour, shown as hearts. Over the cap the pet still reacts, no XP.
- Other caps per hour: turns 20, commits 10, check_pass 20.
- Values: pet 2, turn 3, check_pass 2, commit 2.
- Level curve: XP from level n to n+1 = `round(10 * n^1.4)`. Max level 99.
- Stages: egg, baby (1), teen (10), adult (25), elder (50).

## Why
Caps bound cheating: a cheater can at best match the most active honest player. Hearts make the cap visible and friendly instead of punishing.

## Rejected alternatives
- Uncapped clicks: Cookie Clicker style farming.
- Client-side XP: trivially forgeable.

## Consequences
- Constants live in `core` and are tunable.
- Events beyond the caps are dropped silently.
