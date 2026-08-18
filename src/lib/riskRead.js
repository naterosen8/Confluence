import { simulatePosition } from './leverageStudy.js'
import { FORWARD_DAYS } from './backtest.js'

// Direct advice, about the half of this the evidence actually supports.
//
// The site cannot tell anyone what to buy. It measured that question and the
// answer was nothing: base rates that do not separate from their own drift,
// a confluence score correlating about -0.06 with what follows, twelve
// survivors out of eighty-seven that are mostly *under*-performers. Turning
// those inputs into "buy this" would be a confident voice attached to a coin
// flip, next to a simulator that goes to 50x.
//
// Risk is a different question and it has a real answer. How far this
// instrument moves, how often it has moved that far, and what leverage does
// to survival are all measurable from the same history — no forecast
// required, because they are statements about the distribution rather than
// about the next draw. "At 25x, 118 of the last 250 entries on this ticker
// were liquidated inside five sessions" is direct, actionable, and true.
//
// So this answers the question that can be answered: not whether to take a
// position, but what taking one at a given size would have survived.

// Rungs a person actually picks in the simulator, rather than a smooth curve
// nobody chooses from.
export const LEVERAGE_RUNGS = [1, 2, 3, 5, 10, 25, 50]

// Every entry point in the lookback, walked forward at each leverage. Uses the
// same simulatePosition as the trade simulator, which checks intraday lows and
// highs — a position touched at the liquidation level mid-session is dead even
// if the bar closed above it, and scoring on closes would quietly inflate
// every number here.
export function leverageSurvival({ bars, direction = 'long', forwardDays = FORWARD_DAYS, lookback = 250 }) {
  if (!bars?.length) return null
  const start = Math.max(0, bars.length - lookback - forwardDays)
  const rungs = []

  for (const leverage of LEVERAGE_RUNGS) {
    let survived = 0
    let total = 0
    for (let i = start; i < bars.length; i++) {
      const outcome = simulatePosition(bars, i, direction, leverage, forwardDays)
      if (!outcome) continue
      total++
      if (!outcome.liquidated) survived++
    }
    if (total) rungs.push({ leverage, survived, total, survivalPct: (survived / total) * 100 })
  }

  if (!rungs.length) return null
  return { direction, forwardDays, entries: rungs[0].total, rungs }
}

// The largest rung at which every historical entry survived. This is the one
// number here that reads as advice, and it earns it: it is a fact about what
// already happened, not a claim about what will.
export function maxFullySurvivable(survival) {
  const clean = survival?.rungs.filter((r) => r.survived === r.total) ?? []
  return clean.length ? clean[clean.length - 1].leverage : null
}

export function riskRead({ bars, symbol, direction = 'long', forwardDays = FORWARD_DAYS, lookback = 250 }) {
  const survival = leverageSurvival({ bars, direction, forwardDays, lookback })
  if (!survival) return null

  const safe = maxFullySurvivable(survival)
  const worst = survival.rungs.at(-1)
  const entries = survival.entries

  // Stated as an instruction, because on this question the data supports one.
  const headline =
    safe == null
      ? `Every leverage rung tested was liquidated at some point in the last ${entries} entries`
      : safe >= 25
      ? `Survived every one of the last ${entries} entries up to ${safe}x`
      : `Above ${safe}x, this instrument has already liquidated you`

  const parts = []
  if (safe == null) {
    parts.push(
      `Every rung from 1x up was wiped out somewhere in the last ${entries} entry points over a ${forwardDays}-session hold. That includes 1x, which means this instrument fell to zero-equity on an unleveraged position — check the data before trusting it.`
    )
  } else {
    parts.push(
      `Taking a ${direction} at every one of the last ${entries} sessions and holding ${forwardDays}, ${safe}x is the highest size that would have survived all of them. That is not a recommendation to use ${safe}x — it is the point past which this instrument's own recent history has already gone through you.`
    )
  }

  const notable = survival.rungs.filter((r) => r.survived < r.total)
  if (notable.length) {
    parts.push(
      'Above that: ' +
        notable
          .map((r) => `${r.leverage}x liquidated ${r.total - r.survived} of ${r.total}`)
          .join(', ') +
        '.'
    )
  }

  if (worst && worst.survived < worst.total) {
    const pct = 100 - worst.survivalPct
    parts.push(
      `At ${worst.leverage}x, ${pct.toFixed(0)}% of those entries ended at zero — the size the simulator allows, and the one where the instrument decides the outcome rather than the entry does.`
    )
  }

  return {
    symbol,
    direction,
    safeLeverage: safe,
    entries,
    forwardDays,
    rungs: survival.rungs,
    headline,
    read: parts.join(' '),
    caveat: `Measured over the last ${entries} entry points on this ticker, checking intraday lows so a position touched at its liquidation level counts as dead. It describes what this instrument has already done to a position of each size — not what it will do next, and not whether to take one at all.`,
  }
}

// --- Excursions ------------------------------------------------------------
// How far a position travelled against and in favour of itself before the hold
// ended, for every entry point in the lookback.
//
// This is the primitive behind both the stop read and the drawdown read, and
// it has to use intraday lows and highs rather than closes for the same reason
// simulatePosition does: a stop is hit the moment price touches it, and a
// drawdown you sat through is one you actually felt, not one visible at the
// bell. Scoring on closes would understate both and flatter every number.
export function excursions({ bars, direction = 'long', forwardDays = FORWARD_DAYS, lookback = 250 }) {
  if (!bars?.length) return []
  const start = Math.max(0, bars.length - lookback - forwardDays)
  const out = []

  for (let i = start; i < bars.length; i++) {
    const window = bars.slice(i + 1, i + 1 + forwardDays)
    if (window.length < forwardDays) continue
    const entry = bars[i].close
    if (!entry) continue

    let worst = entry
    let best = entry
    for (const b of window) {
      if (direction === 'long') {
        if (b.low < worst) worst = b.low
        if (b.high > best) best = b.high
      } else {
        if (b.high > worst) worst = b.high
        if (b.low < best) best = b.low
      }
    }

    const sign = direction === 'long' ? 1 : -1
    out.push({
      date: bars[i].date,
      // Always <= 0: the deepest the position was under water at any point.
      adversePct: (sign * (worst - entry) * 100) / entry,
      favourablePct: (sign * (best - entry) * 100) / entry,
      endPct: (sign * (window.at(-1).close - entry) * 100) / entry,
    })
  }
  return out
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))
  return sorted[idx]
}

// --- Stop placement --------------------------------------------------------
// Where a stop stops being a stop and starts being noise.
//
// The measurable question is not "where should the stop go" in the abstract —
// it is how often a stop at a given distance would have been hit by ordinary
// movement over a hold this length, and crucially how often it would have
// taken you out of a position that went on to end profitable. That second
// number is the one nobody computes and the one that decides whether a stop is
// protecting a thesis or just harvesting noise.
//
// Distances are in ATR rather than percent because that is what makes them
// comparable across instruments: 2% is a tight stop on SPY and a rounding
// error on an altcoin.
export const STOP_ATR_MULTIPLES = [0.5, 1, 1.5, 2, 3, 4]

// A stop this tight is being hit by the instrument's own noise more often than
// it is protecting anything.
const WINNER_LOSS_TOLERANCE = 10

export function stopRead({ bars, symbol, atr, direction = 'long', forwardDays = FORWARD_DAYS, lookback = 250 }) {
  if (!bars?.length || !atr || atr <= 0) return null
  const rows = excursions({ bars, direction, forwardDays, lookback })
  if (!rows.length) return null

  const price = bars.at(-1).close
  const winners = rows.filter((r) => r.endPct > 0)
  if (!winners.length) return null

  const levels = STOP_ATR_MULTIPLES.map((mult) => {
    // ATR as a share of price, so an ATR distance can be compared against a
    // percentage excursion.
    const distancePct = (atr * mult * 100) / price
    const hit = rows.filter((r) => r.adversePct <= -distancePct).length
    const winnersHit = winners.filter((r) => r.adversePct <= -distancePct).length
    return {
      mult,
      distancePct,
      dollars: atr * mult,
      hitPct: (hit / rows.length) * 100,
      winnersLostPct: (winnersHit / winners.length) * 100,
    }
  })

  // The tightest stop that keeps most of the winners. This is the figure worth
  // stating as an instruction.
  const keeper = levels.find((l) => l.winnersLostPct <= WINNER_LOSS_TOLERANCE) ?? null
  const tightest = levels[0]

  const headline = keeper
    ? `A stop needs about ${keeper.mult} ATR — $${keeper.dollars.toFixed(2)} — to stop being noise`
    : `No stop tested was wide enough to keep ${100 - WINNER_LOSS_TOLERANCE}% of the winners`

  const parts = []
  parts.push(
    `Over the last ${rows.length} entries held ${forwardDays} sessions, a stop ${tightest.mult} ATR away ($${tightest.dollars.toFixed(
      2
    )}, ${tightest.distancePct.toFixed(1)}%) was hit on ${tightest.hitPct.toFixed(0)}% of them — and on ${tightest.winnersLostPct.toFixed(
      0
    )}% of the ones that ended profitable anyway.`
  )
  if (keeper) {
    parts.push(
      `Widening to ${keeper.mult} ATR ($${keeper.dollars.toFixed(2)}, ${keeper.distancePct.toFixed(
        1
      )}%) cuts that to ${keeper.winnersLostPct.toFixed(0)}% of winners lost. Tighter than that on ${symbol} and the stop is being triggered by the instrument's ordinary range rather than by anything going wrong.`
    )
  } else {
    parts.push(
      `Even at ${levels.at(-1).mult} ATR ($${levels.at(-1).dollars.toFixed(2)}) it still costs ${levels
        .at(-1)
        .winnersLostPct.toFixed(0)}% of the winners. On this instrument a stop inside a ${forwardDays}-session hold is expensive at every distance tested.`
    )
  }

  return {
    symbol,
    direction,
    atr,
    levels,
    keeper,
    headline,
    read: parts.join(' '),
    caveat:
      'Measured on intraday lows and highs, because that is when a stop actually triggers. It assumes the fill happens at the stop price, which a gap through the level does not honour — real outcomes are worse than this by the size of the gap and the spread. It says nothing about where price goes next.',
  }
}

// --- Drawdown --------------------------------------------------------------
// What holding this has actually felt like.
//
// A win rate says nothing about the path. Positions that end profitable
// routinely spend the middle of the hold under water, and the number that
// decides whether someone can hold one is how far under — not how it ended.
export function drawdownRead({ bars, symbol, direction = 'long', forwardDays = FORWARD_DAYS, lookback = 250 }) {
  if (!bars?.length) return null
  const rows = excursions({ bars, direction, forwardDays, lookback })
  if (!rows.length) return null

  const winners = rows.filter((r) => r.endPct > 0)
  // Sorted ascending: most negative first, so index 0 is the deepest.
  const all = rows.map((r) => r.adversePct).sort((a, b) => a - b)
  const winnerAdverse = winners.map((r) => r.adversePct).sort((a, b) => a - b)

  const median = quantile(all, 0.5)
  const deep = quantile(all, 0.1) // the worst decile
  const worst = all[0]
  const winnerMedian = winnerAdverse.length ? quantile(winnerAdverse, 0.5) : null
  const winnerWorst = winnerAdverse.length ? winnerAdverse[0] : null

  const headline = `Typical hold goes ${Math.abs(median).toFixed(1)}% against you before it resolves`

  const parts = [
    `Across the last ${rows.length} entries held ${forwardDays} sessions, the median position was ${Math.abs(
      median
    ).toFixed(1)}% under water at its worst point, one in ten went past ${Math.abs(deep).toFixed(
      1
    )}%, and the deepest reached ${Math.abs(worst).toFixed(1)}%.`,
  ]
  if (winnerMedian != null) {
    parts.push(
      `That includes the ones that worked: of the ${winners.length} entries that ended profitable, the median still spent part of the hold ${Math.abs(
        winnerMedian
      ).toFixed(1)}% down, and one went ${Math.abs(winnerWorst).toFixed(
        1
      )}% down before recovering. A position sized so that ${Math.abs(winnerMedian).toFixed(
        1
      )}% is intolerable is one that gets closed at the bottom of half its own winners.`
    )
  }

  return {
    symbol,
    direction,
    medianAdversePct: median,
    worstDecilePct: deep,
    worstPct: worst,
    winnerMedianAdversePct: winnerMedian,
    winnerWorstPct: winnerWorst,
    entries: rows.length,
    headline,
    read: parts.join(' '),
    caveat:
      'Depth measured on intraday lows, so it is what the position actually reached rather than what it closed at. Leverage multiplies every figure here — at 10x a 4% adverse excursion is 40% of the stake. The last 250 entries are not a bound on the next 250.',
  }
}

// --- Time to recovery ------------------------------------------------------
// Once this went against you, how long did it take to get back?
//
// The drawdown read says how deep. This says how long, which is the question
// that actually decides whether a position gets held or closed at the worst
// possible moment. "It came back" is worth very little if it came back in
// forty sessions and the position was sized to be unbearable by session five.
//
// Measured from the moment the position first went a full ATR under water —
// not from entry — because that is the point a person starts asking the
// question. Recovery means price touching the entry level again, intraday,
// since that is when the position is genuinely back to flat.
export const RECOVERY_HORIZON = 60

export function recoveryRead({
  bars,
  symbol,
  atr,
  direction = 'long',
  lookback = 250,
  horizon = RECOVERY_HORIZON,
}) {
  if (!bars?.length || !atr || atr <= 0) return null
  const price = bars.at(-1).close
  if (!price) return null
  const thresholdPct = (atr * 100) / price

  const start = Math.max(0, bars.length - lookback - horizon)
  const durations = []
  let wentUnder = 0
  let neverBack = 0

  for (let i = start; i < bars.length - 1; i++) {
    const entry = bars[i].close
    if (!entry) continue
    const window = bars.slice(i + 1, i + 1 + horizon)
    if (window.length < horizon) continue

    // The first bar that CLOSED a full ATR under water.
    //
    // Deliberately the close and not the intraday low. Measuring the low made
    // half of BTC/USD's drawdowns recover in "0 sessions" — the same bar that
    // wicked an ATR down also traded back at the entry price before the bell.
    // That is real, and it is not a drawdown anybody holds through; it is
    // noise inside a session. The question this read exists to answer is about
    // positions that end a day under water.
    let sank = -1
    for (let k = 0; k < window.length; k++) {
      const adverse =
        direction === 'long'
          ? ((window[k].close - entry) * 100) / entry
          : ((entry - window[k].close) * 100) / entry
      if (adverse <= -thresholdPct) {
        sank = k
        break
      }
    }
    if (sank === -1) continue
    wentUnder++

    // From the NEXT session onward, the first bar that touches the entry level
    // again. Starting at `sank` itself would let a bar that closed under water
    // count as having recovered on the strength of its own high.
    let back = -1
    for (let k = sank + 1; k < window.length; k++) {
      const recovered = direction === 'long' ? window[k].high >= entry : window[k].low <= entry
      if (recovered) {
        back = k
        break
      }
    }
    if (back === -1) neverBack++
    else durations.push(back - sank)
  }

  if (!wentUnder) return null

  const sorted = [...durations].sort((a, b) => a - b)
  const median = quantile(sorted, 0.5)
  const p90 = quantile(sorted, 0.9)
  const neverPct = (neverBack / wentUnder) * 100

  const headline =
    durations.length === 0
      ? `Nothing that went a full daily range under recovered within ${horizon} sessions`
      : neverPct >= 25
      ? `${neverPct.toFixed(0)}% of drawdowns here never came back within ${horizon} sessions`
      : `Typically back to break-even ${median} session${median === 1 ? '' : 's'} after going under`

  const parts = [
    `Of the last ${lookback} entries, ${wentUnder} went at least one average daily range ($${atr.toFixed(
      2
    )}, ${thresholdPct.toFixed(1)}%) under water.`,
  ]
  if (durations.length) {
    parts.push(
      `From that moment, half were back to the entry price within ${median} session${
        median === 1 ? '' : 's'
      } and nine in ten within ${p90}.`
    )
  }
  parts.push(
    neverBack === 0
      ? `Every one of them got back to break-even inside ${horizon} sessions.`
      : `${neverBack} of ${wentUnder} (${neverPct.toFixed(
          0
        )}%) had still not returned to the entry price ${horizon} sessions later — the case where "it comes back" stops being true on any timescale a position can be held at leverage.`
  )

  return {
    symbol,
    direction,
    horizon,
    thresholdPct,
    wentUnder,
    recovered: durations.length,
    neverRecovered: neverBack,
    neverRecoveredPct: neverPct,
    medianSessions: median,
    p90Sessions: p90,
    headline,
    read: parts.join(' '),
    caveat: `Recovery is price touching the entry level again intraday, measured from the first bar a full ATR under rather than from entry. It counts sessions, not calendar days, and ignores funding — a leveraged position carries a cost every day it waits, so waiting out a drawdown is not free even when price does come back.`,
  }
}
