# 0008 Art and rendering

Date: 2026-10-02. Status: accepted. Spec: [sections 3, 4, 5.2, 8](../superpowers/specs/2026-10-02-nibbl-design.md).

## Context
Pets must look identical in the terminal, on the landing page and in OG images, and be unique per genome.

## Decision
- Procedural pets from a shared TS generator (`@nibbl/core`). Integer-only math so pixels are identical across runtimes.
- Scene 32x16 (like the original Tamagotchi screen), pet up to 16x16. Palette Sweetie 16.
- Terminal render via half-blocks (`Raster`). One pixel-grid source; the render is chosen by terminal capability.
- Art is drawn by code. Opus 5.5 cannot generate images directly but draws precise pixel art via code.

## Why
One generator keeps every surface in sync and lets any pet be re-derived from its seed.

## Rejected alternatives
- Pokemon, anime or Claude-brand styles: DMCA and brand risk.
- Separate renderers per surface: they drift and break verification.
- Hand-drawn sprite sheets: do not scale to unique genomes.

## Consequences
- Determinism is tested by snapshot hashes.
- Higher-resolution renderers (Image) wait for v1.1.
