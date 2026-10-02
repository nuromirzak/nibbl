# 0003 Identity without OAuth

Date: 2026-10-02. Status: accepted. Spec: [sections 5.6, 6.2, 6.3](../superpowers/specs/2026-10-02-nibbl-design.md).

## Context
A pet needs a stable identity, but login adds friction before the first egg.

## Decision
- No OAuth, no login. It must work right after install.
- Identity = `machineHash` (sha256 of hardware UUID + "nibbl"; only the hash leaves the machine) + a server-issued pet token (only its hash is stored).
- Reinstalling on the same machine returns the same pet.
- Move between machines with `nibbl1:<serial>:<token>` (export/import).

## Why
- Login is too much activation energy for a toy.
- The server is the source of truth and `/p/:serial` is public proof, so no signatures are needed.

## Rejected alternatives
- GitHub OAuth Device Flow: friction.
- Claude account id: the mod API exposes none; the `$.session.authorize` handle only works for Anthropic hosts; `~/.claude.json` is undocumented.
- Ed25519 keypair + certificates: dropped for v1 as unnecessary complexity.

## Consequences
- Anyone holding the export code owns the pet; treat it as a secret.
- If `ioreg` or SHA-256 is unavailable in the runtime, fall back per spec section 10.
