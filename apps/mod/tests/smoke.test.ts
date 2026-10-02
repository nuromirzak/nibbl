// Runs against the built folder: `claude plugin test apps/mod/dist`.
import { expect, mock, test } from 'claude-code/testing'

type Raise = {
  session: { start: (e: unknown) => Promise<unknown> }
  command: { run: (e: { command: string; args: string }) => Promise<{ text?: string }> }
}

test('the /nibbl command is registered at session start and answers help', async ($, on) => {
  // Later tasks read the clock and the store on every command; nothing else is mocked here.
  mock.clock(on, { now: 0 })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await ($ as unknown as Raise).session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  const text = (await ($ as unknown as Raise).command.run({ command: 'nibbl', args: 'help' })).text ?? ''
  expect(text).toMatch(/\/nibbl export/)
  expect(text).toMatch(/\/nibbl import <code>/)
})
