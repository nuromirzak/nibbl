import { drawPet, SWEETIE, genome, levelFromXp } from '@nibbl/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { badgeSvg, gridRects } from '../src/lib/svg'
import { call, insertPet, ORIGIN, resetDb } from './helpers'

beforeEach(resetDb)

const xp = 1000
const byte = { serial: 42, seed: 123, tier: 'rare', name: 'Byte', label: 'night coder', xp, level: levelFromXp(xp).level }

describe('GET /p/:serial', () => {
  it('renders an HTML card with OG tags and an inline pixel SVG', async () => {
    await insertPet(byte)
    const res = await call('/p/000042')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    const html = await res.text()
    expect(html).toContain('<meta property="og:title" content="Byte #000042">')
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/p/000042.png">`)
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
    expect(html).toContain('shape-rendering="crispEdges"')
    expect(html).toContain('night coder')
    expect(html).toContain('% odds')
  })

  it('links to the leaderboard with the pet as ?me=', async () => {
    await insertPet(byte)
    const html = await (await call('/p/000042')).text()
    expect(html).toContain('<a href="/leaderboard?me=42">See its rank</a>')
  })

  it('accepts unpadded serials', async () => {
    await insertPet(byte)
    expect((await call('/p/42')).status).toBe(200)
  })

  it('answers 404 for unknown or malformed serials', async () => {
    await insertPet(byte)
    for (const path of ['/p/999', '/p/0', '/p/abc', '/p/1234567', '/p/', '/p/42/other', '/p/42.jpg']) {
      const res = await call(path)
      expect(res.status, path).toBe(404)
    }
  })

  it('escapes markup from stored names and labels', async () => {
    await insertPet({ ...byte, name: '<b>&"x', label: "<img src=x onerror='1'>" })
    const html = await (await call('/p/42')).text()
    expect(html).not.toContain('<b>&')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;b&gt;&amp;&quot;x')
    const badge = await (await call('/p/42/badge.svg')).text()
    expect(badge).not.toContain('<b>')
    expect(badge).toContain('&lt;b&gt;')
  })

  it('hides name and label of hidden pets', async () => {
    await insertPet({ ...byte, is_hidden: 1 })
    const html = await (await call('/p/42')).text()
    expect(html).toContain('content="nibbl #000042"')
    expect(html).not.toContain('Byte')
    expect(html).not.toContain('night coder')
  })
})

describe('GET /p/:serial/badge.svg', () => {
  it('serves a cached pixel badge with name, serial and level', async () => {
    await insertPet(byte)
    const res = await call('/p/000042/badge.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    const svg = await res.text()
    expect(svg).toContain(`Byte #000042 · lvl ${byte.level}`)
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; style-src 'unsafe-inline'")
  })

  it('uses a background that differs from the pet outline color', async () => {
    await insertPet(byte)
    const svg = await (await call('/p/42/badge.svg')).text()
    const bg = /<rect width="\d+" height="\d+" fill="(#[0-9a-f]{6})"/.exec(svg)?.[1]
    expect(bg).toBe('#c5d1a5')
    expect(bg).not.toBe(SWEETIE[0])
    const html = await (await call('/p/42')).text()
    expect(html).toContain('.screen{background:#c5d1a5;')
    expect(html).toContain('clip-path:polygon(')
    expect(html).not.toContain('border-radius')
  })

  it('stays under 20 KB for the busiest sprites and longest text', () => {
    const text = 'Wwwwwwwwwwwwwwww #999999 · lvl 99'
    for (let seed = 0; seed < 300; seed++) {
      const svg = badgeSvg(drawPet(genome(seed, 'legendary', true), 'adult', 'idle'), text)
      expect(new TextEncoder().encode(svg).length).toBeLessThan(20 * 1024)
    }
  })
})

describe('gridRects', () => {
  it('merges horizontal runs of one color', () => {
    expect(gridRects([[1, 1, 1, null, 2]], 2)).toBe(
      '<rect x="0" y="0" width="6" height="2" fill="#5d275d"/><rect x="8" y="0" width="2" height="2" fill="#b13e53"/>',
    )
  })
})
