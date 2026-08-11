// Runs daily via .github/workflows/sync-market-data.yml, after market
// close. Every indicator this app computes (RSI, MACD, backtests, etc.)
// is based on a *daily* close, so there's no value in fetching more often
// than once a day — doing that from the browser was blowing through
// Twelve Data's 800/day free cap in under two hours with a single tab
// open. This script fetches once, server-side, and commits the result;
// every visitor reads the same static snapshot, so the free tier covers
// unlimited concurrent traffic. It also resolves/logs the public track
// record from the same fetch, so this is the only place Twelve Data
// ever gets called — no duplicate API usage between the two features.
import fs from 'fs'
import { computeSignals } from '../src/lib/indicators.js'
import { TICKERS } from '../src/lib/tickers.js'
import { leanDirection } from '../src/lib/lean.js'
import { entryBarIndex, utcToday } from '../src/lib/trackRecord.js'

const API_KEY = process.env.TWELVE_DATA_KEY
// Lives in public/, not data/, so the built app can fetch it as a plain
// static asset at runtime instead of it being bundled into the JS.
const MARKET_DATA_PATH = new URL('../public/market-data.json', import.meta.url)
// Also in public/, not data/, for the same reason: this log only ever
// grows (a new row every non-neutral verdict, every trading day), so a
// static import would mean an ever-larger JS bundle every visitor has to
// download and parse before the app renders anything.
const TRACK_RECORD_PATH = new URL('../public/track-record.json', import.meta.url)
const FORWARD_SESSIONS = 5

if (!API_KEY) {
  console.error('TWELVE_DATA_KEY is not set — cannot sync real market data.')
  process.exit(1)
}

// ~4 years of daily bars. The confluence score needs 200 bars of warm-up
// before it produces anything at all, so at the previous 260 only ~23% of the
// history was scoreable and every base rate on the site rested on ~60 heavily
// overlapping observations. Going deeper costs no extra API calls — it is the
// same one request per symbol, just a larger response — and multiplies the
// evidence behind every published figure by roughly an order of magnitude.
const OUTPUT_SIZE = 1000

// Twelve Data returns full float noise (483.48001000000004). Rounding to four
// decimals is lossless at any price these instruments trade at and takes a
// meaningful bite out of a file every visitor downloads.
const round4 = (n) => Math.round(n * 1e4) / 1e4

async function fetchBars(symbol) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${OUTPUT_SIZE}&apikey=${API_KEY}`
  // A hung connection here has nothing else guarding it — without a
  // timeout it would stall this whole loop (and the 22 tickers behind it)
  // until the GitHub Actions job's own default 6-hour ceiling, instead of
  // failing fast and falling back to yesterday's data for just this symbol.
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  const data = await res.json()
  if (data.status === 'error') throw new Error(data.message || 'Twelve Data request failed')
  return data.values
    .slice()
    .reverse()
    .map((v) => ({
      date: v.datetime,
      open: round4(parseFloat(v.open)),
      high: round4(parseFloat(v.high)),
      low: round4(parseFloat(v.low)),
      close: round4(parseFloat(v.close)),
      volume: Math.round(parseFloat(v.volume) || 0),
    }))
}

function loadJson(path, fallback) {
  if (!fs.existsSync(path)) return fallback
  return JSON.parse(fs.readFileSync(path, 'utf8'))
}

function saveJson(path, value) {
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const previousSnapshot = loadJson(MARKET_DATA_PATH, { generatedAt: null, bars: {} })
  const barsBySymbol = { ...previousSnapshot.bars }
  let fetchedCount = 0
  let failedCount = 0

  for (const t of TICKERS) {
    try {
      barsBySymbol[t.symbol] = await fetchBars(t.symbol)
      fetchedCount++
    } catch (e) {
      // Keep yesterday's data for this symbol rather than dropping it —
      // a single transient failure shouldn't blank out a ticker site-wide.
      console.error(`Failed to fetch ${t.symbol}: ${e.message}`)
      failedCount++
    }
    await sleep(7500) // stay under Twelve Data's free-tier 8 req/min
  }

  // Written compact rather than indented: at this depth the whitespace alone
  // was a third of the file, and nobody reads this by hand.
  fs.writeFileSync(
    MARKET_DATA_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), bars: barsBySymbol }) + '\n'
  )

  const log = loadJson(TRACK_RECORD_PATH, [])
  let resolvedCount = 0
  for (const entry of log) {
    if (entry.outcome) continue
    const bars = barsBySymbol[entry.symbol]
    if (!bars) continue
    const loggedIndex = bars.findIndex((b) => b.date === entry.date)
    if (loggedIndex === -1) continue
    const targetIndex = loggedIndex + FORWARD_SESSIONS
    if (targetIndex >= bars.length) continue
    const exitPrice = bars[targetIndex].close
    const returnPct = ((exitPrice - entry.price) / entry.price) * 100
    // Resolves both the current band keys and the pre-rename labels that
    // older entries in this log still carry.
    const dir = leanDirection(entry.verdict)
    entry.outcome = {
      resolvedDate: bars[targetIndex].date,
      exitPrice,
      returnPct,
      correct: dir === 'up' ? returnPct > 0 : dir === 'down' ? returnPct < 0 : null,
    }
    resolvedCount++
  }

  let loggedCount = 0
  for (const t of TICKERS) {
    const bars = barsBySymbol[t.symbol]
    if (!bars) continue
    // Stamp the entry with the date of the bar the signal was computed from,
    // NOT the date the job happened to run.
    //
    // Resolution finds an entry's starting bar by matching this date against
    // the price series. A run on a weekend or a holiday — or any run before
    // the session's bar exists — stamped a date that appears in no bar, so
    // the entry could never be found and would sit "pending" permanently. A
    // manual trigger on a Sunday had already produced 15 such entries.
    // The last bar is not always a finished one — see entryBarIndex.
    const index = entryBarIndex({ bars, kind: t.kind, today: utcToday() })
    if (index < 0) continue

    const today = bars[index].date
    if (log.some((e) => e.symbol === t.symbol && e.date === today)) continue
    // Scored on the same history the entry is stamped with, so the logged
    // price is that bar's close and the verdict is what it was on that bar.
    const signals = computeSignals(index === bars.length - 1 ? bars : bars.slice(0, index + 1))
    if (signals.verdict === 'split') continue
    log.push({ date: today, symbol: t.symbol, verdict: signals.verdict, score: signals.score, price: signals.price })
    loggedCount++
  }

  log.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.symbol.localeCompare(b.symbol)))
  saveJson(TRACK_RECORD_PATH, log)

  console.log(
    `Synced ${fetchedCount} ticker(s), ${failedCount} failure(s) (kept prior data). Resolved ${resolvedCount} prior call(s), logged ${loggedCount} new call(s).`
  )
}

main()
