# 0012 Domain

Date: 2026-10-02. Status: accepted (revisit later). Spec: [section 13](../superpowers/specs/2026-10-02-nibbl-design.md).

## Context
The landing and API need a URL; the spec listed the domain as open.

## Decision
No separate custom domain for now. Use a free Cloudflare Pages subdomain.

## Availability (checked 2026-10-02)
- Pages subdomains taken: nibbl.pages.dev, nibble.pages.dev, nibbles.pages.dev, getnibble.pages.dev.
- Pages subdomains free: nibbl-pet, nibblpet, nibbl-dev, getnibbl, nibbl-app, nibble-pet, nibblepet, nibble-dev (all .pages.dev).
- Custom domains: nibbl.dev, .com, .app, .io, .pet, .sh, .so are taken. getnibbl.dev and nibbl.gg are free.
- If ever bought, Cloudflare Registrar at-cost per year (renewal same): .com $10.11, .org $10.11, .net $10.76, .xyz $11.20, .dev $12.18.

## Why
Zero cost and zero setup until the product shows traction.

## Rejected alternatives
- Buying getnibbl.dev or nibbl.gg now: premature spend.

## Consequences
- Moving to a custom domain later means updating install docs, OG URLs and the card links.
