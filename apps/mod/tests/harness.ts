// Shared world for the plugin tests: a mocked clock, store, machine and nibbl server.
// Tests run against the built folder (claude plugin test apps/mod/dist), so nothing here imports src/.
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

export const HOUR = 3_600_000
// 2026-10-02 09:00 UTC, 14:00 at +05:00: a quiet daytime hour.
export const START = Date.UTC(2026, 9, 2, 9, 0)
export const UUID = '00000000-1111-2222-3333-444444444444'
// sha256(id + "nibbl") per platform, computed with node:crypto (test-unit/identity.test.ts checks them).
export const MACHINE_HASH = 'd4d91bc229462201b2fcabce098ea6c0b87d96dc1cc89d9e3a5e595ae4b320eb'
export const LINUX_ID = '0123456789abcdef0123456789abcdef'
export const LINUX_HASH = 'a61668ce28a623107e26779f93ab8f0940dc9fc0455c8e8c0f81759923d6a369'
export const WINDOWS_GUID = '8f2b1c3d-0000-4e5f-9a8b-1234567890ab'
export const WINDOWS_HASH = '65b5f942882e4830e59f1402404209647b2896e3c2d0d6b2e15bc7ecf586768e'
export const TOKEN_A = 'A'.repeat(43)
export const TOKEN_B = 'B'.repeat(43)
export const IMPORT_TOKEN = 'C'.repeat(43)

export type Call = { url: string; path: string; body: Record<string, unknown>; headers: Record<string, string>; raw: string }
export type Reply = { status: number; body: unknown } | { status: number; text: string } | 'offline'

export const owner = (over: Record<string, unknown> = {}) => ({
  serial: 42,
  seed: 123456,
  tier: 'rare',
  shiny: false,
  genesis: true,
  hatchedAt: START,
  name: null,
  label: null,
  xp: 0,
  level: 1,
  ...over,
})

// A store holding a hatched, freshly synced pet #42, in the shape the mod keeps under v1.pet.
export const hatchedStore = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  'v1.pet': { ...owner(), token: TOKEN_A, heartsHour: Math.floor(START / HOUR), heartsUsed: 0, lastSyncAt: START, ...over },
})

export const BAND = (maxRows = 12, bodyColumns = 100) => ({
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
})

const XP: Record<string, number> = { turn: 3, check_pass: 2, commit: 2, pet: 2 }

export type HarnessOptions = {
  store?: Record<string, unknown>
  now?: number
  sessionId?: string
  machine?: 'mac' | 'linux' | 'windows' | 'none'
  utcOffset?: string
  pet?: Record<string, unknown>
  env?: Record<string, string>
}

export const harness = (on: On, opts: HarnessOptions = {}) => {
  const clock = mock.clock(on, { now: opts.now ?? START })
  mock.store(on, opts.store ?? {})
  mock.env(on, opts.env ?? {})
  const sessionId = opts.sessionId ?? 'sess-a'
  const machine = opts.machine ?? 'mac'
  const pet = owner(opts.pet)
  const server = {
    pet,
    xp: Number(pet.xp),
    token: TOKEN_A,
    hatches: 0,
    name: (pet.name ?? null) as string | null,
    label: (pet.label ?? null) as string | null,
  }
  const net = { offline: false }
  const toasts: string[] = []
  const calls: Call[] = []
  const blits: { requestId: string; key: string; cells?: string }[] = []
  const once: { path: string; reply: Reply }[] = []

  // The fake nibbl server: hatch rotates the token, sync/name check it, import knows one code.
  const answerFor = (call: Call): Reply => {
    const i = once.findIndex(o => o.path === call.path)
    if (i >= 0) return once.splice(i, 1)[0]!.reply
    if (net.offline) return 'offline'
    const b = call.body
    const isAuthed = b.serial === server.pet.serial && b.token === server.token
    if (call.path === '/api/hatch') {
      server.hatches++
      server.token = server.hatches % 2 === 1 ? TOKEN_A : TOKEN_B
      return { status: 200, body: { ...server.pet, name: server.name, label: server.label, xp: server.xp, token: server.token } }
    }
    if (call.path === '/api/sync') {
      if (!isAuthed) return { status: 401, body: { error: 'unauthorized' } }
      server.xp += (b.events as { type: string }[]).reduce((sum, e) => sum + (XP[e.type] ?? 0), 0)
      return { status: 200, body: { xp: server.xp, level: 1, heartsLeft: 5 } }
    }
    if (call.path === '/api/name') {
      if (!isAuthed) return { status: 401, body: { error: 'unauthorized' } }
      if (typeof b.name === 'string') server.name = b.name
      if (b.label === '') server.label = null
      else if (typeof b.label === 'string') server.label = b.label
      return { status: 200, body: { name: server.name, label: server.label } }
    }
    if (call.path === '/api/import') {
      if (b.serial !== 99 || b.token !== IMPORT_TOKEN) return { status: 401, body: { error: 'unauthorized' } }
      return { status: 200, body: owner({ serial: 99, name: 'Pixel', tier: 'epic', xp: 500, level: 9 }) }
    }
    return { status: 404, body: { error: 'not_found' } }
  }

  on('http.fetch', ($, e) => {
    const raw = e.init?.body ?? ''
    const call: Call = {
      url: e.url,
      path: new URL(e.url).pathname,
      body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
      headers: e.init?.headers ?? {},
      raw,
    }
    calls.push(call)
    const reply = answerFor(call)
    if (reply === 'offline') return { deny: 'getaddrinfo ENOTFOUND getnibbl.pages.dev' }
    const text = 'text' in reply ? reply.text : JSON.stringify(reply.body)
    return { value: { status: reply.status, ok: reply.status >= 200 && reply.status < 300, headers: { 'content-type': 'application/json' }, text } }
  })

  const ran = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('process.run', ($, e) => {
    const cmd = e.argv[0]
    if (cmd === 'date') return ran(`${opts.utcOffset ?? '+0500'}\n`)
    if (cmd === 'ioreg' && machine === 'mac') return ran(`+-o J314sAP  <class IOPlatformExpertDevice>\n    {\n      "IOPlatformUUID" = "${UUID}"\n    }\n`)
    if (cmd === 'reg' && machine === 'windows') return ran(`\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    ${WINDOWS_GUID}\r\n\r\n`)
    return { deny: `${cmd}: command not found` }
  })
  on('fs.read', ($, e) => (machine === 'linux' && e.path === '/etc/machine-id' ? { value: `${LINUX_ID}\n` } : { deny: `ENOENT: ${e.path}` }))
  on('session.id', () => ({ value: sessionId }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.blit', ($, e) => {
    blits.push(e as { requestId: string; key: string; cells?: string })
    return { value: {} }
  })
  on('tool.call', ($, e) =>
    String((e as { command?: string }).command ?? '').includes('fail') ? { result: 'boom', text: 'boom', isError: true as const } : { result: 'ok', text: 'ok' },
  )
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: ['engine draws'] })
  })

  return {
    clock,
    toasts,
    calls,
    blits,
    server,
    net,
    respondOnce: (path: string, reply: Reply) => {
      once.push({ path, reply })
    },
    syncs: () => calls.filter(c => c.path === '/api/sync'),
    hatches: () => calls.filter(c => c.path === '/api/hatch'),
  }
}

type Raise = {
  session: { start: (e: unknown) => Promise<unknown>; end: (e: unknown) => Promise<unknown> }
  turn: { start: (e: unknown) => Promise<unknown>; complete: (e: unknown) => Promise<unknown> }
  tool: { call: (e: unknown) => Promise<unknown> }
  command: { run: (e: { command: string; args: string }) => Promise<{ text?: string }> }
}
const raise = ($: unknown) => $ as Raise
let turnNo = 0

export const start = async ($: unknown) => {
  await raise($).session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
}
export const end = async ($: unknown) => {
  await raise($).session.end({ reason: 'prompt_input_exit', sessionId: 'sess-a', resume: { id: 'sess-a' } })
}
// The prompt mentions a secret path on purpose: no payload may ever contain it.
export const turnStart = async ($: unknown) => {
  turnNo++
  await raise($).turn.start({ text: 'please fix the secret thing in /Users/me/secret', turnId: `t${turnNo}` })
}
export const turnEnd = async ($: unknown, reason = 'answer', agentId?: string) => {
  await raise($).turn.complete({ answer: 'done', durationMs: 10, isAborted: false, turnId: `t${turnNo}`, reason, ...(agentId === undefined ? {} : { agentId }) })
}
export const answer = async ($: unknown) => {
  await turnStart($)
  await turnEnd($)
}
export const subagentAnswer = async ($: unknown) => {
  await turnEnd($, 'answer', 'sub-1')
}
export const bash = async ($: unknown, command: string) => {
  await raise($).tool.call({ tool: 'Bash', command })
}
export const nibbl = async ($: unknown, args = '') => (await raise($).command.run({ command: 'nibbl', args })).text ?? ''
