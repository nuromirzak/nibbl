import type { Register } from 'claude-code'

import { COMMAND_DESCRIPTION, COMMAND_HINT, HELP } from './help'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'nibbl', description: COMMAND_DESCRIPTION, argumentHint: COMMAND_HINT })
    return next(e)
  })

  on('command.run', { command: 'nibbl' }, async () => ({ text: HELP }))
}
