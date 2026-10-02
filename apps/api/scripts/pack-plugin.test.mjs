import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const script = new URL('./pack-plugin.mjs', import.meta.url).pathname

const fakePlugin = () => {
  const dir = mkdtempSync(join(tmpdir(), 'nibbl-plugin-'))
  mkdirSync(join(dir, '.claude-plugin'))
  mkdirSync(join(dir, 'hooks'))
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'nibbl', version: '0.1.0', description: 'test' }))
  writeFileSync(join(dir, 'hooks', 'hooks.json'), '{ "modules": ["./register.js"] }')
  writeFileSync(join(dir, 'hooks', 'register.js'), 'export const register = () => {}\n')
  return dir
}

test('packs a zip and writes a URL-safe marketplace.json pinned by sha256', () => {
  const out = mkdtempSync(join(tmpdir(), 'nibbl-assets-'))
  const printed = JSON.parse(
    execFileSync('node', [script, '--plugin-dir', fakePlugin(), '--origin', 'https://nibbl.example.workers.dev', '--out', out], { encoding: 'utf8' }),
  )
  const zipPath = join(out, 'plugin', 'nibbl-0.1.0.zip')
  assert.ok(existsSync(zipPath))
  const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex')
  assert.equal(printed.sha256, sha)
  assert.equal(printed.url, 'https://nibbl.example.workers.dev/plugin/nibbl-0.1.0.zip')

  const market = JSON.parse(readFileSync(join(out, 'marketplace.json'), 'utf8'))
  assert.equal(market.name, 'nibbl')
  assert.ok(market.owner?.name)
  assert.equal(market.plugins.length, 1)
  const entry = market.plugins[0]
  assert.equal(entry.name, 'nibbl')
  assert.deepEqual(entry.source, { source: 'archive', url: printed.url, sha256: sha })
  assert.equal(entry.version, undefined)

  const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n')
  assert.ok(listing.includes('.claude-plugin/plugin.json'))
  assert.ok(listing.includes('hooks/register.js'))
})

test('refuses a non-https origin and a plugin without a version', () => {
  assert.throws(() =>
    execFileSync('node', [script, '--plugin-dir', fakePlugin(), '--origin', 'http://example.com'], { stdio: 'pipe' }),
  )
  const dir = fakePlugin()
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'nibbl' }))
  assert.throws(() => execFileSync('node', [script, '--plugin-dir', dir, '--origin', 'https://x.example'], { stdio: 'pipe' }))
})
