import { drawPet, drawScene, genome, rarestTrait, stageForLevel, type Genome, type Stage, type Tier, type TraitOdds } from '@nibbl/core'
import type { Env } from '../env'
import { petBySerial, type PetRow } from '../lib/db'
import { NIGHT, OG_H, OG_SCALE, OG_W, renderGridPng } from '../lib/png'
import { badgeSvg, escapeXml as e, gridSvg } from '../lib/svg'

const CARD_PATH = /^\/p\/(\d{1,6})(\.png|\/badge\.svg)?$/
const CENTER_X = 8

const RARITY: Record<Tier, string> = {
  common: '#94b0c2',
  uncommon: '#a7f070',
  rare: '#41a6f6',
  epic: '#c77dff',
  legendary: '#ffcd75',
}

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'public, max-age=300',
  'x-content-type-options': 'nosniff',
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
}

export const padSerial = (serial: number): string => String(serial).padStart(6, '0')

export const formatOdds = (p: number): string => {
  const v = p * 100
  return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)
}

export const traitLine = (t: TraitOdds): string =>
  `${t.gene === 'mark' || t.gene === 'shiny' ? t.value : `${t.value} ${t.gene}`}: ${formatOdds(t.probability)}% odds`

export type CardView = {
  serial: number
  padded: string
  displayName: string
  label: string | null
  title: string
  genome: Genome
  level: number
  xp: number
  stage: Stage
  genesis: boolean
  rarest: TraitOdds
}

// Hidden pets keep their card (it is the owner's proof) but lose name and label.
export const cardView = (pet: PetRow): CardView => {
  const g = genome(pet.seed, pet.tier as Tier, pet.shiny === 1)
  const hidden = pet.is_hidden === 1
  const displayName = hidden || !pet.name ? 'nibbl' : pet.name
  const padded = padSerial(pet.serial)
  return {
    serial: pet.serial,
    padded,
    displayName,
    label: hidden ? null : pet.label,
    title: `${displayName} #${padded}`,
    genome: g,
    level: pet.level,
    xp: pet.xp,
    stage: stageForLevel(pet.level),
    genesis: pet.genesis === 1,
    rarest: rarestTrait(g),
  }
}

export const cardHtml = (v: CardView, origin: string): string => {
  const url = `${origin}/p/${v.padded}`
  const description = `Level ${v.level} ${v.genome.tier}${v.genome.shiny ? ' shiny' : ''} nibbl. ${traitLine(v.rarest)}.`
  const scene = gridSvg(drawScene(v.genome, { stage: v.stage, petX: CENTER_X }), 12, v.title)
  const tags = [
    `<span class="tag tier">${v.genome.tier}</span>`,
    v.genome.shiny ? '<span class="tag">shiny</span>' : '',
    v.genesis ? '<span class="tag">genesis</span>' : '',
  ].join('')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(v.title)} · nibbl</title>
<meta name="description" content="${e(description)}">
<link rel="canonical" href="${e(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="nibbl">
<meta property="og:title" content="${e(v.title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(url)}">
<meta property="og:image" content="${e(url)}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${e(`Pixel art of ${v.title}`)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Pixelify+Sans:wght@500;700&family=Silkscreen&display=swap" rel="stylesheet">
<style>
:root{--night:#0f111a;--ink:#1a1c2c;--shell:#f4ead5;--accent:#ef7d57;--slate:#566c86;--white:#f4f4f4;--tier:${RARITY[v.genome.tier]}}
*{box-sizing:border-box;margin:0}
body{background:var(--night);color:var(--white);font:400 15px/1.6 'JetBrains Mono',monospace;min-height:100vh;display:grid;place-items:center;padding:24px 16px}
.card{width:100%;max-width:520px;background:var(--shell);color:var(--ink);border:4px solid var(--ink);box-shadow:4px 4px 0 var(--accent);padding:24px;clip-path:polygon(0 8px,4px 8px,4px 4px,8px 4px,8px 0,calc(100% - 8px) 0,calc(100% - 8px) 4px,calc(100% - 4px) 4px,calc(100% - 4px) 8px,100% 8px,100% calc(100% - 8px),calc(100% - 4px) calc(100% - 8px),calc(100% - 4px) calc(100% - 4px),calc(100% - 8px) calc(100% - 4px),calc(100% - 8px) 100%,8px 100%,8px calc(100% - 4px),4px calc(100% - 4px),4px calc(100% - 8px),0 calc(100% - 8px))}
.screen{background:#c5d1a5;padding:12px;margin-bottom:20px}
.screen svg{display:block;width:100%;height:auto;image-rendering:pixelated}
h1{font:700 40px/1.1 'Pixelify Sans',monospace;overflow-wrap:anywhere}
.serial{color:var(--slate)}
.label{color:#4a4134;margin-top:4px}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.tag{font:400 12px/1 Silkscreen,monospace;padding:6px 8px;background:var(--ink);color:var(--white)}
.tag.tier{color:var(--tier)}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 16px}
dt{color:var(--slate)}
a{color:var(--ink)}
footer{margin-top:20px;font-size:13px}
</style>
</head>
<body>
<main class="card">
<div class="screen">${scene}</div>
<h1>${e(v.displayName)} <span class="serial">#${v.padded}</span></h1>
${v.label ? `<p class="label">${e(v.label)}</p>` : ''}
<div class="tags">${tags}</div>
<dl><dt>level</dt><dd>${v.level}</dd><dt>xp</dt><dd>${v.xp}</dd><dt>rarest</dt><dd>${e(traitLine(v.rarest))}</dd></dl>
<footer><a href="/">Hatch your own nibbl</a></footer>
</main>
</body>
</html>`
}

const notFound = (): Response =>
  new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>No such nibbl</title></head><body style="background:#0f111a;color:#f4f4f4;font-family:monospace;padding:24px">No nibbl with this serial. <a style="color:#ef7d57" href="/">Back home</a></body></html>',
    { status: 404, headers: { ...HTML_HEADERS, 'cache-control': 'public, max-age=60' } },
  )

export const card = async (request: Request, env: Env): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  }
  const url = new URL(request.url)
  const match = CARD_PATH.exec(url.pathname)
  const serial = match ? Number(match[1]) : 0
  const pet = serial >= 1 ? await petBySerial(env.DB, serial) : null
  if (!match || !pet) return notFound()
  const view = cardView(pet)
  if (match[2] === '/badge.svg') {
    const text = `${view.title} · lvl ${view.level}`
    return new Response(badgeSvg(drawPet(view.genome, view.stage, 'idle'), text), {
      headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" },
    })
  }
  if (match[2] === '.png') {
    const scene = drawScene(view.genome, { stage: view.stage, petX: CENTER_X })
    return new Response(await renderGridPng(scene, OG_SCALE, OG_W, OG_H, NIGHT), {
      headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' },
    })
  }
  return new Response(cardHtml(view, url.origin), { headers: HTML_HEADERS })
}
