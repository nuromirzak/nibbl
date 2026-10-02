# 0015 Owner pet import

Date: 2026-10-02

## Context
The owner played the local-only spike mod before the backend existed and hatched Byte (common mochi ember, seed 4125214855, 290 XP). The owner wants to keep that pet and its progress when the real, synced mod ships.

## Decision
A one-off admin script (`apps/api/scripts/admin-import-pet.ts`) inserted Byte into D1 as serial 13, bound to the owner's Mac by `machineHash = sha256(IOPlatformUUID + "nibbl")`, with the spike's seed, tier, shiny, XP and hatch time. When the real mod calls `/api/hatch` on that Mac, the server finds the machine and returns Byte with a fresh token.

## Why
The owner's own pet in the owner's own game. Re-rolling would lose the attachment the product is built on.

## Rejected alternatives
- Let the real mod roll a new pet: loses Byte and 290 XP.
- Re-implement the spike roll on the server: pointless for one pet.

## Consequences
- Byte #13 bypassed the server roll. It is the only pet that did; the script is not exposed through the API.
- The real mod must compute `machineHash` with exactly this formula, or the owner gets a new egg.
