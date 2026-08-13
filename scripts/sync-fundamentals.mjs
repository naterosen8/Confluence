// Pulls balance sheet data from SEC EDGAR's XBRL companyfacts API and writes
// public/fundamentals.json. Chosen over a commercial fundamentals provider
// because it is the primary source, it is free, it needs no API key, and it
// has no request quota to blow through — which keeps the whole app on the
// same "no paid tier, no client-side secrets" footing as the price sync.
//
// Balance sheets change four times a year, so this is cheap to run daily and
// will simply rewrite the same file on most days.
//
// EDGAR asks that automated clients identify themselves with a contact in the
// User-Agent and stay under ~10 requests/second. SEC_CONTACT should be an
// email; the request still works without one but is the polite thing to set.
import fs from 'fs'
import { parseCompanyFacts, diagnoseCompanyFacts } from '../src/lib/edgarFacts.js'
import { TICKERS } from '../src/lib/tickers.js'

const OUT_PATH = new URL('../public/fundamentals.json', import.meta.url)
const CONTACT = process.env.SEC_CONTACT || 'confluence-app'
const UA = `Confluence/1.0 (${CONTACT})`
const TICKER_MAP_URL = 'https://www.sec.gov/files/company_tickers.json'
const FACTS_URL = (cik) => `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function main() {
  const stocks = TICKERS.filter((t) => t.kind === 'stock')
  if (!stocks.length) {
    console.log('No company tickers to sync.')
    return
  }

  // Resolve ticker -> CIK from SEC's own mapping rather than hardcoding CIKs:
  // a transposed digit would silently return a different company's balance
  // sheet, which is far worse than the symbol simply being missing.
  let cikByTicker = new Map()
  try {
    const map = await getJson(TICKER_MAP_URL)
    for (const row of Object.values(map)) {
      if (row?.ticker && row?.cik_str != null) cikByTicker.set(String(row.ticker).toUpperCase(), row.cik_str)
    }
    console.log(`Resolved ${cikByTicker.size} ticker->CIK mappings.`)
  } catch (e) {
    console.error(`Could not fetch SEC ticker map: ${e.message}`)
    process.exit(1)
  }

  const previous = fs.existsSync(OUT_PATH) ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) : { companies: {} }
  const companies = { ...(previous.companies || {}) }
  let ok = 0
  let failed = 0

  for (const t of stocks) {
    const cik = cikByTicker.get(t.symbol.toUpperCase())
    if (!cik) {
      console.error(`No CIK for ${t.symbol} — skipping.`)
      failed++
      continue
    }
    try {
      const facts = await getJson(FACTS_URL(cik))
      const parsed = parseCompanyFacts(facts)
      if (!parsed || !parsed.quarters.length) {
        // Say exactly which stage failed. "No usable balance sheet" on its own
        // is unactionable — the cause is always either a concept missing from
        // a fallback chain or one too sparse to cover the periods, and naming
        // which turns a recurring mystery into a one-line fix.
        const d = diagnoseCompanyFacts(facts)
        console.error(
          `No usable balance sheet for ${t.symbol}: ${d.reason}. ` +
            `periods=${d.periods ?? 0} kept=${d.kept ?? 0} ` +
            `droppedNoShares=${d.droppedNoShares ?? 0} droppedNoEquity=${d.droppedNoEquity ?? 0} ` +
            `concepts=${JSON.stringify(d.concepts)}` +
            (d.available?.length ? ` available=${d.available.slice(0, 10).join(',')}` : '')
        )
        failed++
      } else {
        // Keep the prior entry on a bad parse rather than replacing good data
        // with an empty one, same policy as the price sync.
        companies[t.symbol] = { cik, entityName: parsed.entityName, quarters: parsed.quarters }
        ok++
        const q = parsed.quarters[parsed.quarters.length - 1]
        console.log(`${t.symbol}: ${parsed.quarters.length} quarters, latest ${q.asOf} equity ${q.equity}`)
        // A partial success is the harder failure to notice: XOM came back
        // with 2 quarters where everyone else had 12, and several filers land
        // with no revenue at all. Both look fine in the summary line, so say
        // which concept was chosen and how much of the period grid it covered
        // whenever the result is short of complete.
        const thin = parsed.quarters.length < 8 || q.revenue == null || q.netIncome == null
        if (thin) {
          const d = diagnoseCompanyFacts(facts)
          console.log(
            `  ${t.symbol} is incomplete — periods=${d.periods} kept=${d.kept} concepts=${JSON.stringify(d.concepts)}` +
              // A short period grid makes every other concept report full
              // coverage of a grid that is itself wrong, so say so separately.
              (d.periods < 8 ? `\n  ${t.symbol} assets chain — ${d.assetsChain.join(' | ')}` : '')
          )
        }
      }
    } catch (e) {
      console.error(`Failed ${t.symbol}: ${e.message}`)
      failed++
    }
    await sleep(150) // well inside EDGAR's ~10 req/s guidance
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), companies }, null, 2) + '\n')
  console.log(`Wrote fundamentals for ${Object.keys(companies).length} companies (${ok} refreshed, ${failed} failed).`)
}

main()
