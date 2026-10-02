import { describe, expect, it } from 'vitest'
import type { Expression, Stage } from '../src/draw'
import { drawPet } from '../src/draw'
import { drawEgg, drawEggScene } from '../src/egg'
import { genome } from '../src/genome'
import { gridHash } from '../src/grid'
import type { Tier } from '../src/odds'
import { drawScene } from '../src/scene'

// Inline literals on purpose: a changed value means existing users' pets changed. Update a
// pin only for a deliberate, announced art or genome change.
describe('determinism pins', () => {
  it('draws the same pet pixels on every runtime', () => {
    const pets: [number, Tier, boolean, Stage, Expression, string][] = [
      [6, 'common', false, 'adult', 'idle', '0285b019'], // mochi
      [1, 'uncommon', false, 'teen', 'happy', '2373193c'], // critter
      [2, 'rare', false, 'baby', 'blink', '26fdfddc'], // sprout
      [6, 'epic', false, 'teen', 'surprised', '8c3ae866'], // mochi, bow
      [1, 'legendary', false, 'adult', 'sad', 'e1e0ae9b'], // critter, crown
      [2, 'common', true, 'adult', 'sleep', 'cf649ad3'], // sprout, shiny
      [0xffffffff, 'legendary', true, 'baby', 'sad', 'aef51613'], // mochi, shiny legendary
    ]
    for (const [seed, tier, shiny, stage, expression, hash] of pets) {
      expect(gridHash(drawPet(genome(seed, tier, shiny), stage, expression)), `${seed}/${tier}/${stage}`).toBe(hash)
    }
  })

  it('draws the same scenes and eggs', () => {
    expect(gridHash(drawScene(genome(42, 'legendary', false), { frame: 1, heart: true, bugs: 2 }))).toBe('472dbdcf')
    expect(gridHash(drawScene(genome(7, 'common', true), { petX: 10, lift: 2, stage: 'teen', expression: 'happy' }))).toBe('09588eb1')
    expect(gridHash(drawEgg(0))).toBe('07b9e0c9')
    expect(gridHash(drawEggScene(3, 1))).toBe('325279d9')
  })

  it('rolls the same genomes', () => {
    expect(JSON.stringify(genome(1, 'common', false))).toBe(
      '{"seed":1,"tier":"common","shiny":false,"family":"critter","halfW":6,"halfH":7,"ramp":"ocean","pattern":"none","belly":true,"eyes":"dot","blush":true,"head":"none","hat":"none","mark":{"motif":"swirl","spot":"forehead"},"patternVariant":14}',
    )
    expect(JSON.stringify(genome(2026, 'legendary', true))).toBe(
      '{"seed":2026,"tier":"legendary","shiny":true,"family":"critter","halfW":6,"halfH":6,"ramp":"ocean","pattern":"stars","belly":false,"eyes":"dot","blush":false,"head":"none","hat":"crown","mark":{"motif":"heart","spot":"belly"},"patternVariant":15}',
    )
  })
})
