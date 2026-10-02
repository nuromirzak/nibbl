// Bundles the spike (plus @nibbl/core) into the dev-mods folder the session hot-reloads.
import { build } from 'esbuild'
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out =
  process.env.NIBBL_MOD_DIR ??
  '/Users/nurmukhammedomirzak/.claude/dev-mods/0c9ad5f8-98e2-4e6c-8f79-a1af535f661f/nibbl'

const common = {
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  external: ['claude-code'],
  target: 'es2022',
  logLevel: 'info',
}

mkdirSync(join(out, 'hooks'), { recursive: true })
mkdirSync(join(out, '.claude-plugin'), { recursive: true })
mkdirSync(join(out, 'types'), { recursive: true })
mkdirSync(join(out, 'tests'), { recursive: true })

// The engine wants `register` declared as an exported binding at the top level, while
// esbuild emits `var register = ...` plus a trailing `export { register }`: rewrite that.
const hooks = await build({ ...common, write: false, entryPoints: [join(here, 'src/register.tsx')], outfile: join(out, 'hooks/register.js') })
let source = hooks.outputFiles[0].text
// The engine follows `$` only into functions declared at the top level as a function or
// a const bound to one, so every top-level `var` (all single-assignment) becomes `const`.
source = source.replace(/^var /gm, 'const ')
source = source.replace(/^const register = /m, 'export const register = ').replace(/\nexport \{\n {2}register\n\};\n?$/, '\n')
if (!source.includes('export const register = ') || /export \{/.test(source)) throw new Error('could not rewrite the register export')
if (/^(let|var) /m.test(source)) throw new Error('top-level let/var left in the bundle')
writeFileSync(join(out, 'hooks/register.js'), source)
await build({ ...common, entryPoints: [join(here, 'src/scene-client.tsx')], outfile: join(out, 'hooks/scene-client.js') })

writeFileSync(
  join(out, '.claude-plugin/plugin.json'),
  JSON.stringify(
    {
      name: 'nibbl',
      version: '0.0.1-spike',
      description: 'Nibbl spike: a real @nibbl/core pet above the prompt, local only (no server)',
      types: './types/index.d.ts',
    },
    null,
    2,
  ) + '\n',
)
writeFileSync(join(out, 'hooks/hooks.json'), JSON.stringify({ modules: ['./register.js'] }) + '\n')
cpSync(join(here, 'types/index.d.ts'), join(out, 'types/index.d.ts'))
cpSync(join(here, 'tests'), join(out, 'tests'), { recursive: true })
console.log(`built into ${out}`)
