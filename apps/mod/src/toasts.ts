// The toast queue (0.3.0): social news waits in the store and shows one toast per answered turn of
// the main loop, the most important first. Hatch and level-up toasts stay immediate and never queue.
import type { EngineInterface } from 'claude-code'

import { K, TOAST_QUEUE_MAX } from './config'

export type ToastKind = 'hatch' | 'evolution' | 'week' | 'achievement' | 'invite' | 'wave' | 'greeting' | 'note' | 'update'
export type QueuedToast = { kind: ToastKind; text: string }

// Highest priority first.
export const TOAST_PRIORITY: readonly ToastKind[] = ['hatch', 'evolution', 'week', 'achievement', 'invite', 'wave', 'greeting', 'note', 'update']

const isKind = (v: unknown): v is ToastKind => typeof v === 'string' && (TOAST_PRIORITY as readonly string[]).includes(v)

export const parseToastQueue = (v: unknown): QueuedToast[] => {
  if (!Array.isArray(v)) return []
  const out: QueuedToast[] = []
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue
    const { kind, text } = item as { kind?: unknown; text?: unknown }
    if (isKind(kind) && typeof text === 'string' && text.length > 0) out.push({ kind, text })
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

// The same text is never queued twice; past the cap the oldest item is dropped.
export const withToast = (items: readonly QueuedToast[], kind: ToastKind, text: string): QueuedToast[] =>
  items.some(t => t.text === text) ? [...items] : [...items, { kind, text }].slice(-TOAST_QUEUE_MAX)

export const loadToasts = async ($: EngineInterface): Promise<QueuedToast[]> => parseToastQueue(await $.store.get(K.toastQueue))

export const enqueue = async ($: EngineInterface, kind: ToastKind, text: string): Promise<void> => {
  await $.store.set(K.toastQueue, withToast(await loadToasts($), kind, text))
}

// Called on every answered turn of the main loop: shows at most one queued toast.
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
