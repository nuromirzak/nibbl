# 0010 Code and distribution

Date: 2026-10-02. Status: accepted. Spec: [section 9](../superpowers/specs/2026-10-02-nibbl-design.md).

## Context
The mod runs unsandboxed with network access on user machines, so trust matters. The server and generator are the product.

## Decision
- Private monorepo.
- Publish a readable (not obfuscated) esbuild bundle to a public marketplace repo, license "All rights reserved".
- Install: `/plugin marketplace add <org>/nibbl`, then `/plugin install nibbl@nibbl`.

## Why
Precedent: Figma and Slack plugins are thin clients with closed servers; the Vercel plugin is Apache-2.0 source. A readable bundle lets users audit what leaves the machine while keeping the repo private.

## Rejected alternatives
- Obfuscation: looks like malware for an unsandboxed, networked mod.
- Fully open source: gives away the generator and dedupe logic with little upside for v1.

## Consequences
- The README must state what leaves the machine: machineHash, serial, token, event counts.
- Org name is still open (`nibbl-dev` assumed).
