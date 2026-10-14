// The 0.2.0 social layer on top of the store: maker notes (offline), waves, rank and update notice
// arriving with /api/sync. Pure text and parsing live in notes.ts and social.ts.
import { read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { apiBase } from './api'
import { K, NOTE_GAP_MS, NOTE_MIN_TURNS, TOP_RANK, WAVES_KEPT } from './config'
import { greetingFor, localDay } from './greetings'
import { NOTES, noteAt, nextNote, shownNotes, totalNotes } from './notes'
import { displayName, type ServerPet } from './pet'
import { rt } from './runtime'
import { tzAtom } from './state'
import { loadPet } from './store'
import { enqueue, loadToasts } from './toasts'
import {
  achievementToastText,
  inviteToastText,
  weekToastText,
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
  const idx = nextNote(pet, await noteIndexOf($))
  if (idx >= NOTES.length) return
  const now = await $.clock.now()
  const last = num(await $.store.get(K.noteAt))
  if (last !== null && now - last < NOTE_GAP_MS) return
  // Write first: a second session finishing a turn right now must not send the same note twice.
  await $.store.set(K.noteIdx, idx + 1)
  await $.store.set(K.noteAt, now)
  await enqueue($, 'note', `✉ from the maker: ${noteAt(pet.seed, idx, displayName(pet.name), pet.serial)}`)
}

// The first answered turn of the local day greets a hatched pet (never the egg, and the hatch day
// itself is marked by hatch.ts). The greeting queues like any other toast.
export const maybeGreet = async ($: EngineInterface): Promise<void> => {
  const pet = await loadPet($)
  if (!pet) return
  const now = await $.clock.now()
  const tz = await read($, tzAtom)
  const day = localDay(now, tz)
  if (num(await $.store.get(K.greetDay)) === day) return
  await $.store.set(K.greetDay, day)
  await enqueue($, 'greeting', greetingFor(pet.seed, now, tz, displayName(pet.name)))
}

export const notesCommand = async ($: EngineInterface): Promise<string> => {
  const pet = await loadPet($)
  if (!pet) return 'Hatch the egg first. Notes from the maker start after that.'
  const idx = await noteIndexOf($)
  if (idx === 0) return 'No notes yet. One arrives now and then while you work, at most every 2 days.'
  const shown = shownNotes(pet, idx)
  const lines = shown.map((i, n) => `${n + 1}. ${noteAt(pet.seed, i, displayName(pet.name), pet.serial)}`)
  return [`Notes from the maker (${shown.length} of ${totalNotes(pet)}):`, ...lines].join('\n')
}

// Applies the optional sync fields to the store and toasts. Called after the pet was saved.
export const applySocial = async ($: EngineInterface, pet: ServerPet, body: Record<string, unknown>, now: number): Promise<void> => {
  const social = parseSocial(body)
  const me = displayName(pet.name)

  const won = social.weekWin
  if (won) await enqueue($, 'week', weekToastText(me, await apiBase($)))
  const unlocked = achievementToastText(social.unlocked, me)
  if (unlocked !== null) await enqueue($, 'achievement', unlocked)
  const invited = inviteToastText(social.invites)
  if (invited !== null) await enqueue($, 'invite', invited)

  const text = waveToastText(social.waves, me)
  if (text !== null) {
    const kept = [...social.waves.map(w => ({ ...w, at: now })), ...parseWavesSeen(await $.store.get(K.waves))].slice(0, WAVES_KEPT)
    await $.store.set(K.waves, kept)
    await enqueue($, 'wave', text)
  }

  if (social.rank) {
    await $.store.set(K.rank, social.rank)
    await $.store.set(K.rankAt, now)
    const best = num(await $.store.get(K.bestRank))
    if (best === null || social.rank.pos < best) await $.store.set(K.bestRank, social.rank.pos)
    // The first observation only seeds the best rank: a pet that already sits in the top 10 is not news.
    const hit = best === null ? null : rankMilestone(best, social.rank.pos)
    if (hit === 'first') await enqueue($, 'wave', `${me} is #1 on the board!`)
    else if (hit === 'top10') await enqueue($, 'wave', `${me} made the top ${TOP_RANK}!`)
  } else if (body.rank === null) {
    // A hidden pet has no rank; remember that we asked, and drop a stale line.
    await $.store.delete(K.rank)
    await $.store.set(K.rankAt, now)
  }

  if (social.latest !== null) {
    await $.store.set(K.latest, social.latest)
    if (isNewer(social.latest) && (await $.store.get(K.updateSeen)) !== social.latest) {
      await $.store.set(K.updateSeen, social.latest)
      await enqueue($, 'update', updateToast(social.latest))
    }
  }
}

// Extra lines of /nibbl: last maker note, last wave, rank neighbour and the update hint.
export const socialStatsLines = async ($: EngineInterface, pet: ServerPet | null): Promise<string[]> => {
  const lines: string[] = []
  if (!pet) return lines
  const idx = await noteIndexOf($)
  const last = shownNotes(pet, idx).at(-1)
  if (last !== undefined) lines.push(`last note: ${noteAt(pet.seed, last, displayName(pet.name), pet.serial)}`)
  const wave = parseWavesSeen(await $.store.get(K.waves))[0]
  if (wave) lines.push(`last wave: ${labelOf(wave.name, wave.from)} waved at you`)
  const rank = parseRank(await $.store.get(K.rank))
  if (rank) lines.push(rankLine(rank, pet.xp))
  if (isNewer(await $.store.get(K.latest))) lines.push(updateLine())
  const waiting = (await loadToasts($)).length
  if (waiting > 0) lines.push(`news waiting: ${waiting} (one shows after each answered turn)`)
  return lines
}
