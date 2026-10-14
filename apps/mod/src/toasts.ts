// The toast queue (0.3.0): social news waits in the store and shows one toast per answered turn of
// the main loop, the most important first. Hatch and level-up toasts stay immediate and never queue.
import type { EngineInterface } from 'claude-code'

import { K, TOAST_QUEUE_MAX } from './config'

export type ToastKind = 'hatch' | 'evolution' | 'week' | 'achievement' | 'invite' | 'wave' | 'greeting' | 'note' | 'update'
// Achievement items keep their ids (and the pet's name), so later unlocks merge into the same item.
export type QueuedToast = { kind: ToastKind; text: string; ids?: string[]; me?: string }

// Highest priority first.
export const TOAST_PRIORITY: readonly ToastKind[] = ['hatch', 'evolution', 'week', 'achievement', 'invite', 'wave', 'greeting', 'note', 'update']

const isKind = (v: unknown): v is ToastKind => typeof v === 'string' && (TOAST_PRIORITY as readonly string[]).includes(v)

export const parseToastQueue = (v: unknown): QueuedToast[] => {
  if (!Array.isArray(v)) return []
  const out: QueuedToast[] = []
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue
    const { kind, text, ids, me } = item as { kind?: unknown; text?: unknown; ids?: unknown; me?: unknown }
    if (!isKind(kind) || typeof text !== 'string' || text.length === 0) continue
    const cleanIds = Array.isArray(ids) ? ids.filter((i): i is string => typeof i === 'string') : []
    out.push(kind === 'achievement' && cleanIds.length > 0 && typeof me === 'string' ? { kind, text, ids: cleanIds, me } : { kind, text })
  }
  return out
}

// Index of the item to show next: best priority, oldest first among equals. -1 when empty.
export const nextIndex = (items: readonly QueuedToast[]): number => {
  let best = -1
  for (let i = 0; i < items.length; i++) {
    if (best < 0 || TOAST_PRIORITY.indexOf(items[i]!.kind) < TOAST_PRIORITY.indexOf(items[best]!.kind)) best = i
  }
  return best
}

// Past the cap the lowest-priority item goes, the oldest among equals: a flood of notes never pushes out news.
const capped = (items: QueuedToast[]): QueuedToast[] => {
  const out = [...items]
  while (out.length > TOAST_QUEUE_MAX) {
    let worst = 0
    for (let i = 1; i < out.length; i++) if (TOAST_PRIORITY.indexOf(out[i]!.kind) > TOAST_PRIORITY.indexOf(out[worst]!.kind)) worst = i
    out.splice(worst, 1)
  }
  return out
}

// The same text is never queued twice.
export const withToast = (items: readonly QueuedToast[], kind: ToastKind, text: string): QueuedToast[] =>
  items.some(t => t.text === text) ? [...items] : capped([...items, { kind, text }])

// Unlocks collapse into one queued item: ids join, and the text is rebuilt from the full list.
export const withAchievements = (items: readonly QueuedToast[], ids: readonly string[], me: string, textOf: (ids: readonly string[], me: string) => string | null): QueuedToast[] => {
  const at = items.findIndex(t => t.kind === 'achievement' && t.ids !== undefined)
  const merged = [...new Set([...(at >= 0 ? items[at]!.ids! : []), ...ids])]
  const text = textOf(merged, me)
  if (text === null) return [...items]
  const next: QueuedToast = { kind: 'achievement', text, ids: merged, me }
  if (at < 0) return capped([...items, next])
  return items.map((t, i) => (i === at ? next : t))
}

export const loadToasts = async ($: EngineInterface): Promise<QueuedToast[]> => parseToastQueue(await $.store.get(K.toastQueue))

export const enqueue = async ($: EngineInterface, kind: ToastKind, text: string): Promise<void> => {
  await $.store.set(K.toastQueue, withToast(await loadToasts($), kind, text))
}

// Called on every answered turn of the main loop: shows at most one queued toast.
export const enqueueAchievements = async ($: EngineInterface, ids: readonly string[], me: string, textOf: (ids: readonly string[], me: string) => string | null): Promise<void> => {
  await $.store.set(K.toastQueue, withAchievements(await loadToasts($), ids, me, textOf))
}

export const flushOne = async ($: EngineInterface): Promise<void> => {
  const items = await loadToasts($)
  const i = nextIndex(items)
  if (i < 0) return
  const [shown] = items.splice(i, 1)
  // Write first: a second session finishing a turn right now must not show the same toast.
  if (items.length === 0) await $.store.delete(K.toastQueue)
  else await $.store.set(K.toastQueue, items)
  $.ui.toast(shown!.text)
}
