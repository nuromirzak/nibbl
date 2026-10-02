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

## Update 2026-10-02
Superseded by the two updates below (the single-Worker host was never the final setup). The Pages subdomain availability list above is out of date: see update (3).

## Update 2026-10-02 (2)
Superseded by update (3): the account workers.dev subdomain is fixed and contains the owner's name, so no Worker URL is public.

## Update 2026-10-02 (3)
Final setup, deployed 2026-10-02. The public host is `https://getnibbl.pages.dev`, a Cloudflare Pages project named `getnibbl` (static files from `apps/web/prototype`, config `apps/web/wrangler.toml`). Two Pages Functions forward every `/api/*` and `/p/*` request unchanged to the Worker `nibbl` through a service binding named `API`. The Worker keeps D1, the `*/5` cron and the secrets, and has `workers_dev: false` and `preview_urls: false`, so it has no public URL.

Why:
- Name privacy. The account's workers.dev subdomain contains the owner's name and cannot be changed from the CLI; the owner wants their name out of every public URL. A Pages subdomain is chosen per project, so it carries no name.
- `nibbl.pages.dev` is taken (see the availability list above), so the project is `getnibbl`, which was free.
- The Worker still hosts the cron, which Pages cannot run, so the split is Pages as front door and a private Worker behind it.

Consequences: both layers share the Workers free request pool (100k/day); static requests are free. Deploy order is Worker first, then Pages (see `docs/infra.md`). A custom domain later is a custom domain on the Pages project with no code change.
