#!/usr/bin/env node
// Regenerates public/og-image.png — the card people see when the link is
// shared, and the one asset that goes stale silently.
//
// It sold the old product for a while after the site stopped being that
// product: "A live technical-analysis screener… RSI · MACD · Trend", which by
// then described the thing the site had spent a month disproving. A link
// preview is often the only thing someone reads.
//
// Its figures are read from the published files like every other number here,
// so re-running it updates the card to whatever the record currently says.
// Needs Playwright, which is not a dependency — run it by hand after a change
// to the positioning, not on every sync.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

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
  console.error('Playwright is not installed. `npm i -D playwright`, or run this where it is available.')
  process.exit(2)
}

const summary = JSON.parse(fs.readFileSync(new URL('../public/track-record-summary.json', import.meta.url), 'utf8'))
const screener = JSON.parse(fs.readFileSync(new URL('../public/screener.json', import.meta.url), 'utf8'))
const distinguishable = screener.rows.filter((r) => r.stat?.distinguishable).length

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto(new URL('./og-card.html', import.meta.url).href)
await page.evaluate(
  ([calls, hit, edge]) => {
    document.getElementById('calls').textContent = calls
    document.getElementById('hit').textContent = hit
    document.getElementById('dist').textContent = edge
  },
  [summary.resolvedCount.toLocaleString(), `${summary.overall.winRate.toFixed(1)}%`, String(distinguishable)]
)
await page.waitForTimeout(300)

const overflow = await page.evaluate(() => document.body.scrollHeight - 630)
if (overflow > 0) {
  console.error(`Card overflows its frame by ${overflow}px — the text would be cut off. Not writing.`)
  await browser.close()
  process.exit(1)
}

// A string, not a URL — page.screenshot takes a filesystem path, and passing
// the URL object threw. Caught by running the script, which the commit that
// added it had not done.
const out = fileURLToPath(new URL('../public/og-image.png', import.meta.url))
await page.screenshot({ path: out })
await browser.close()
console.log(`Wrote og-image.png — ${summary.resolvedCount} calls, ${summary.overall.winRate.toFixed(1)}%, ${distinguishable} distinguishable.`)
