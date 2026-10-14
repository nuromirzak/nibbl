// The 0.2.0 social layer on top of the store: maker notes (offline), waves, rank and update notice
// arriving with /api/sync. Pure text and parsing live in notes.ts and social.ts.
import type { EngineInterface } from 'claude-code'

import { K, NOTE_GAP_MS, NOTE_MIN_TURNS, TOP_RANK, WAVES_KEPT } from './config'
import { NOTES, noteAt } from './notes'
import { displayName, type ServerPet } from './pet'
import { rt } from './runtime'
import { loadPet } from './store'
import {
  parseRank,
  parseSocial,
  parseWavesSeen,
  rankLine,
  rankMilestone,
  labelOf,
  updateLine,
  updateToast,
  waveToastText,
} from './social'
import { isNewer } from './version'

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const noteIndexOf = async ($: EngineInterface): Promise<number> => {
  const i = num(await $.store.get(K.noteIdx))
  return i !== null && Number.isInteger(i) && i >= 0 ? Math.min(i, NOTES.length) : 0
}

// Called after every answered turn of the main loop: the pet is hatched, the last note is 48 h old
// (or there was none) and this session has answered a few turns.
export const maybeNote = async ($: EngineInterface): Promise<void> => {
  if (rt.answered < NOTE_MIN_TURNS) return
  const pet = await loadPet($)
  if (!pet) return
  const idx = await noteIndexOf($)
  if (idx >= NOTES.length) return
  const now = await $.clock.now()
  const last = num(await $.store.get(K.noteAt))
  if (last !== null && now - last < NOTE_GAP_MS) return
  // Write first: a second session finishing a turn right now must not send the same note twice.
  await $.store.set(K.noteIdx, idx + 1)
  await $.store.set(K.noteAt, now)
  $.ui.toast(`✉ from the maker: ${noteAt(pet.seed, idx, displayName(pet.name), pet.serial)}`)
}

export const notesCommand = async ($: EngineInterface): Promise<string> => {
  const pet = await loadPet($)
  if (!pet) return 'Hatch the egg first. Notes from the maker start after that.'
  const idx = await noteIndexOf($)
  if (idx === 0) return 'No notes yet. One arrives now and then while you work, at most every 2 days.'
  const lines = Array.from({ length: idx }, (_, i) => `${i + 1}. ${noteAt(pet.seed, i, displayName(pet.name), pet.serial)}`)
  return [`Notes from the maker (${idx} of ${NOTES.length}):`, ...lines].join('\n')
}

// Applies the optional sync fields to the store and toasts. Called after the pet was saved.
export const applySocial = async ($: EngineInterface, pet: ServerPet, body: Record<string, unknown>, now: number): Promise<void> => {
  const social = parseSocial(body)
  const me = displayName(pet.name)

  const text = waveToastText(social.waves, me)
  if (text !== null) {
    const kept = [...social.waves.map(w => ({ ...w, at: now })), ...parseWavesSeen(await $.store.get(K.waves))].slice(0, WAVES_KEPT)
    await $.store.set(K.waves, kept)
    $.ui.toast(text)
  }

  if (social.rank) {
    await $.store.set(K.rank, social.rank)
    const best = num(await $.store.get(K.bestRank))
    const hit = rankMilestone(best, social.rank.pos)
    if (best === null || social.rank.pos < best) await $.store.set(K.bestRank, social.rank.pos)
    if (hit === 'first') $.ui.toast(`${me} is #1 on the board!`)
    else if (hit === 'top10') $.ui.toast(`${me} made the top ${TOP_RANK}!`)
  }

  if (social.latest !== null) {
    await $.store.set(K.latest, social.latest)
    if (isNewer(social.latest) && (await $.store.get(K.updateSeen)) !== social.latest) {
      await $.store.set(K.updateSeen, social.latest)
      $.ui.toast(updateToast(social.latest))
    }
  }
}

// Extra lines of /nibbl: last maker note, last wave, rank neighbour and the update hint.
export const socialStatsLines = async ($: EngineInterface, pet: ServerPet | null): Promise<string[]> => {
  const lines: string[] = []
  if (!pet) return lines
  const idx = await noteIndexOf($)
  if (idx > 0) lines.push(`last note: ${noteAt(pet.seed, idx - 1, displayName(pet.name), pet.serial)}`)
  const wave = parseWavesSeen(await $.store.get(K.waves))[0]
  if (wave) lines.push(`last wave: ${labelOf(wave.name, wave.from)} waved at you`)
  const rank = parseRank(await $.store.get(K.rank))
  if (rank) lines.push(rankLine(rank, pet.xp))
  if (isNewer(await $.store.get(K.latest))) lines.push(updateLine())
  return lines
}
