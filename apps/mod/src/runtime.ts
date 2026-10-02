import type { EngineInterface, PluginOptions } from 'claude-code'

import { HOME_X } from './config'

export type Anim = { frame: number; petX: number; blink: boolean }
export type BandMount = { requestId: string; sceneId: string | null; hud: string }

// Module-level only for what may be lost on a hot reload (register runs again and starts fresh):
// options, the ticker, animation, the mounted band, in-flight guards and the queue write chain.
export const rt = {
  options: {} as PluginOptions,
  ticker: null as { cancel: () => void } | null,
  tzRead: false,
  anim: { frame: 0, petX: HOME_X, blink: false } as Anim,
  band: null as BandMount | null,
  lastBeat: 0,
  isHatching: false,
  isSyncing: false,
  queueChain: Promise.resolve() as Promise<unknown>,
}

// Runs network work after the current hook returns, so tool calls and turns never wait on it.
export const later = ($: EngineInterface, work: () => Promise<unknown>): void => {
  $.clock.after(0, () => {
    void work().catch(err => $.ui.log(`nibbl: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' }))
  })
}

// $.http.fetch has no timeout, so a bounded wait (session end) races the work against a timer.
export const withTimeout = <T>($: EngineInterface, ms: number, work: Promise<T>): Promise<T | 'timeout'> =>
  new Promise(resolve => {
    const timer = $.clock.after(ms, () => resolve('timeout'))
    work.then(
      value => {
        timer.cancel()
        resolve(value)
      },
      () => {
        timer.cancel()
        resolve('timeout')
      },
    )
  })
