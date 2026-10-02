// The PluginState contract of the nibbl spike mod: every atom it reads or writes.
// Self-contained on purpose (no imports), as the engine requires of a contract.

export type NibblTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export type NibblMood = 'idle' | 'happy' | 'sad'

// How the band draws the 32x16 scene: one Raster (default), Text runs drawn by
// the hooks module, or Text runs drawn by a Client module that also takes clicks.
export type NibblSceneMode = 'raster' | 'text' | 'client'

export type NibblPet = {
  seed: number
  tier: NibblTier
  shiny: boolean
  hatchedAt: number
  xp: number
  name: string
}

export type NibblEventType = 'pet' | 'turn' | 'check_pass' | 'commit' | 'error'

// Hour index (as a string key, JSON style) to per-event counts in that hour.
export type NibblWindows = Record<string, Partial<Record<NibblEventType, number>>>

declare module 'claude-code' {
  interface PluginState {
    nibbl: {
      loaded: boolean
      frame: number
      hidden: boolean
      working: boolean
      pet: NibblPet | null
      eggTurns: number
      mood: NibblMood
      moodUntil: number
      bugs: number
      heartUntil: number
      lastActiveAt: number
      windows: NibblWindows
      petX: number
      dir: number
      blink: boolean
      mode: NibblSceneMode
    }
  }
}
