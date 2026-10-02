// Copies this machine's Claude Code plugin API declarations into apps/mod/.types/ for tsc.
// The engine writes them when the plugin-authoring skill loads (under /private/tmp/claude-*/bundled-skills,
// a path that changes per Claude Code process). CLAUDE_CODE_TYPES names a file explicitly.
// With no declarations anywhere (clean machine, CI) it warns and exits 0; tsc then reports the gap itself.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, '..', '.types', 'claude-code.d.ts')
const ls = path => {
  try {
    return readdirSync(path)
  } catch {
    return []
  }
}

const found = []
if (process.env.CLAUDE_CODE_TYPES) found.push(process.env.CLAUDE_CODE_TYPES)
for (const root of new Set(['/private/tmp', tmpdir()])) {
  for (const user of ls(root).filter(name => name.startsWith('claude-'))) {
    const skills = join(root, user, 'bundled-skills')
    for (const version of ls(skills)) {
      for (const hash of ls(join(skills, version))) found.push(join(skills, version, hash, 'plugin-authoring', 'types', 'claude-code.d.ts'))
    }
  }
}
const [best] = found.filter(path => existsSync(path)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
if (best) {
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(best, target)
  console.log(`types: ${best}`)
} else if (existsSync(target)) {
  console.log('types: keeping the existing .types/claude-code.d.ts')
} else {
  console.warn('types: no claude-code.d.ts found, skipping. Load the plugin-authoring skill in Claude Code once, or set CLAUDE_CODE_TYPES.')
}
