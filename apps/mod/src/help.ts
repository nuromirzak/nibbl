export const COMMAND_DESCRIPTION = 'Your nibbl: stats, pet, name, label, odds, export, import, hide'
export const COMMAND_HINT = '[pet | name <text> | label <text> | odds | export | import <code> | hide]'

export const HELP = [
  '/nibbl                 stats, card and leaderboard links',
  '/nibbl pet             pet it (or ctrl+x tab, then p, on the band)',
  '/nibbl name <text>     rename your pet (once a week, up to 16 characters)',
  '/nibbl label <text>    set a label (up to 24 characters); /nibbl label alone clears it',
  "/nibbl odds            hatch odds and your pet's traits",
  '/nibbl export          show the secret code that moves your pet',
  '/nibbl import <code>   move a pet to this machine',
  '/nibbl hide            hide or show the band',
].join('\n')

export const splitArgs = (args: string): { verb: string; rest: string } => {
  const trimmed = args.trim()
  const space = trimmed.search(/\s/)
  if (space < 0) return { verb: trimmed.toLowerCase(), rest: '' }
  return { verb: trimmed.slice(0, space).toLowerCase(), rest: trimmed.slice(space + 1).trim() }
}
