import { atom } from 'claude-code'

import type { NibblPetView } from '../types'
import { CALM } from './reactions'

// Session values the band draws from; writing one redraws its readers. Persisted parts live in $.store.
// Keys are v1-prefixed: session state survives a hot reload, and the spike used the bare names
// (loaded, pet, eggTurns) with other shapes, so reading those back would draw a stale or broken pet.
export const loadedAtom = atom({ plugin: 'nibbl', key: 'v1.loaded' } as const, false)
export const petAtom = atom({ plugin: 'nibbl', key: 'v1.pet' } as const, null as NibblPetView | null)
export const eggAtom = atom({ plugin: 'nibbl', key: 'v1.eggTurns' } as const, 0)
export const hiddenAtom = atom({ plugin: 'nibbl', key: 'v1.hidden' } as const, false)
export const reactAtom = atom({ plugin: 'nibbl', key: 'v1.react' } as const, CALM)
export const tzAtom = atom({ plugin: 'nibbl', key: 'v1.tzOffsetMin' } as const, 0)
