// Packs a built plugin directory into a zip and writes a URL-hostable marketplace.json.
// A URL marketplace downloads only marketplace.json, so the entry must be an absolute archive URL.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const arg = name => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
const fail = message => {
  console.error(`pack-plugin: ${message}`)
  process.exit(1)
}

const pluginDir = arg('plugin-dir')
const origin = arg('origin')
const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(arg('out') ?? join(here, '../../web/prototype'))

if (!pluginDir) fail('--plugin-dir is required')
if (!origin || !origin.startsWith('https://')) fail('--origin must be an https:// origin')
const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json')
if (!existsSync(manifestPath)) fail(`${manifestPath} not found`)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (!manifest.name || !manifest.version) fail('plugin.json needs name and version')

const fileName = `${manifest.name}-${manifest.version}.zip`
const zipPath = join(out, 'plugin', fileName)
mkdirSync(dirname(zipPath), { recursive: true })
rmSync(zipPath, { force: true })
// Allowlist, never the whole folder: the engine writes .claude-plugin/types/ into a dev plugin, and its
// claude-code-mcp types list the author's connected MCP servers. -X drops extra attributes, -r recurses.
const INCLUDE = ['.claude-plugin/plugin.json', 'hooks', 'types', 'assets', 'README.md'].filter(p => existsSync(join(pluginDir, p)))
execFileSync('zip', ['-X', '-r', '-q', zipPath, ...INCLUDE, '-x', '*.DS_Store', '*/tests/*', '*/node_modules/*'], { cwd: pluginDir })

const sha256 = createHash('sha256').update(readFileSync(zipPath)).digest('hex')
const url = `${origin.replace(/\/$/, '')}/plugin/${fileName}`
const marketplace = {
  name: 'nibbl',
  description: 'Nibbl, a tiny pixel pet that nibbles your bugs',
  owner: { name: 'nibbl' },
  plugins: [{ name: manifest.name, description: manifest.description ?? 'Nibbl pixel pet', source: { source: 'archive', url, sha256 } }],
}
writeFileSync(join(out, 'marketplace.json'), `${JSON.stringify(marketplace, null, 2)}\n`)

// --mirror <dir>: the same files, unpacked and committed, for directories that scan a repo for hooks/hooks.json.
const mirror = arg('mirror')
if (mirror) {
  rmSync(resolve(mirror), { recursive: true, force: true })
  execFileSync('unzip', ['-q', zipPath, '-d', resolve(mirror)])
}
console.log(JSON.stringify({ zip: zipPath, sha256, url }))
