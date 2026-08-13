// What the two macro proxies say when read together rather than added up.
//
// The macro layer scores rates and credit independently: long bonds up is +1,
// high-yield down is −1, and the pair nets to zero. That netting throws away
// the most informative configuration on the board. Bonds bid *while* credit is
// being sold is not an absence of signal — it is money leaving risk for safety
// in the same motion, and it is the one combination that reliably shows up
// before trouble rather than after it. Scored as +1 and −1 it reads "split".
//
// So this reads the pair as a quadrant. Two axes, four states, each of which
// means something different about the backdrop a position is held in:
//
//                       credit risk-on        credit risk-off
//   long bonds up       easing                flight to quality
//   long bonds down     reflation             tightening into stress
//
// TLT is the rates proxy (up = long yields falling) and HYG the credit proxy
// (up = spreads tightening). Both are ETFs, so both carry their own supply and
// duration quirks — they are proxies for the thing, not the thing.
//
// One taxonomy, two presentations: the screener's market read wants a sentence
// (`short`), the ticker page's confluence panel wants the paragraph (`read`).
// They were written separately once and drifted, which is how a site ends up
// telling a visitor two different things about the same two numbers.
//
// Strictly a claim about now: 60 sessions of realised moves in two funds. It
// says what the backdrop has been doing, not what it will do next, and it is
// deliberately silent on what any of it implies for a specific ticker.

// Below this the move is inside the noise of an ETF's own drift, and the
// quadrant it nominally sits in should not be read as a statement.
export const FLAT = 1.5

const CAVEAT =
  'TLT and HYG are proxies for rates and credit, not measurements of them — each carries its own duration, supply and fund-flow effects. Sixty sessions of realised moves, and nothing here forecasts the next sixty.'

const label = (v) => `${Math.abs(v).toFixed(1)}%`

const QUADRANTS = {
  'up-up': {
    key: 'easing',
    headline: 'Both macro proxies point the same way: easing',
    short: 'Long bonds and high-yield credit are both up over 60 sessions: conditions easing, risk appetite present.',
    read: (r, c, n) =>
      `Long bonds up ${label(r)} and high-yield credit up ${label(c)} over ${n} sessions. Falling long rates and tightening spreads at the same time is the backdrop that historically carries risk assets — money is both cheaper and being lent more freely. It is also the configuration most exposed to a single inflation print, because it is priced on rates staying down.`,
  },
  'up-down': {
    key: 'flight-to-quality',
    headline: 'Bonds bid while credit is sold — a flight to quality',
    short:
      'Long bonds up while credit is down — money getting cheaper but appetite for risk not following, which is the shape of a flight to quality.',
    read: (r, c, n) =>
      `Long bonds up ${label(r)} while high-yield credit fell ${label(c)} over ${n} sessions. These two usually move together; when they separate this way it is money leaving risk for safety rather than rates easing on their own. A score that adds +1 and −1 nets this to neutral, which is the one place a score actively misleads — this is the least comfortable of the four states, not the middle of them.`,
  },
  'down-up': {
    key: 'reflation',
    headline: 'Rates rising, and credit taking it in stride',
    short:
      'Credit up while long bonds are down — risk appetite present despite rates rising, which is a late-cycle combination as often as an early one.',
    read: (r, c, n) =>
      `Long bonds down ${label(r)} — long yields rising — while high-yield credit rose ${label(c)} over ${n} sessions. Credit absorbing higher rates without widening is what growth-driven tightening looks like, as opposed to the kind that breaks something. Rising discount rates still weigh hardest on whatever is valued furthest out in time.`,
  },
  'down-down': {
    key: 'tightening',
    headline: 'Rates rising and credit widening together',
    short:
      'Long bonds and high-yield credit are both down over 60 sessions: conditions tightening and risk appetite retreating together.',
    read: (r, c, n) =>
      `Long bonds down ${label(r)} and high-yield credit down ${label(c)} over ${n} sessions. Both proxies moving against risk at once is the most straightforwardly hostile of the four backdrops: money is getting more expensive and simultaneously harder to borrow. Nothing here is specific to any one ticker — it is the weather every position is being held in.`,
  },
}

// The shared taxonomy. Takes the two percentage changes and nothing else, so
// it can be called from anywhere that has them.
export function macroQuadrant({ ratesChangePct, creditChangePct, lookback = 60 }) {
  const r = ratesChangePct
  const c = creditChangePct
  if (r == null || c == null) return null

  if (Math.abs(r) < FLAT && Math.abs(c) < FLAT) {
    return {
      key: 'quiet',
      headline: 'Macro backdrop has barely moved',
      short: `Long bonds and high-yield credit have both moved less than ${FLAT}% over ${lookback} sessions — no macro story either way.`,
      read: `Long bonds ${r >= 0 ? 'up' : 'down'} ${label(r)} and high-yield credit ${c >= 0 ? 'up' : 'down'} ${label(c)} over ${lookback} sessions — both inside the range these funds drift through on their own. There is no macro story in this, and reading a direction into moves this small would be inventing one.`,
      note: null,
      ratesChangePct: r,
      creditChangePct: c,
      caveat: CAVEAT,
    }
  }

  const q = QUADRANTS[`${r >= 0 ? 'up' : 'down'}-${c >= 0 ? 'up' : 'down'}`]

  // A quadrant one of whose legs is inside the noise band is a real state, but
  // it is being carried by a single axis and should say so.
  const weakLeg = Math.abs(r) < FLAT ? 'rates' : Math.abs(c) < FLAT ? 'credit' : null

  return {
    key: q.key,
    headline: q.headline,
    short: q.short,
    read: q.read(r, c, lookback),
    note: weakLeg
      ? `The ${weakLeg} leg of this is small enough to be drift — the reading is effectively being carried by the other one.`
      : null,
    ratesChangePct: r,
    creditChangePct: c,
    caveat: CAVEAT,
  }
}

// The reverse adapter: rebuild the confluence panel's macro *layer* from a
// quadrant computed at sync time.
//
// The panel used to build the layer itself from getSeries('TLT') and
// getSeries('HYG'), which silently returns a generated random walk for any
// symbol whose bars are not loaded — and the ticker page loads only its own
// ticker plus SPY. So every ticker page was reporting mock percentages as
// measured macro conditions. Reading the pair from the index the sync already
// writes fixes that at zero payload cost: it is the same two numbers on every
// page, so downloading two more full histories per visit to recover them
// would be paying ~190KB for something already in hand.
const LEAN_BY_QUADRANT = {
  easing: 'points up',
  tightening: 'points down',
  'flight-to-quality': 'leans down',
  reflation: 'leans up',
  quiet: 'split',
}

export function macroLayerFromQuadrant(q) {
  if (!q || q.ratesChangePct == null || q.creditChangePct == null) return null
  const r = q.ratesChangePct
  const c = q.creditChangePct
  return {
    available: true,
    score: (r > 0 ? 1 : -1) + (c > 0 ? 1 : -1),
    lean: LEAN_BY_QUADRANT[q.key] ?? 'split',
    reasons: [
      {
        direction: r > 0 ? 'up' : 'down',
        text:
          r > 0
            ? `Long bonds up ${label(r)} over 60 sessions — long rates falling, conditions easing`
            : `Long bonds down ${label(r)} over 60 sessions — long rates rising, conditions tightening`,
      },
      {
        direction: c > 0 ? 'up' : 'down',
        text:
          c > 0
            ? `High-yield credit up ${label(c)} — spreads tightening, risk appetite present`
            : `High-yield credit down ${label(c)} — spreads widening, liquidity retreating`,
      },
    ],
    rates: { changePct: r },
    credit: { changePct: c },
  }
}

// Adapter for the confluence panel, which holds the macro layer rather than
// the raw percentages.
export function macroRead({ macro, lookback = 60 }) {
  if (!macro?.available) return null
  const rates = macro.rates
  const credit = macro.credit

  // One proxy alone cannot make a quadrant, and half of one is not a read.
  if (!rates || !credit) {
    const only = rates ?? credit
    if (!only) return null
    return {
      key: 'partial',
      headline: 'Only half the macro picture has synced',
      read: `${rates ? 'Long bonds' : 'High-yield credit'} moved ${only.changePct >= 0 ? 'up' : 'down'} ${label(
        only.changePct
      )} over ${lookback} sessions, but the other proxy has not synced. Rates and credit are only worth reading against each other — either one alone is as likely to mislead as inform, so this is reported and left there.`,
      note: null,
      caveat: CAVEAT,
    }
  }

  return macroQuadrant({ ratesChangePct: rates.changePct, creditChangePct: credit.changePct, lookback })
}
