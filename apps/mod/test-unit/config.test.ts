import { describe, expect, it } from 'vitest'
import { CHECK_COMMAND, COMMIT_COMMAND } from '../src/config'
import { splitArgs } from '../src/help'

describe('CHECK_COMMAND', () => {
  it.each([
    'pnpm test',
    'pnpm vitest run',
    'npx tsc -p .',
    'npm run test:unit',
    'pnpm -C apps/api test',
    'cargo build --release',
    'go test ./...',
    'make lint',
    'pytest -q',
    './node_modules/.bin/tsc',
    'npm test && git status',
  ])('counts %s as a check', command => expect(CHECK_COMMAND.test(command)).toBe(true))

  it.each(['cat test.txt', 'ls build/', 'rm -rf dist', 'eslint .', 'echo testing', 'vim latest.md'])('ignores %s', command =>
    expect(CHECK_COMMAND.test(command)).toBe(false),
  )
})

describe('COMMIT_COMMAND', () => {
  it.each(['git commit -m wip', 'git -C apps/api commit -m x', 'git --no-pager commit --amend', 'git add . && git commit -m x', 'git -c user.name=x commit'])(
    'counts %s as a commit',
    command => expect(COMMIT_COMMAND.test(command)).toBe(true),
  )

  it.each(['git log --grep commit', 'git commit-tree abc', 'git status', 'echo commit'])('ignores %s', command =>
    expect(COMMIT_COMMAND.test(command)).toBe(false),
  )
})

describe('splitArgs', () => {
  it('splits the verb (lowercased) from the rest', () => {
    expect(splitArgs('')).toEqual({ verb: '', rest: '' })
    expect(splitArgs('  odds ')).toEqual({ verb: 'odds', rest: '' })
    expect(splitArgs('  Name  Pixel the Great ')).toEqual({ verb: 'name', rest: 'Pixel the Great' })
    expect(splitArgs('label')).toEqual({ verb: 'label', rest: '' })
  })
})
