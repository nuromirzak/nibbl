# 0007 Names

Date: 2026-10-02. Status: accepted. Spec: [sections 2 and 6.6](../superpowers/specs/2026-10-02-nibbl-design.md).

## Context
Users want to name their pet; names on a public leaderboard need basic safety.

## Decision
- `serial` is the only unique id.
- User sets a name (up to 16 chars) and a label (up to 24). Neither is unique.
- Basic filter: blocklist (EN + RU), printable characters only, no URLs. The owner can hide a pet.
- Displayed as `Name #000042`.

## Why
The serial removes any need for unique names, and a named pet is the strongest attachment signal (target 50%).

## Rejected alternatives
- Globally unique names: invites squatting and support load.

## Consequences
- Renames are rate-limited (1 per week) and server-checked.
- Moderation is the owner's `is_hidden` flag; a `hide` metric guardrail lives in 0014.
