# Nibbl decisions

Owner product decisions, ADR-lite. Each file records what was decided, why, rejected alternatives and consequences. Date is 2026-10-02 unless stated. The design lives in [the spec](../superpowers/specs/2026-10-02-nibbl-design.md), the philosophy in [product principles](../product-principles.md).

| # | File | Summary |
|---|---|---|
| 0001 | [name-and-philosophy](0001-name-and-philosophy.md) | Name Nibbl, philosophy "quiet, honest, yours", mission "make waiting for Claude feel warm" |
| 0002 | [core-loop](0002-core-loop.md) | Pet + expeditions + verified roll, single-user, no seasons, Tamagotchi lessons |
| 0003 | [identity-no-oauth](0003-identity-no-oauth.md) | No login: machineHash + server-issued pet token, export/import code |
| 0004 | [rarity-and-scarcity](0004-rarity-and-scarcity.md) | Odds 40/30/18/9/3, shiny 4%, honest odds, mark gene, serial and Genesis |
| 0005 | [anti-churn](0005-anti-churn.md) | Protect users who roll common: unique genome, rarest trait at hatch, D7 gap guardrail |
| 0006 | [xp-and-hearts](0006-xp-and-hearts.md) | Server-authoritative XP, hourly caps, hearts, level curve and stages |
| 0007 | [names](0007-names.md) | Serial is the only unique id, names are free-form and filtered |
| 0008 | [art-and-rendering](0008-art-and-rendering.md) | Procedural pets from one TS generator, 32x16 scene, Sweetie 16, half-block render |
| 0009 | [bots-on-leaderboard](0009-bots-on-leaderboard.md) | 12 seeded bots so early users are not alone |
| 0010 | [code-and-distribution](0010-code-and-distribution.md) | Private monorepo, readable bundle in a public marketplace repo |
| 0011 | [backend](0011-backend.md) | Cloudflare Workers + D1 + Pages on the free tier, capacity limits |
| 0012 | [domain](0012-domain.md) | No custom domain for now, free pages.dev subdomain |
| 0013 | [landing-balance](0013-landing-balance.md) | "Show the loop, hide the outcomes" on the landing page |
| 0014 | [metrics](0014-metrics.md) | North star Weekly Active Nibbls and guardrails |
