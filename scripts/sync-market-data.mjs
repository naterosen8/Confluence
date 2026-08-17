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
import { lastSettledIndex, repairUnresolved } from '../src/lib/trackRecord.js'
import { buildScreener } from '../src/lib/screener.js'
import { barsFileName } from '../src/lib/barsFile.js'
import { summarizeTrackRecord } from '../src/lib/trackRecordSummary.js'

const API_KEY = process.env.TWELVE_DATA_KEY
// Lives in public/, not data/, so the built app can fetch it as a plain
// static asset at runtime instead of it being bundled into the JS.
// One file per symbol rather than one file for everything. See barsFile.js:
// a combined file hits GitHub's 100 MB per-file limit around a thousand
// tickers, and forces a ticker page to download every symbol to show one.
const BARS_DIR = new URL('../public/bars/', import.meta.url)
// Also in public/, not data/, for the same reason: this log only ever
// grows (a new row every non-neutral verdict, every trading day), so a
// static import would mean an ever-larger JS bundle every visitor has to
// download and parse before the app renders anything.
const TRACK_RECORD_PATH = new URL('../public/track-record.json', import.meta.url)
// The dashboard's rows, precomputed. See src/lib/screener.js for why.
const SCREENER_PATH = new URL('../public/screener.json', import.meta.url)
// The track-record page's figures, precomputed. The raw log stays committed
// as the audit trail; this is what the page actually downloads.
const TRACK_SUMMARY_PATH = new URL('../public/track-record-summary.json', import.meta.url)
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
    .map((v) => {
      const open = round4(parseFloat(v.open))
      const close = round4(parseFloat(v.close))
      // The provider occasionally ships a bar whose high is below its open, or
      // whose low is above it — DE and GM both did on 2023-06-05. That is not
      // a price anything traded at, it is impossible, and it silently poisons
      // everything downstream: true range comes out negative, ATR shrinks, and
      // every band and liquidation distance built on ATR is wrong for the next
      // fourteen sessions.
      //
      // Which side is wrong cannot be known from here, so the repair is the
      // minimal one that makes the bar self-consistent: widen the extremes to
      // contain the open and close rather than invent a price nobody reported.
      // Dropping the bar instead would leave a hole in a date-indexed series
      // that resolution and repair both key on.
      const high = round4(Math.max(parseFloat(v.high), open, close))
      const low = round4(Math.min(parseFloat(v.low), open, close))
      return {
        date: v.datetime,
        open,
        high,
        low,
        close,
        volume: Math.round(parseFloat(v.volume) || 0),
      }
    })
}

function loadJson(path, fallback) {
  if (!fs.existsSync(path)) return fallback
  return JSON.parse(fs.readFileSync(path, 'utf8'))
}

function saveJson(path, value) {
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function readAllBars() {
  const dir = new URL('.', BARS_DIR)
  if (!fs.existsSync(dir)) return {}
  const out = {}
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    try {
      const parsed = JSON.parse(fs.readFileSync(new URL(file, BARS_DIR), 'utf8'))
      if (parsed?.symbol && Array.isArray(parsed.bars)) out[parsed.symbol] = parsed.bars
    } catch (e) {
      console.error(`Could not read ${file}: ${e.message}`)
    }
  }
  return out
}

async function main() {
  fs.mkdirSync(BARS_DIR, { recursive: true })
  // Previous history, so a symbol that fails to fetch keeps yesterday's data
  // instead of being blanked out site-wide.
  const barsBySymbol = readAllBars()
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
  //
  // Only symbols whose bars actually moved are rewritten. Stamping every file
  // with the run time meant a run that fetched nothing — a weekend, a holiday,
  // a provider outage — still rewrote every file and committed the lot. At 24
  // symbols that is 2.2 MB of git history bought with no new data; at 500 it
  // is 46 MB a day. So generatedAt means "when this symbol's bars last
  // changed", which is both more useful and free of churn.
  const generatedAt = new Date().toISOString()
  let writtenCount = 0
  for (const [symbol, bars] of Object.entries(barsBySymbol)) {
    const target = new URL(barsFileName(symbol), BARS_DIR)
    const existing = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null
    if (existing && JSON.stringify(existing.bars) === JSON.stringify(bars)) continue
    fs.writeFileSync(target, JSON.stringify({ symbol, generatedAt, bars }) + '\n')
    writtenCount++
  }
  console.log(`Bar files rewritten: ${writtenCount} of ${Object.keys(barsBySymbol).length}.`)

  // The dashboard's rows, computed here once instead of in every visitor's
  // browser. See src/lib/screener.js.
  const screener = buildScreener({ barsBySymbol, tickers: TICKERS })
  // Same rule as the bar files: if the numbers did not move, do not rewrite
  // the file just to restamp it.
  const previousScreener = loadJson(SCREENER_PATH, null)
  const screenerChanged =
    !previousScreener ||
    JSON.stringify({ ...previousScreener, generatedAt: null }) !== JSON.stringify({ ...screener, generatedAt: null })
  if (screenerChanged) fs.writeFileSync(SCREENER_PATH, JSON.stringify(screener) + '\n')
  console.log(`Screener index: ${screener.rows.length} rows, ${screenerChanged ? 'rewritten' : 'unchanged'}.`)

  let log = loadJson(TRACK_RECORD_PATH, [])

  // Before anything is resolved: bring unresolved entries back into agreement
  // with bars the provider has since settled. Runs first so a resolution
  // computed below uses the corrected entry price rather than a provisional
  // one. Settled outcomes are left alone — see repairUnresolved.
  const repair = repairUnresolved({
    log,
    barsBySymbol,
    rescore: (history) => computeSignals(history),
  })
  log = repair.log
  if (repair.voided.length) {
    // Loud, because this is the one operation that changes what the published
    // record says about calls already made.
    console.log(`Voided ${repair.voided.length} entr${repair.voided.length === 1 ? 'y' : 'ies'} (kept in the log, excluded from stats)`)
  }
  for (const r of repair.repaired) {
    console.log(
      `Repaired ${r.symbol} ${r.date}: price ${r.from} -> ${r.to}` +
        (r.voided
          ? ' (verdict became split — entry VOIDED in place, kept in the log)'
          : r.verdictFrom
          ? ` (verdict ${r.verdictFrom} -> rescored)`
          : '')
    )
  }

  let resolvedCount = 0
  for (const entry of log) {
    if (entry.outcome) continue
    // A retracted call must not acquire a settled outcome. It was withdrawn
    // because it was never a call anybody made, so resolving it produces a
    // row that is simultaneously "we take this back" and "here is how it
    // turned out" — and the statistics exclude it either way, so the outcome
    // is contradiction with no upside.
    if (entry.voided) continue
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
    // NOT the date the job happened to run, and never against the last bar —
    // the provider is still revising that one. See lastSettledIndex.
    //
    // Resolution finds an entry's starting bar by matching this date against
    // the price series. A run on a weekend or a holiday — or any run before
    // the session's bar exists — stamped a date that appears in no bar, so
    // the entry could never be found and would sit "pending" permanently. A
    // manual trigger on a Sunday had already produced 15 such entries.
    const index = lastSettledIndex(bars)
    if (index < 0) continue

    const barDate = bars[index].date
    if (log.some((e) => e.symbol === t.symbol && e.date === barDate)) continue
    // Scored on history truncated to that same bar, so the logged price is
    // that bar's close, the verdict is what it was on that bar, and nothing
    // after it can leak into the score.
    const signals = computeSignals(bars.slice(0, index + 1))
    if (signals.verdict === 'split') continue
    log.push({ date: barDate, symbol: t.symbol, verdict: signals.verdict, score: signals.score, price: signals.price })
    loggedCount++
  }

  log.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.symbol.localeCompare(b.symbol)))
  saveJson(TRACK_RECORD_PATH, log)

  // Same rule as everywhere else: precompute what the page needs, ship a
  // payload that does not grow with the data behind it.
  const summary = summarizeTrackRecord(log)
  const previousSummary = loadJson(TRACK_SUMMARY_PATH, null)
  const summaryChanged =
    !previousSummary ||
    JSON.stringify({ ...previousSummary, generatedAt: null }) !== JSON.stringify({ ...summary, generatedAt: null })
  if (summaryChanged) fs.writeFileSync(TRACK_SUMMARY_PATH, JSON.stringify(summary) + '\n')
  console.log(
    `Track record: ${summary.resolvedCount} resolved, ${summary.pendingCount} pending, summary ${summaryChanged ? 'rewritten' : 'unchanged'}.`
  )

  console.log(
    `Synced ${fetchedCount} ticker(s), ${failedCount} failure(s) (kept prior data). Resolved ${resolvedCount} prior call(s), logged ${loggedCount} new call(s).`
  )
}

main()
