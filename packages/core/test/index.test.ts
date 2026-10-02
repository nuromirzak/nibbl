import { expect, it } from 'vitest'
import * as core from '../src/index'

it('exports the public API', () => {
  for (const name of [
    'mulberry32', 'SWEETIE', 'RAMPS', 'TIERS', 'tierFromRoll', 'shinyFromRoll', 'genome', 'genomeKey',
    'traitOdds', 'rarestTrait', 'firstUnique', 'drawPet', 'faceRow', 'drawScene', 'drawEgg', 'drawEggScene',
    'toCellPairs', 'gridHash', 'scoreEvents', 'heartsLeft', 'levelFromXp', 'xpToNext', 'stageForLevel',
  ]) {
    expect(core).toHaveProperty(name)
  }
})
