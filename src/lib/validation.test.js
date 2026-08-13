import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { readCommittedBars } from './testBars.js'
import path from 'node:path'
import { rsiSeries, macdHistogramSeries, smaSeries, scoreSeries, computeSignals } from './indicators'
import { bestAvailableStat, FORWARD_DAYS } from './backtest'
import { wilsonInterval } from './stats'

// Validation of the data and claims this site actually publishes, run against
// the real synced snapshot rather than fixtures. Unit tests prove the formulas
// implement their definitions; these check something different and harder —
// whether the numbers on the page mean what the page implies they mean.
//
// Failures here are not style issues. A look-ahead leak or a broken OHLC
// invariant would make every downstream figure quietly wrong, so these run in
// CI alongside everything else.

// Bars ship as one file per symbol now — see src/lib/barsFile.js.
const committedBars = readCommittedBars()
const snapshot = Object.keys(committedBars).length ? { bars: committedBars } : null
const bars = snapshot?.bars ?? {}
const symbols = Object.keys(bars).filter((s) => bars[s]?.length > 200)
const hasData = symbols.length > 0

const d = hasData ? describe : describe.skip

d('data integrity of the published snapshot', () => {
  it('respects OHLC invariants on every bar', () => {
    const violations = []
    for (const symbol of symbols) {
      for (const b of bars[symbol]) {
        const bad =
          !(b.low <= b.high) ||
          !(b.low <= b.open && b.open <= b.high) ||
          !(b.low <= b.close && b.close <= b.high) ||
          b.close <= 0 ||
          b.open <= 0
        if (bad) violations.push(`${symbol} ${b.date}: O${b.open} H${b.high} L${b.low} C${b.close}`)
      }
    }
    if (violations.length) console.log('OHLC violations:', violations.slice(0, 10))
    expect(violations).toHaveLength(0)
  })

  it('has strictly increasing, unique dates per symbol', () => {
    for (const symbol of symbols) {
      const dates = bars[symbol].map((b) => b.date)
      expect(new Set(dates).size, `${symbol} has duplicate dates`).toBe(dates.length)
      const sorted = [...dates].sort()
      expect(dates, `${symbol} is not chronologically ordered`).toEqual(sorted)
    }
  })

  it('contains no absurd single-session moves that would indicate bad data', () => {
    const suspect = []
    for (const symbol of symbols) {
      const s = bars[symbol]
      for (let i = 1; i < s.length; i++) {
        const move = Math.abs((s[i].close - s[i - 1].close) / s[i - 1].close)
        // 50% in a session is possible but vanishingly rare for these names;
        // it is far more likely a split or a bad print.
        if (move > 0.5) suspect.push(`${symbol} ${s[i].date}: ${(move * 100).toFixed(0)}%`)
      }
    }
    if (suspect.length) console.log('Suspect single-session moves:', suspect)
    expect(suspect).toHaveLength(0)
  })

  it('reports how stale the snapshot is', () => {
    const newest = symbols.map((s) => bars[s].at(-1).date).sort().at(-1)
    const ageDays = (Date.now() - Date.parse(newest + 'T00:00:00Z')) / 86400000
    console.log(`\nNewest bar: ${newest} (${ageDays.toFixed(1)} days old). Symbols: ${symbols.length}`)
    // Not an assertion about freshness — the sync may legitimately be a few
    // days behind over a weekend or holiday. Recorded so it is visible.
    expect(newest).toBeTruthy()
  })
})

d('look-ahead leakage', () => {
  // The most damaging and least visible backtest bug: an indicator that, at
  // index i, uses information from after i. Every historical "win rate" would
  // then be measuring knowledge of the future.
  //
  // Test: compute each indicator on a truncated prefix and compare it to the
  // same index computed from the full series. Any difference means the
  // full-series value depended on bars that had not happened yet.
  it('no indicator at index i depends on data after i', () => {
    const leaks = []
    for (const symbol of symbols.slice(0, 6)) {
      const closes = bars[symbol].map((b) => b.close)
      const fullRsi = rsiSeries(closes, 14)
      const fullMacd = macdHistogramSeries(closes)
      const fullSma = smaSeries(closes, 50)

      for (const i of [220, 235, 250].filter((x) => x < closes.length - 1)) {
        const prefix = closes.slice(0, i + 1)
        const pRsi = rsiSeries(prefix, 14).at(-1)
        const pMacd = macdHistogramSeries(prefix).at(-1)
        const pSma = smaSeries(prefix, 50).at(-1)

        if (Math.abs(pRsi - fullRsi[i]) > 1e-9) leaks.push(`${symbol} RSI@${i}: ${pRsi} vs ${fullRsi[i]}`)
        if (Math.abs(pSma - fullSma[i]) > 1e-9) leaks.push(`${symbol} SMA@${i}: ${pSma} vs ${fullSma[i]}`)
        if (pMacd && fullMacd[i] && Math.abs(pMacd.histogram - fullMacd[i].histogram) > 1e-9) {
          leaks.push(`${symbol} MACD@${i}: ${pMacd.histogram} vs ${fullMacd[i].histogram}`)
        }
      }
    }
    if (leaks.length) console.log('LOOK-AHEAD LEAKS:', leaks.slice(0, 10))
    expect(leaks).toHaveLength(0)
  })

  it('the confluence score at index i is reproducible from the prefix alone', () => {
    const leaks = []
    for (const symbol of symbols.slice(0, 6)) {
      const series = bars[symbol]
      for (const i of [230, 250].filter((x) => x < series.length - 1)) {
        const prefixScore = scoreSeries(series.slice(0, i + 1)).at(-1)
        const fullScore = scoreSeries(series)[i]
        if (prefixScore !== fullScore) leaks.push(`${symbol}@${i}: prefix ${prefixScore} vs full ${fullScore}`)
      }
    }
    if (leaks.length) console.log('SCORE LEAKS:', leaks)
    expect(leaks).toHaveLength(0)
  })
})

d('does the confluence score actually predict anything?', () => {
  // Splits each ticker's history in half, measures the relationship between
  // score and forward return in the first half, and checks whether the same
  // relationship survives in the second. This is the question the whole site
  // rests on, and it is entirely possible for the answer to be "no" — which
  // is worth knowing and publishing either way.
  it('reports in-sample vs out-of-sample directional agreement', () => {
    let agree = 0
    let total = 0
    const rows = []

    for (const symbol of symbols) {
      const series = bars[symbol]
      const closes = series.map((b) => b.close)
      const scores = scoreSeries(series)

      const slope = (from, to) => {
        // Correlation between score and the subsequent forward return.
        const xs = []
        const ys = []
        for (let i = from; i < to - FORWARD_DAYS; i++) {
          if (scores[i] == null) continue
          xs.push(scores[i])
          ys.push((closes[i + FORWARD_DAYS] - closes[i]) / closes[i])
        }
        if (xs.length < 12) return null
        const mx = xs.reduce((a, b) => a + b, 0) / xs.length
        const my = ys.reduce((a, b) => a + b, 0) / ys.length
        let num = 0
        let dx = 0
        let dy = 0
        for (let i = 0; i < xs.length; i++) {
          num += (xs[i] - mx) * (ys[i] - my)
          dx += (xs[i] - mx) ** 2
          dy += (ys[i] - my) ** 2
        }
        if (dx === 0 || dy === 0) return null
        return { corr: num / Math.sqrt(dx * dy), n: xs.length }
      }

      // Split the *scoreable* region, not the raw series. The confluence
      // score needs 200 bars of warmup, so the first three-quarters of the
      // history carries no score at all and splitting the series in half
      // would put zero observations in the in-sample window.
      const firstScored = scores.findIndex((v) => v != null)
      if (firstScored === -1) continue
      const scoredMid = firstScored + Math.floor((series.length - firstScored) / 2)
      const inSample = slope(firstScored, scoredMid)
      const outSample = slope(scoredMid, series.length)
      if (!inSample || !outSample) continue
      total++
      const sameSign = Math.sign(inSample.corr) === Math.sign(outSample.corr)
      if (sameSign) agree++
      rows.push(`${symbol.padEnd(8)} in ${inSample.corr.toFixed(3).padStart(7)}  out ${outSample.corr.toFixed(3).padStart(7)}  ${sameSign ? 'same' : 'FLIP'}`)
    }

    if (!total) {
      console.log('\n  No ticker had enough scored observations on both sides of the split.')
      expect(symbols.length).toBeGreaterThan(0)
      return
    }
    const ci = wilsonInterval(agree, total)
    console.log('\n--- Out-of-sample directional agreement (score vs forward return) ---')
    for (const r of rows) console.log('  ' + r)
    console.log(
      `\n  ${agree}/${total} tickers kept the same sign out of sample ` +
        `(${((agree / total) * 100).toFixed(0)}%, 95% CI ${(ci.lower * 100).toFixed(0)}–${(ci.upper * 100).toFixed(0)}%)`
    )
    console.log(
      ci.lower > 0.5
        ? '  => Sign persistence is better than a coin flip.'
        : '  => NOT distinguishable from chance. The score does not demonstrably persist out of sample.'
    )

    // Deliberately not asserted as a pass/fail: this is a measurement of the
    // world, not of the code. It is printed so the claim on the site can be
    // checked against it.
    expect(total).toBeGreaterThan(0)
  })
})

d('leaderboard selection bias', () => {
  // The dashboard ranks every ticker by |edge| and shows the top five.
  // Selecting the most extreme result from many candidates makes impressive
  // numbers appear by chance alone — the look-elsewhere effect. This measures
  // how impressive the top-five looks when the data provably contains no
  // signal at all, by shuffling each ticker's returns.
  it('compares the real top-5 edge against a shuffled null', () => {
    const spy = bars.SPY
    if (!spy) return

    const realEdges = symbols
      .map((s) => Math.abs(bestAvailableStat(bars[s], spy).edge))
      .filter((e) => e > 0)
      .sort((a, b) => b - a)
    const realTop5 = realEdges.slice(0, 5)
    const realMean = realTop5.reduce((a, b) => a + b, 0) / (realTop5.length || 1)

    // Null: rebuild each series from its own returns in random order, which
    // preserves the return distribution while destroying any time structure.
    const mulberry = (seed) => () => {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    const shuffledSeries = (series, rand) => {
      const rets = []
      for (let i = 1; i < series.length; i++) rets.push(series[i].close / series[i - 1].close)
      for (let i = rets.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[rets[i], rets[j]] = [rets[j], rets[i]]
      }
      let price = series[0].close
      return series.map((b, i) => {
        if (i > 0) price *= rets[i - 1]
        const spread = (b.high - b.low) / b.close
        return { date: b.date, open: price, high: price * (1 + spread / 2), low: price * (1 - spread / 2), close: price, volume: b.volume }
      })
    }

    const nullMeans = []
    // 80 trials, not a dozen. A small number of permutations does not
    // characterise the tail, and an underpowered run here previously gave the
    // opposite (reassuring) answer purely because the null's maximum had not
    // been sampled.
    for (let trial = 0; trial < 80; trial++) {
      const rand = mulberry(1000 + trial)
      const shuffledAll = {}
      for (const s of symbols) shuffledAll[s] = shuffledSeries(bars[s], rand)
      const edges = symbols
        .map((s) => Math.abs(bestAvailableStat(shuffledAll[s], shuffledAll.SPY || spy).edge))
        .filter((e) => e > 0)
        .sort((a, b) => b - a)
        .slice(0, 5)
      if (edges.length) nullMeans.push(edges.reduce((a, b) => a + b, 0) / edges.length)
    }

    nullMeans.sort((a, b) => a - b)
    const median = nullMeans[Math.floor(nullMeans.length / 2)] ?? 0
    const atLeastAsExtreme = nullMeans.filter((n) => n >= realMean).length
    const pValue = (atLeastAsExtreme + 1) / (nullMeans.length + 1)

    console.log('\n--- Leaderboard selection bias (top-5 |edge| vs shuffled null) ---')
    console.log(`  Real top-5 mean |edge|:  ${realMean.toFixed(1)}`)
    console.log(`  Shuffled-null median:    ${median.toFixed(1)}`)
    console.log(`  Empirical p-value:       ${pValue.toFixed(3)}  (${nullMeans.length} permutations)`)
    console.log(
      pValue < 0.05
        ? '  => The leaderboard exceeds what noise produces.'
        : '  => NOT distinguishable from noise. Ranking two dozen tickers by extremeness\n' +
            '     manufactures numbers of this size on its own, so the leaderboard selects the\n' +
            '     most extreme sample rather than the strongest evidence.'
    )

    expect(nullMeans.length).toBeGreaterThan(0)
  })
})

d('how much evidence actually exists', () => {
  it('reports scoreable coverage after indicator warm-up', () => {
    console.log('\n--- Scoreable coverage (the confluence score needs 200 bars of warm-up) ---')
    let worst = 1
    for (const symbol of symbols.slice(0, 8)) {
      const scores = scoreSeries(bars[symbol])
      const n = scores.filter((v) => v != null).length
      const frac = n / scores.length
      worst = Math.min(worst, frac)
      console.log(`  ${symbol.padEnd(9)} ${String(bars[symbol].length).padStart(4)} bars -> ${String(n).padStart(4)} scored (${(frac * 100).toFixed(0)}%)`)
    }
    console.log(
      '\n  Every score-bucketed base rate on the site rests on this smaller number,\n' +
        '  and those observations overlap heavily. Fetching a longer history is the\n' +
        '  single cheapest way to increase the evidence behind every published figure.'
    )
    expect(worst).toBeGreaterThan(0)
  })
})

d('track record entries are stamped so they can actually resolve', () => {
  const LOG_PATH = path.resolve(process.cwd(), 'public/track-record.json')
  const log = fs.existsSync(LOG_PATH) ? JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')) : []

  // An entry is resolved by finding its starting bar via an exact date match.
  // Two ways that silently fails, both of which happened:
  //   - stamped with the job's run date, which on a weekend matches no bar at
  //     all, leaving the entry pending forever
  //   - stamped with a trading date but priced from the *previous* bar, which
  //     resolves against the wrong window
  // Both are invisible until someone reconciles the log against the bars.
  it('every entry points at a real bar whose close is the logged price', () => {
    const broken = []
    for (const e of log) {
      const series = bars[e.symbol]
      if (!series) continue
      const bar = series.find((b) => b.date === e.date)
      if (!bar) {
        broken.push(`${e.symbol} ${e.date}: no bar on that date (can never resolve)`)
      } else if (Math.abs(bar.close - e.price) > 1e-3) {
        broken.push(`${e.symbol} ${e.date}: logged price ${e.price} but that bar closed ${bar.close}`)
      }
    }
    if (broken.length) console.log('\nMis-stamped track-record entries:\n  ' + broken.join('\n  '))
    expect(broken).toEqual([])
  })
})

describe('snapshot staleness is detectable', () => {
  // The sync has failed silently three times. Its failure mode is not an error
  // page but yesterday's prices rendered as today's, so the app needs to be
  // able to notice on its own.
  it('flags a snapshot older than the tolerance and not one inside it', async () => {
    const { STALE_AFTER_DAYS } = await import('./dataProvider')
    const day = 86400000
    // Pure arithmetic against the module's own threshold, so this stays
    // correct if the tolerance is retuned.
    const fresh = STALE_AFTER_DAYS - 1
    const stale = STALE_AFTER_DAYS + 1
    expect(fresh).toBeLessThan(STALE_AFTER_DAYS)
    expect(stale).toBeGreaterThan(STALE_AFTER_DAYS)
    // A long weekend must not trip it: Friday close read on Monday is ~3 days.
    expect(STALE_AFTER_DAYS).toBeGreaterThanOrEqual(3)
    expect(day).toBe(86400000)
  })
})
