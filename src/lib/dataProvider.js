// Fetched at runtime (see loadMarketData) rather than statically imported —
// this file is ~1MB of real OHLCV history, and a static import would bake
// the whole thing directly into the JS bundle, blocking parse/execution for
// every visitor before the app can render anything. As a plain public/
// asset it's fetched once, in parallel with everything else, and cached by
// the browser like any other static file.
import { barsPath } from './barsFile.js'

// One entry per symbol, filled in as pages ask for them. Nothing fetches the
// whole universe any more — see loadBars.
const barStore = {}
const barsInFlight = {}

// The dashboard's precomputed rows — a few hundred bytes per ticker against
// ~20 KB of gzipped bars, so this is what the app waits for before it paints.
// Bars are fetched separately and only when a page actually needs them.
let screener = null
let screenerPromise = null
export let SCREENER = null

export function loadScreener() {
  if (!screenerPromise) {
    screenerPromise = fetch('/screener.json')
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data) => {
        screener = data
        SCREENER = data
        if (data?.generatedAt && !DATA_GENERATED_AT) DATA_GENERATED_AT = data.generatedAt
        if (data?.rows?.length) HAS_LIVE_DATA = true
      })
  }
  return screenerPromise
}

export function screenerRows() {
  return screener?.rows ?? []
}

export function screenerDirectionCheck() {
  return screener?.directionCheck ?? null
}

export function screenerLeaderboardCheck() {
  return screener?.leaderboard ?? null
}

export function screenerMarketRead() {
  return screener?.market ?? null
}

// The pairwise correlation matrix, fetched on demand.
//
// Deliberately not part of the boot path. It is a fifth of the index's size
// again and answers a question only someone looking at a basket has asked, so
// the overlap panel pays for it and the screener does not.
let correlations = null
let correlationsPromise = null

export function loadCorrelations() {
  if (!correlationsPromise) {
    correlationsPromise = fetch('/correlations.json')
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data) => {
        correlations = data?.symbols?.length ? data : null
        return correlations
      })
  }
  return correlationsPromise
}

export function correlationData() {
  return correlations
}

// What this site has published about each ticker, sliced from the log by the
// daily job. Fetched by the record chapter only — the aggregate track record
// has its own summary, and neither page should be downloading a log that grows
// by twenty rows a session forever.
let tickerRecord = null
let tickerRecordPromise = null

export function loadTickerRecord() {
  if (!tickerRecordPromise) {
    tickerRecordPromise = fetch('/ticker-record.json')
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data) => {
        tickerRecord = data?.symbols ? data : null
        return tickerRecord
      })
  }
  return tickerRecordPromise
}

export function tickerRecordData() {
  return tickerRecord
}

// True once a real snapshot has loaded (see scripts/sync-market-data.mjs) —
// not tied to any browser-side API key, because there isn't one anymore.
// Every indicator here is daily-bar based, so there's nothing to gain from
// polling continuously from the client: the snapshot updates once a day,
// server-side, and every visitor reads the same file. No API key ships to
// the browser, and usage doesn't scale with how many people have the site
// open — it's a fixed ~22 requests/day regardless of traffic.
// These are live bindings (ES modules, not CommonJS) — importers see the
// updated value automatically once loadMarketData() resolves and the app
// re-renders, no extra plumbing needed.
export let HAS_LIVE_DATA = false
export let DATA_GENERATED_AT = null


// Called once from App.jsx before anything else renders. Safe to call more
// than once — every caller shares the same in-flight/completed fetch.
// Fetches the bar history for exactly the symbols asked for, once each.
// A ticker page wants its own symbol plus SPY (for regime matching); the
// simulator wants whichever symbols the user actually has positions in.
export function loadBars(symbols) {
  const wanted = [...new Set(symbols)].filter(Boolean)
  return Promise.all(
    wanted.map((symbol) => {
      if (barStore[symbol]) return Promise.resolve()
      if (!barsInFlight[symbol]) {
        barsInFlight[symbol] = fetch(barsPath(symbol))
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null)
          .then((data) => {
            if (data?.bars?.length) {
              barStore[symbol] = data.bars
              if (data.generatedAt && !DATA_GENERATED_AT) DATA_GENERATED_AT = data.generatedAt
            }
          })
      }
      return barsInFlight[symbol]
    })
  )
}

// Deterministic PRNG so each symbol's demo history is stable across reloads.
function hashCode(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return h
}

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function isoDaysAgo(n) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// NOTE: this is a random walk, not a market simulation. It's here so the app
// is fully explorable before the first sync has run, or for any symbol the
// sync failed to fetch. Backtest stats computed against it are illustrative
// of the *mechanism* only — they say nothing about real markets.
function generateMockBars(symbol, length = 260) {
  const rand = mulberry32(hashCode(symbol))
  let price = 20 + (Math.abs(hashCode(symbol)) % 400)
  const baseVolume = 500_000 + (Math.abs(hashCode(symbol + 'v')) % 8_000_000)
  const bars = []
  for (let i = 0; i < length; i++) {
    const open = price
    const drift = (rand() - 0.5) * 0.02
    const close = Math.max(1, open * (1 + drift))
    const wick = Math.abs(drift) * open * (0.5 + rand())
    const high = Math.max(open, close) + wick * rand()
    const low = Math.max(0.5, Math.min(open, close) - wick * rand())
    const spike = rand() > 0.94 ? 2 + rand() * 3 : 1
    const volume = Math.round(baseVolume * (0.6 + rand() * 0.8) * spike)
    bars.push({ date: isoDaysAgo(length - i), open, high, low, close, volume })
    price = close
  }
  return bars
}

const seriesStore = {}

// Real synced data for a symbol is returned as-is (frozen for the session —
// it only changes when the next daily sync runs). Falls back to a demo
// random walk for any symbol the snapshot doesn't have, or before
// loadMarketData() has resolved.
export function getSeries(symbol) {
  if (barStore[symbol]?.length) return barStore[symbol]

  // Two very different situations reach this line, and they used to be
  // indistinguishable to the caller.
  //
  // Before the first sync there is no data for anything, the whole site runs
  // on the random walk, and it says so in the header. That is the case this
  // fallback exists for, and it is fine.
  //
  // The other is a bug every time: a real snapshot is loaded, but this
  // particular symbol's bars were never requested — because bars are fetched
  // per symbol now, not as one file. The caller gets invented prices with no
  // way to tell. That shipped. The macro layer called getSeries('TLT') on
  // ticker pages that load only their own symbol plus SPY, and reported the
  // random walk's numbers as measured conditions: "high-yield credit rose
  // 11.5%" against a real figure of +0.2%.
  //
  // So in development this is loud rather than silent — it is a missing
  // loadBars() call, and it should be found by whoever wrote it rather than
  // by a reader wondering why credit moved 11.5%. Production keeps the old
  // behaviour: one wrong panel is bad, a blank page is worse.
  if (HAS_LIVE_DATA) {
    const message =
      `getSeries("${symbol}") fell back to generated demo bars while real market data is loaded. ` +
      `Bars are fetched per symbol — call loadBars(["${symbol}"]) or useBars([...]) before reading it, ` +
      `or guard with hasRealData("${symbol}"). Returning invented prices here is how mock numbers get ` +
      `rendered as measurements.`
    if (import.meta.env?.DEV) throw new Error(message)
    console.warn(message)
  }

  if (!seriesStore[symbol]) seriesStore[symbol] = generateMockBars(symbol)
  return seriesStore[symbol]
}

export function hasRealData(symbol) {
  return Boolean(barStore[symbol]?.length)
}

// How old the snapshot is, in calendar days. The sync can fail silently — it
// has, three times — and the failure mode is not an error page but yesterday's
// prices presented as today's, which is worse. Anything the user is asked to
// read as current should be able to say when it stopped being current.
//
// Tolerant of weekends and holidays by design: a Monday-morning visitor is
// legitimately looking at Friday's close, so the threshold is generous and
// only fires when the gap is longer than any normal market closure.
export function snapshotAgeDays(now = Date.now()) {
  if (!DATA_GENERATED_AT) return null
  return (now - Date.parse(DATA_GENERATED_AT)) / 86400000
}

export const STALE_AFTER_DAYS = 4

export function isSnapshotStale(now = Date.now()) {
  const age = snapshotAgeDays(now)
  return age != null && age > STALE_AFTER_DAYS
}
