# 0013 Landing balance

Date: 2026-10-02. Status: accepted. Spec: [section 7](../superpowers/specs/2026-10-02-nibbl-design.md).

## Context
The landing page was giving away the whole experience (rolling pets, all stages, all reactions), leaving no reason to install.

## Decision
Principle: **show the loop, hide the outcomes.**
- Removed "Roll your nibbl".
- Egg and baby are visible; teen, adult and elder are silhouettes "???".
- Branches are locked with one-line hints plus "There is a secret form. Nobody has found it yet."
- 2 of 4 reaction tiles are playable; the others say "Discover it in Claude Code".
- Device C button no longer hatches random pets.
- Terminal demo keeps only run tests and throw error.
- Epic, legendary and shiny examples are silhouettes, but odds percentages stay (honesty).
- Leaderboard shows top 5 plus a ghost row.
- Konami code stays a secret.
- Kept playable: pet hearts, screen mode, crawling bug, click-a-pet hop, sounds with mute.

## Why
Curiosity is the install driver; the loop shows the charm without spoiling outcomes.

## Rejected alternatives
- Full interactive rolling on the page: removes the reason to install and weakens one-roll scarcity.
- Hiding the odds: breaks principle 1.

## Consequences
- The landing and the mod must stay consistent on odds.
