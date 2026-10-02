# Security

## Reporting a vulnerability

Please report security issues privately through [GitHub security advisories](https://github.com/nuromirzak/nibbl/security/advisories/new). Do not open a public issue.

You can expect a first answer within a few days. Fixes ship as a new plugin version and a redeploy of the API.

## Scope

- The Claude Code mod (`apps/mod`, shipped as `plugin/` and the archive on getnibbl.pages.dev)
- The API (`apps/api`, a Cloudflare Worker with D1)
- The site (`apps/web`)

## What the mod sends

Only a SHA-256 hash of the machine id, the pet's serial and token, event types with times, and the name and label the owner sets. Never code, prompts, file paths or command text. Details in [docs/how-it-works.md](docs/how-it-works.md).

## Secrets

The API's only secrets (`ROLL_SECRET`, `IP_SALT`) live in Cloudflare and are never committed. Tests generate random values per run.
