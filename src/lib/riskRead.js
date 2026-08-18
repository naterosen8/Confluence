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
