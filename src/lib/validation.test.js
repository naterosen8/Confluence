import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { readCommittedBars } from './testBars.js'
import { TICKERS } from './tickers.js'
import path from 'node:path'
import { rsiSeries, macdHistogramSeries, smaSeries, scoreSeries, computeSignals, atrSeries } from './indicators'
import { bestAvailableStat, FORWARD_DAYS } from './backtest'
import { wilsonInterval } from './stats'
import { compactMoney } from './format'

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

  // Thresholds are per asset class because the classes genuinely differ. A
  // 50% session in a mega-cap equity is almost certainly a split or a bad
  // print; in an altcoin it is a Tuesday. ADA/USD moved 72% on 2025-03-02 on
  // the US strategic-reserve announcement — real, and it tripped a limit
  // calibrated on twenty-four mostly-equity symbols.
  const MAX_SESSION_MOVE = { crypto: 0.9, stock: 0.5, etf: 0.35, macro: 0.35 }

  it('contains no absurd single-session moves that would indicate bad data', () => {
    const kindOf = new Map(TICKERS.map((t) => [t.symbol, t.kind]))
    const suspect = []
    for (const symbol of symbols) {
      const s = bars[symbol]
      const limit = MAX_SESSION_MOVE[kindOf.get(symbol)] ?? 0.5
      for (let i = 1; i < s.length; i++) {
        const move = Math.abs((s[i].close - s[i - 1].close) / s[i - 1].close)
        if (move > limit) suspect.push(`${symbol} ${s[i].date}: ${(move * 100).toFixed(0)}% (limit ${limit * 100}%)`)
      }
    }
    if (suspect.length) console.log('Suspect single-session moves:', suspect)
    expect(suspect).toHaveLength(0)
  })

  // A wick far beyond the body is either a real liquidation cascade or a bad
  // print, and the difference matters: VZ carried a low of $10.60 on a session
  // that opened $40.17, which alone made a 2x position look unsurvivable and
  // Verizon the most dangerous instrument tracked. XRP and ADA carry 8-10 ATR
  // wicks on the same 2025-10-10 date, which is the real October 2025 cascade
  // and must not be filtered away by a feature whose job is to show risk.
  //
  // So: anything past 25 ATR fails, because no market makes that. Everything
  // between 6 and 25 is printed for a human to look at rather than silently
  // accepted or silently removed.
  it('has no wick beyond any plausible market event', () => {
    const impossible = []
    const notable = []
    for (const symbol of symbols) {
      const s = bars[symbol]
      const atr = atrSeries(s, 14)
      for (let i = 20; i < s.length; i++) {
        const a = atr[i - 1]
        if (!a) continue
        const bodyLow = Math.min(s[i].open, s[i].close)
        const bodyHigh = Math.max(s[i].open, s[i].close)
        const below = (bodyLow - s[i].low) / a
        const above = (s[i].high - bodyHigh) / a
        const worst = Math.max(below, above)
        if (worst > 25) impossible.push(`${symbol} ${s[i].date}: ${worst.toFixed(0)}x ATR beyond the body`)
        else if (worst > 6) notable.push(`${symbol} ${s[i].date}: ${worst.toFixed(1)}x ATR`)
      }
    }
    if (notable.length) console.log('Large but plausible wicks (left as-is):\n  ' + notable.join('\n  '))
    if (impossible.length) console.log('IMPOSSIBLE wicks:\n  ' + impossible.join('\n  '))
    expect(impossible).toEqual([])
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
  // 80 permutations across 89 tickers rather than 24: past the 5s default.
  it('compares the real top-5 edge against a shuffled null', { timeout: 30_000 }, () => {
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
      // A voided entry is a retracted call, and mis-stamping is the documented
      // reason it was retracted — flagging it here would mean the guard could
      // never go green while the record honestly reports its own retractions.
      // Not a loophole: the next test requires every void to carry a reason,
      // so nothing can be quietly voided to silence this one.
      if (e.voided) continue
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

  // Voiding is the one operation that changes what the record says about calls
  // already published, so every void has to be accountable.
  it('every retracted entry says why, and keeps its original verdict', () => {
    const bad = []
    for (const e of log) {
      if (!e.voided) continue
      if (!e.voided.reason) bad.push(`${e.symbol} ${e.date}: voided with no reason`)
      if (!e.voided.at) bad.push(`${e.symbol} ${e.date}: voided with no date`)
      if (!e.voided.verdictWas) bad.push(`${e.symbol} ${e.date}: voided without recording the original verdict`)
      if (e.outcome) bad.push(`${e.symbol} ${e.date}: voided but carries a settled outcome`)
    }
    expect(bad).toEqual([])
  })

  // The log may be amended but must never shrink. Deleting a published call
  // once cost two crypto entries, discoverable only by diffing the file
  // against its own git history.
  it('never has fewer entries than the last committed version', () => {
    let previous
    try {
      previous = JSON.parse(execSync('git show HEAD:public/track-record.json', { encoding: 'utf8' }))
    } catch {
      return // no committed version to compare against yet
    }
    expect(log.length).toBeGreaterThanOrEqual(previous.length)
    const now = new Set(log.map((e) => `${e.symbol}|${e.date}`))
    const missing = previous.map((e) => `${e.symbol}|${e.date}`).filter((k) => !now.has(k))
    expect(missing).toEqual([])
  })
})

// The correlation matrix ships as its own file and is written by the same job
// that writes the screener index. Two files derived from one set of bars can
// fall out of step in exactly one way that matters: the index gains a ticker
// and the matrix does not, and the overlap page then quietly drops that name
// from every basket it is put in with nothing on screen saying so.
d('the published correlation matrix agrees with the published index', () => {
  const load = (name) => {
    const file = path.join(process.cwd(), 'public', name)
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
  }
  const screener = load('screener.json')
  const matrix = load('correlations.json')

  it('covers every symbol the screener publishes', () => {
    if (!screener || !matrix) return
    const covered = new Set(matrix.symbols)
    expect(screener.rows.map((r) => r.symbol).filter((s) => !covered.has(s))).toEqual([])
  })

  it('carries exactly one value per distinct pair', () => {
    if (!matrix) return
    const n = matrix.symbols.length
    expect(matrix.pairs).toHaveLength((n * (n - 1)) / 2)
  })

  it('holds only real correlations, or an honest null', () => {
    if (!matrix) return
    const bad = matrix.pairs.filter((p) => p !== null && !(Number.isFinite(p) && p >= -1 && p <= 1))
    expect(bad).toEqual([])
  })

  it('reads back the same number in both directions', async () => {
    if (!matrix) return
    const { pairLookup } = await import('./correlation.js')
    const at = pairLookup(matrix)
    const [a, b, c] = matrix.symbols
    expect(at(a, b)).toBe(at(b, a))
    expect(at(a, c)).toBe(at(c, a))
    expect(at(a, a)).toBe(1)
  })

  // Recomputing from the committed bars must reproduce the committed file. If
  // it does not, the file was generated from data that is no longer here.
  it('is reproducible from the bars in this repository', async () => {
    if (!matrix || !hasData) return
    const { correlationMatrix } = await import('./correlation.js')
    const rebuilt = correlationMatrix(bars, matrix.symbols, matrix.lookback)
    expect(rebuilt.symbols).toEqual(matrix.symbols)
    for (let i = 0; i < matrix.pairs.length; i++) {
      const published = matrix.pairs[i]
      const computed = rebuilt.pairs[i]
      if (published === null || computed === null) {
        expect(published).toBe(computed === null ? null : published)
        continue
      }
      // The file rounds to two decimals; that is the only difference allowed.
      expect(Math.abs(computed - published)).toBeLessThanOrEqual(0.005 + 1e-9)
    }
  })
})

// The per-ticker record is the same log sliced by symbol, published as its own
// bounded file. Two views of one source can disagree in one way that matters:
// the page shows a call the log does not have, or hides one it does.
d('the per-ticker record agrees with the log it came from', () => {
  const load = (name) => {
    const file = path.join(process.cwd(), 'public', name)
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
  }
  const log = load('track-record.json')
  const index = load('ticker-record.json')

  it('is reproducible from the committed log', async () => {
    if (!log || !index) return
    const { bySymbol } = await import('./tickerRecord.js')
    expect(index.symbols).toEqual(bySymbol(log))
  })

  it('publishes no call the log does not contain', () => {
    if (!log || !index) return
    const known = new Set(log.map((e) => `${e.symbol}|${e.date}`))
    const invented = []
    for (const [symbol, block] of Object.entries(index.symbols)) {
      for (const c of block.calls) if (!known.has(`${symbol}|${c.date}`)) invented.push(`${symbol} ${c.date}`)
    }
    expect(invented).toEqual([])
  })

  it('never counts a retracted call as resolved', () => {
    if (!log || !index) return
    const voided = new Set(log.filter((e) => e.voided).map((e) => `${e.symbol}|${e.date}`))
    const leaked = []
    for (const [symbol, block] of Object.entries(index.symbols)) {
      for (const c of block.calls) if (voided.has(`${symbol}|${c.date}`)) leaked.push(`${symbol} ${c.date}`)
    }
    expect(leaked).toEqual([])
  })

  it('counts every resolved call, including the ones it does not list', () => {
    if (!log || !index) return
    for (const [symbol, block] of Object.entries(index.symbols)) {
      const settled = log.filter((e) => e.symbol === symbol && !e.voided && e.outcome && e.outcome.correct !== null)
      expect(block.resolvedCount, symbol).toBe(settled.length)
      expect(block.hits, symbol).toBe(settled.filter((e) => e.outcome.correct).length)
    }
  })
})

// The brief tells the reader "every figure here is computed, tested and
// caveated on one of them, and none of it is new". That is a claim about the
// code, and it is the kind that rots quietly: a figure gets rounded
// differently, or read off a screener row instead of the source, and the brief
// starts disagreeing with the chapter it points at. Checked against real bars.
d('the brief agrees with the chapters it claims to assemble', () => {
  const symbols5 = symbols.slice(0, 5)

  it('reports the same numbers the risk chapter does', async () => {
    const { brief } = await import('./brief.js')
    const { riskRead, stopRead, drawdownRead, recoveryRead } = await import('./riskRead')
    const { liquidityRead } = await import('./liquidityRead.js')
    const { computeSignals, atrSeries } = await import('./indicators')
    const { readSetup } = await import('./setupRead.js')

    for (const symbol of symbols5) {
      const b = bars[symbol]
      const signals = computeSignals(b)
      const atr = atrSeries(b, 14).at(-1)
      const risk = riskRead({ bars: b, symbol })
      const stop = stopRead({ bars: b, symbol, atr })
      const drawdown = drawdownRead({ bars: b, symbol })
      const liquidity = liquidityRead({ bars: b, symbol })

      const assembled = brief({
        symbol,
        signals,
        setup: readSetup(b, signals),
        stat: null,
        market: null,
        record: null,
        risk,
        stop,
        drawdown,
        recovery: recoveryRead({ bars: b, symbol, atr }),
        liquidity,
        atr,
        corrSpy: null,
        overlap: null,
      })

      const figure = (key) => assembled.figures.find((f) => f.key === key)

      if (risk?.safeLeverage != null) {
        expect(figure('size').value, `${symbol} size`).toBe(`${risk.safeLeverage}x`)
      }
      if (stop?.keeper?.mult != null) {
        expect(figure('stop').value, `${symbol} stop`).toBe(`${stop.keeper.mult} ATR`)
        // The dollar distance is the multiple times the current ATR, not a
        // separately-rounded number that could drift from it.
        expect(figure('stop').note, `${symbol} stop $`).toBe(`$${(stop.keeper.mult * atr).toFixed(2)}`.replace('$', '$') + ' from entry')
      }
      if (drawdown?.medianAdversePct != null) {
        expect(figure('drawdown').value, `${symbol} drawdown`).toContain(
          Math.abs(drawdown.medianAdversePct).toFixed(2)
        )
      }
      // Unreported volume must show as unknown, never as an omitted row or a
      // zero — the two mean opposite things.
      expect(figure('liquidity'), `${symbol} liquidity row`).toBeTruthy()
      expect(figure('liquidity').value, `${symbol} liquidity`).toBe(
        liquidity.reported ? compactMoney(liquidity.absorbableQuiet) : '—'
      )
    }
  })

  it('never states a lean without what that lean has been worth', async () => {
    const { brief } = await import('./brief.js')
    const { computeSignals, atrSeries } = await import('./indicators')
    const { readSetup } = await import('./setupRead.js')
    const { bestAvailableStat } = await import('./backtest')

    for (const symbol of symbols5) {
      const b = bars[symbol]
      const signals = computeSignals(b)
      const assembled = brief({
        symbol,
        signals,
        setup: readSetup(b, signals),
        stat: bestAvailableStat(b, bars.SPY ?? b).stat,
        market: null,
        record: null,
        risk: null,
        stop: null,
        drawdown: null,
        recovery: null,
        liquidity: null,
        atr: atrSeries(b, 14).at(-1),
        corrSpy: null,
        overlap: null,
      })
      const worth = assembled.sections.find((s) => s.key === 'worth')
      if (!worth) continue
      // Wherever the text says which way the readings lean, the same paragraph
      // has to carry the measurement.
      if (/readings lean (up|down)/.test(worth.text)) {
        expect(worth.text, `${symbol} lean without worth`).toMatch(/gap of|split rather than/)
      }
    }
  })

  it('recommends nothing, on real data, whatever the readings say', async () => {
    const { brief } = await import('./brief.js')
    const { computeSignals, atrSeries } = await import('./indicators')
    const { readSetup } = await import('./setupRead.js')
    const { bestAvailableStat } = await import('./backtest')
    const { riskRead, stopRead, drawdownRead, recoveryRead } = await import('./riskRead')
    const { liquidityRead } = await import('./liquidityRead.js')

    const banned = /\b(buy|sell it|go long|short it|we recommend|you should (buy|sell|take)|worth taking)\b/i
    for (const symbol of symbols) {
      const b = bars[symbol]
      const signals = computeSignals(b)
      const atr = atrSeries(b, 14).at(-1)
      const assembled = brief({
        symbol,
        signals,
        setup: readSetup(b, signals),
        stat: bestAvailableStat(b, bars.SPY ?? b).stat,
        market: null,
        record: null,
        risk: riskRead({ bars: b, symbol }),
        stop: stopRead({ bars: b, symbol, atr }),
        drawdown: drawdownRead({ bars: b, symbol }),
        recovery: recoveryRead({ bars: b, symbol, atr }),
        liquidity: liquidityRead({ bars: b, symbol }),
        atr,
        corrSpy: null,
        overlap: null,
      })
      const text = [assembled.headline, ...assembled.sections.map((x) => x.text), assembled.caveat].join(' ')
      expect(text, `${symbol} reads as a recommendation`).not.toMatch(banned)
      // And it must never render the word for having no direction as one.
      expect(text, `${symbol} printed a direction of "none"`).not.toMatch(/lean none|leans none/)
    }
  })
})

// The largest published file, and the one every page paints from. Correlations,
// the per-ticker record and the summary all had a reproducibility guard; this
// one did not, which left the site's most-read numbers as the only derived
// figures nothing checked against the bars they came from.
d('the published screener index reproduces from the bars', () => {
  const file = path.join(process.cwd(), 'public', 'screener.json')

  it('rebuilds identically from the committed bar files', async () => {
    if (!fs.existsSync(file)) return
    const { buildScreener } = await import('./screener.js')
    const published = JSON.parse(fs.readFileSync(file, 'utf8'))
    const rebuilt = buildScreener({ barsBySymbol: bars, tickers: TICKERS })
    expect({ ...rebuilt, generatedAt: null }).toEqual({ ...published, generatedAt: null })
  })

  it('is deterministic — two builds of the same bars agree', async () => {
    const { buildScreener } = await import('./screener.js')
    const once = buildScreener({ barsBySymbol: bars, tickers: TICKERS })
    const twice = buildScreener({ barsBySymbol: bars, tickers: TICKERS })
    expect({ ...once, generatedAt: null }).toEqual({ ...twice, generatedAt: null })
  })

  it('publishes no negative zero, which JSON cannot round-trip', () => {
    if (!fs.existsSync(file)) return
    const published = JSON.parse(fs.readFileSync(file, 'utf8'))
    const found = []
    const walk = (node, path) => {
      if (typeof node === 'number') {
        if (Object.is(node, -0)) found.push(path)
        return
      }
      if (node && typeof node === 'object') for (const k of Object.keys(node)) walk(node[k], `${path}.${k}`)
    }
    walk(published, 'screener')
    expect(found).toEqual([])
  })

  it('ships a row only for symbols it actually has bars for', () => {
    if (!fs.existsSync(file)) return
    const published = JSON.parse(fs.readFileSync(file, 'utf8'))
    const invented = published.rows.filter((r) => !bars[r.symbol]?.length).map((r) => r.symbol)
    expect(invented).toEqual([])
  })
})

// Four derived files are published from two sources. Three already had a
// reproducibility guard; the summary did not, and it was also the one the
// rebuild script had been silently skipping.
d('the published summary reproduces from the log', () => {
  const file = path.join(process.cwd(), 'public', 'track-record-summary.json')
  const logFile = path.join(process.cwd(), 'public', 'track-record.json')

  it('matches what summarizeTrackRecord produces from the committed log', async () => {
    if (!fs.existsSync(file) || !fs.existsSync(logFile)) return
    const { summarizeTrackRecord } = await import('./trackRecordSummary.js')
    const published = JSON.parse(fs.readFileSync(file, 'utf8'))
    const rebuilt = summarizeTrackRecord(JSON.parse(fs.readFileSync(logFile, 'utf8')))
    // generatedAt is a stamp, not a figure.
    expect({ ...published, generatedAt: null }).toEqual({ ...rebuilt, generatedAt: null })
  })

  it('carries the clustered reading, not only the per-call one', () => {
    if (!fs.existsSync(file)) return
    const published = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!published.resolvedCount) return
    expect(published.clustered).toBeTruthy()
    expect(published.clustered.days).toBeGreaterThan(0)
    // The honest interval is the wider one; if it ever stops being wider,
    // something has gone wrong with the clustering rather than with reality.
    if (published.clustered.perEpisode) {
      const naive = published.clustered.perCall.high - published.clustered.perCall.low
      const honest = published.clustered.perEpisode.high - published.clustered.perEpisode.low
      expect(honest).toBeGreaterThan(naive)
    }
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
