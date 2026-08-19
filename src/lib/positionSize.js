import { money } from './format.js'

// Arithmetic, not advice.
//
// Everything measured on the risk page is stated per unit — a stop is "1.5
// ATR", a drawdown is "4.2%", a ceiling is "5x". Those are the right units for
// comparing eighty-nine instruments and the wrong units for taking a position,
// because nobody trades in ATRs. Converting them into a share count needs two
// numbers the site does not have and must never assume: how much money is at
// stake, and how much of it the person is willing to lose on one idea.
//
// So both are typed in. This module is the multiplication that follows, plus
// the two independently-measured ceilings the result runs into. It picks no
// direction, proposes no risk budget, and has no opinion on whether the trade
// is a good one — given a stake and a tolerance, it reports what those imply
// and where the instrument's own history says they stop being expressible.
//
// The split is the same one the rest of the site runs on: the user supplies
// the intent, the site supplies the measurement.

export const CEILINGS = {
  // Above this the instrument's own recent history has already taken a
  // position of this size to zero. See riskRead().
  survivable: 'survivable size',
  // Above this the order is a meaningful share of a quiet session's flow, so
  // the price used to compute it is not a price that will be available. See
  // liquidityRead().
  liquidity: 'quiet-session liquidity',
  // A position larger than the account is a position on margin, which is a
  // separate decision from the risk budget and should be a deliberate one.
  unlevered: 'account equity',
}

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// The distance a stop sits from entry, in dollars and as a share of price.
//
// Kept separate because it is the only part of the calculation that is a
// measurement rather than user arithmetic: the multiple comes from stopRead(),
// which counted how often each distance fired and how many winners it cut.
export function stopDistance({ price, atr, atrMultiple }) {
  const p = finite(price)
  const a = finite(atr)
  const m = finite(atrMultiple)
  if (!p || a == null || m == null || a <= 0 || m <= 0) return null
  const dollars = a * m
  if (dollars >= p) return { dollars, pct: (dollars / p) * 100, belowZero: true }
  return { dollars, pct: (dollars / p) * 100, belowZero: false }
}

// What a stated stake and a stated tolerance work out to.
//
// `riskPct` is the share of the account the person has decided to lose if the
// stop fires — their number, never one this site suggests. Everything else is
// consequence.
export function positionSize({
  equity,
  riskPct,
  price,
  atr,
  atrMultiple,
  safeLeverage = null,
  absorbable = null,
}) {
  const eq = finite(equity)
  const risk = finite(riskPct)
  const p = finite(price)
  const stop = stopDistance({ price: p, atr, atrMultiple })

  if (!eq || eq <= 0 || risk == null || risk <= 0 || !p || p <= 0 || !stop) return null
  // A stop further from entry than the price itself cannot be placed: the
  // instrument would have to go below zero to reach it. Real for a low-priced
  // name in a volatile stretch, and the arithmetic below would silently return
  // a nonsense share count rather than saying so.
  if (stop.belowZero) {
    return {
      impossible: 'stop-below-zero',
      stop,
      read: `A ${atrMultiple} ATR stop sits ${stop.pct.toFixed(0)}% below the current price, which is further than the price itself. There is no share count that expresses this: the stop cannot be placed.`,
    }
  }

  const riskDollars = eq * (risk / 100)
  const shares = riskDollars / stop.dollars
  const notional = shares * p
  const leverage = notional / eq

  // Each ceiling is a size cap in dollars, measured somewhere else on the site
  // and arrived at independently. The binding one is whichever is smallest —
  // not because it is the right size, but because the arithmetic above stops
  // describing anything real above it.
  const caps = []
  const lev = finite(safeLeverage)
  if (lev != null && lev > 0) caps.push({ key: 'survivable', label: CEILINGS.survivable, dollars: lev * eq })
  const liq = finite(absorbable)
  if (liq != null && liq > 0) caps.push({ key: 'liquidity', label: CEILINGS.liquidity, dollars: liq })
  caps.push({ key: 'unlevered', label: CEILINGS.unlevered, dollars: eq })

  const exceeded = caps.filter((c) => notional > c.dollars).sort((a, b) => a.dollars - b.dollars)
  const binding = exceeded[0] ?? null

  return {
    equity: eq,
    riskPct: risk,
    riskDollars,
    price: p,
    stop,
    shares,
    notional,
    leverage,
    caps: caps.sort((a, b) => a.dollars - b.dollars),
    binding,
    // The size the binding ceiling allows, so the number is actionable rather
    // than just a warning. Still not a recommendation — it is the largest
    // position that does not contradict one of the site's own measurements.
    cappedShares: binding ? binding.dollars / p : null,
    cappedRiskDollars: binding ? (binding.dollars / p) * stop.dollars : null,
  }
}

// A share count reads as a count, so it is grouped and only carries decimals
// where a fractional share is the whole answer.
const shares = (n) => (n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString())

// One sentence per fact, in the order someone reads them: what it costs to be
// wrong, how big that makes the position, and what it collides with.
export function sizingRead(result, { symbol, atrMultiple } = {}) {
  if (!result) return null
  if (result.impossible) return result.read

  const parts = [
    `Losing ${result.riskPct}% of the account on this idea is ${money(result.riskDollars)}. A ${atrMultiple} ATR stop sits ${money(result.stop.dollars, 2)} from entry — ${result.stop.pct.toFixed(1)}% of price — so that budget buys ${shares(result.shares)} ${result.shares === 1 ? 'share' : 'shares'}, a position of ${money(result.notional)}.`,
  ]

  if (result.leverage > 1) {
    parts.push(`That is ${result.leverage.toFixed(2)}x the account, so it is a margin position rather than a cash one.`)
  } else {
    parts.push(`That is ${(result.leverage * 100).toFixed(0)}% of the account, unlevered.`)
  }

  if (result.binding) {
    const cappedShares = result.cappedShares
    parts.push(
      `It runs into ${result.binding.label} first, which tops out at ${money(result.binding.dollars)} — about ${shares(cappedShares)} shares${symbol ? ` of ${symbol}` : ''}. Holding the stop where it is, that size risks ${money(result.cappedRiskDollars)} rather than ${money(result.riskDollars)}.`
    )
  } else {
    parts.push('It clears every ceiling this site measures — the size this instrument has survived, what a quiet session absorbs, and the account itself.')
  }

  return parts.join(' ')
}
