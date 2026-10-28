// The PluginState contract of the nibbl mod: every $.state value it reads or writes.
// Self-contained on purpose (no imports), as the engine requires of a contract.

export type NibblTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

// What the band draws: the server pet, or a spike pet still waiting for its first hatch call (serial null).
// Hearts are kept as "pets used in hour heartsHour", so the row refills by itself when the hour turns.
export type NibblPetView = {
  serial: number | null
  seed: number
  tier: NibblTier
  shiny: boolean
  genesis: boolean
  name: string
  label: string | null
  xp: number
  heartsHour: number
  heartsUsed: number
}

// A friend's pet visiting the scene (0.4.0): its look, and who it is for the status line.
export type NibblGuest = {
  seed: number
  tier: NibblTier
  shiny: boolean
  stage: 'baby' | 'teen' | 'adult'
  name: string | null
  from: number
}

// Zero-token reactions to real events. Every *Until/*Since/*At field is ms since the epoch, 0 = off.
export type NibblReaction = {
  bugs: number
  mood: 'idle' | 'happy' | 'sad'
  moodUntil: number
  heartUntil: number
  lootUntil: number
  boxUntil: number
  awaySince: number
  lastActiveAt: number
  // The visiting pet and when the visit ends (0 = none).
  guest: NibblGuest | null
  guestUntil: number
}

declare module 'claude-code' {
  interface PluginState {
    nibbl: {
      'v1.loaded': boolean
      'v1.pet': NibblPetView | null
      'v1.eggTurns': number
      'v1.hidden': boolean
      'v1.react': NibblReaction
      'v1.tzOffsetMin': number
      // Pets that synced in the last 24 h, from the server (null = not known yet).
      'v1.active': number | null
    }
  }
}
