#!/usr/bin/env node
// Walks the built site in a real browser and fails on anything a unit test
// cannot see.
//
// The gap this closes is specific. A `useState` setter was renamed and one
// call site in a JSX handler was missed; the build resolved nothing, 543 unit
// tests passed, and the first sign of trouble was `setMultiple is not defined`
// thrown when someone changed a dropdown. `src/lib/components.test.js` now
// catches that exact shape statically, but the general answer is to click the
// things: every page rendered, every interactive surface touched, and any
// uncaught exception or console error treated as a failure.
//
// Run against a preview server:
//   npm run build && npx vite preview --port 4173 &
//   npm run smoke
//
// Playwright is not a dependency of this project — it is a large install for
// something that runs by hand — so this resolves it wherever it happens to be
// and says so plainly if it is missing.
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:4173'

let chromium
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.js']) {
  try {
    const mod = await import(spec)
    chromium = (mod.default ?? mod).chromium
    if (chromium) break
  } catch {
    /* try the next location */
  }
}
if (!chromium) {
  console.error('Playwright is not installed. `npm i -D playwright` (or run this where it is available).')
  process.exit(2)
}

const { DISCLAIMER_VERSION } = await import('../src/lib/disclaimer.js')

const problems = []
const note = (where, what) => problems.push(`${where}: ${what}`)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
// Google Fonts is not reachable from every environment this runs in, and a
// blocked stylesheet is not a defect in the site.
await ctx.route('**fonts.g**', (r) => r.abort())
const page = await ctx.newPage()

let where = 'startup'
page.on('pageerror', (e) => note(where, `uncaught ${e.message}`))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  // Vercel's analytics script only exists on Vercel, and an aborted font
  // request reports as a failed resource.
  if (/_vercel|Failed to load resource/.test(m.text())) return
  note(where, `console ${m.text()}`)
})

await page.addInitScript((version) => {
  localStorage.setItem('confluence.disclaimer', JSON.stringify({ version, at: new Date().toISOString() }))
  localStorage.setItem('confluence.watchlist.v1', JSON.stringify(['SPY', 'QQQ', 'NVDA']))
}, DISCLAIMER_VERSION)

async function open(path) {
  where = path
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1', { timeout: 20000 })
  await page.waitForTimeout(600)
  const junk = await page.locator('text=/NaN|undefined|\\[object Object\\]/').count()
  if (junk) note(path, `${junk} unrendered value(s) on the page`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 1) note(path, `${overflow}px of horizontal overflow`)
}

const PAGES = [
  '/',
  '/overlap',
  '/overlap?symbols=SPY,QQQ,NVDA,TLT,XOM',
  '/track-record',
  '/my-trades',
  '/methodology',
  '/methodology/glossary',
  '/feedback',
  '/nope',
  ...['layers', 'signals', 'record', 'balance-sheet', 'risk', 'what-if', 'share'].map((c) => `/ticker/NVDA/${c}`),
  '/ticker/BTC%2FUSD/risk',
]
for (const p of PAGES) await open(p)

// --- The interactive surfaces, which is the point of running a browser -----

await open('/')
where = 'screener: filter'
await page.locator('#screener-q').fill('NVDA')
await page.waitForTimeout(400)
if ((await page.locator('#screener-q').inputValue()) !== 'NVDA') note(where, 'filter box dropped characters')
await page.locator('#screener-q').fill('')
await page.waitForTimeout(300)

where = 'screener: columns'
await page.locator('.column-picker summary').click()
for (const label of ['Absorbs', 'vs SPY', 'Recovery']) {
  await page.locator('.column-picker .facet-chip', { hasText: new RegExp(`^${label}$`) }).click()
  await page.waitForTimeout(120)
}
const headers = await page.locator('table.grid thead th').allInnerTexts()
for (const label of ['ABSORBS', 'VS SPY', 'RECOVERY']) {
  if (!headers.some((h) => h.toUpperCase().startsWith(label))) note(where, `${label} column did not appear`)
}

where = 'screener: sort'
await page.locator('.th-sort', { hasText: 'vs SPY' }).click()
await page.waitForTimeout(300)

where = 'screener: keyboard'
await page.locator('h1').click()
await page.keyboard.press('j')
await page.keyboard.press('j')
await page.waitForTimeout(250)
if (!(await page.locator('tr.row-cursor').count())) note(where, 'j did not move the row cursor')
await page.keyboard.press('s')
await page.keyboard.press('G')
await page.keyboard.press('?')
await page.waitForTimeout(250)
if (!(await page.locator('.shortcut-help').count())) note(where, '? did not open the shortcut list')
await page.keyboard.press('Escape')

where = 'screener: export'
const download = page.waitForEvent('download', { timeout: 10000 }).catch(() => null)
await page.locator('.filter-actions button').click()
if (!(await download)) note(where, 'CSV export produced no download')

where = 'ticker: position sizer'
await open('/ticker/NVDA/risk')
where = 'ticker: position sizer'
await page.locator('.sizer-inputs input').first().fill('100000')
await page.locator('.sizer-inputs input').nth(1).fill('1')
await page.locator('.sizer-inputs input').nth(1).blur()
await page.waitForTimeout(400)
if (!(await page.locator('.sizer-grid .stat').count())) note(where, 'entering both numbers produced no arithmetic')
// The dropdown is where the renamed-setter bug threw.
for (const value of ['3', '0.5', '2']) {
  await page.locator('.sizer-inputs select').selectOption(value)
  await page.waitForTimeout(200)
}
if (!(await page.locator('.sizer-caps tbody tr').count())) note(where, 'no size ceilings listed')

where = 'overlap: basket'
await open('/overlap')
if (await page.locator('.basket-chip').count()) {
  await page.locator('.basket-chip button').first().click()
  await page.waitForTimeout(300)
}
await page.locator('#basket-add').fill('KO')
await page.locator('.basket-add button[type="submit"]').click()
await page.waitForTimeout(400)
if (!(await page.locator('.basket-chip', { hasText: 'KO' }).count())) note(where, 'adding a symbol did not reach the basket')

where = 'theme'
await open('/')
const toggle = page.locator('.theme-toggle')
for (let i = 0; i < 3; i++) {
  await toggle.click()
  await page.waitForTimeout(200)
}

await browser.close()

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}
console.log(`Smoke test passed: ${PAGES.length} pages and every interactive surface, no page errors.`)
