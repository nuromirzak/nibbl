import { atom } from 'claude-code'

import type { NibblPetView } from '../types'
import { CALM } from './reactions'

// Session values the band draws from; writing one redraws its readers. Persisted parts live in $.store.
export const loadedAtom = atom({ plugin: 'nibbl', key: 'loaded' } as const, false)
export const petAtom = atom({ plugin: 'nibbl', key: 'pet' } as const, null as NibblPetView | null)
export const eggAtom = atom({ plugin: 'nibbl', key: 'eggTurns' } as const, 0)
export const hiddenAtom = atom({ plugin: 'nibbl', key: 'hidden' } as const, false)
export const reactAtom = atom({ plugin: 'nibbl', key: 'react' } as const, CALM)
export const tzAtom = atom({ plugin: 'nibbl', key: 'tzOffsetMin' } as const, 0)
