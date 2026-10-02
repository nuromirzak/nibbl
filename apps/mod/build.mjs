// Bundles the mod (plus @nibbl/core) into apps/mod/dist, the plugin folder that ships.
import { build } from 'esbuild'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = process.env.NIBBL_MOD_DIR ?? join(here, 'dist')
const VERSION = '0.1.0'

// A clean folder every time, so nothing the engine laid into a loaded dev copy (.claude-plugin/types) survives.
rmSync(out, { recursive: true, force: true })
for (const dir of ['hooks', '.claude-plugin', 'types', 'tests']) mkdirSync(join(out, dir), { recursive: true })

const hooks = await build({
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  external: ['claude-code'],
  target: 'es2022',
  logLevel: 'info',
  write: false,
  entryPoints: [join(here, 'src/register.tsx')],
  outfile: join(out, 'hooks/register.js'),
})
let source = hooks.outputFiles[0].text
// The engine follows `$` only into functions declared at the top level as a function or a const
// bound to one, so every top-level `var` (all single-assignment) becomes `const`.
source = source.replace(/^var /gm, 'const ')
// The engine wants `register` as an exported binding; esbuild emits `export { register }`.
source = source.replace(/^const register = /m, 'export const register = ').replace(/\nexport \{\n {2}register\n\};\n?$/, '\n')
if (!source.includes('export const register = ') || /export \{/.test(source)) throw new Error('could not rewrite the register export')
if (/^(let|var) /m.test(source)) throw new Error('top-level let/var left in the bundle')
writeFileSync(join(out, 'hooks/register.js'), source)

const manifest = {
  name: 'nibbl',
  version: VERSION,
  description: 'Nibbl: a tiny pixel pet above your prompt that nibbles your bugs',
  author: { name: 'nibbl' },
  homepage: 'https://getnibbl.pages.dev',
  license: 'MIT',
  types: './types/index.d.ts',
  userConfig: {
    apiBase: {
      type: 'string',
      title: 'Nibbl server',
      description: 'Where your pet syncs. Keep the default; http://localhost:8787 for local testing.',
      default: 'https://getnibbl.pages.dev',
    },
  },
}
writeFileSync(join(out, '.claude-plugin/plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`)
writeFileSync(join(out, 'hooks/hooks.json'), `${JSON.stringify({ modules: ['./register.js'] })}\n`)
cpSync(join(here, 'types/index.d.ts'), join(out, 'types/index.d.ts'))
cpSync(join(here, 'tests'), join(out, 'tests'), { recursive: true })
cpSync(join(here, 'README.md'), join(out, 'README.md'))
if (existsSync(join(out, '.claude-plugin/types'))) throw new Error('engine-generated types in dist')
console.log(`built into ${out}`)
