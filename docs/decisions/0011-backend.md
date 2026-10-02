# 0011 Backend

Date: 2026-10-02. Status: accepted. Spec: [sections 6.7, 6.8](../superpowers/specs/2026-10-02-nibbl-design.md).

## Context
A minimal backend is needed for rolls, XP and the leaderboard, at zero cost to start.

## Decision
- Cloudflare Workers + D1 + Pages on the free tier (Workers 100k req/day; D1 5M reads, 100k writes, 5 GB).
- Infra as code with wrangler.
- Mod syncs every 2-3 h and at session end.
- Capacity: expect at most 10k pets. Genome space is verified for 100k hatches. If no candidate is unique, the Worker retries a second candidate batch, then answers 503 and the mod retries later.
- Workers Paid ($5/mo) if ever needed.

## Why
Free, global, and enough for the expected scale. Sparse syncing keeps request counts low.

## Rejected alternatives
- Self-hosted server: ops burden.
- Syncing every event: burns the free-tier quota.

## Consequences
- Revisit only if real hatches pass 50 000.
- The leaderboard is served from a cache rebuilt by cron.
