import { LEVERAGE_RUNGS, LOOKBACK_LONG } from './riskRead.js'

// The same measurements, in words someone can read without a vocabulary.
//
// The site's reads are careful and dense — "a stop 1.5 ATR away was hit on 28%
// of the last 500 entries" is exactly right and means nothing to a person who
// has never met an ATR. That is fine on a risk chapter someone chose to open.
// It is not fine on the first screen, which is where the person who most needs
// these numbers gives up.
//
// Simplifying is where a site like this would normally start lying, so the one
// rule is stated up front: **plainer wording, identical claim.** Every sentence
// below still describes what already happened to this instrument. None of them
// tells anyone what to do.
//
// The trap is specific and worth naming, because the first draft of this file
// fell into it. "Don't go above 3x" reads beautifully and is a recommendation
// about size, which this site does not make. "At 3x or more, this has already
// wiped out a position" says the same thing, is the same length, and is a fact.
// Wherever the two forms competed, the second one won.

// Roughly how long the measured window is, in words. Two years of sessions is
// a number people can weigh; "500 entries" is not.
function windowInWords(entries) {
  if (!entries) return 'its recent history'
  const years = entries / 252
  if (years >= 1.6) return `the last ${Math.round(years)} years`
  if (years >= 0.8) return 'the last year or so'
  return `the last ${Math.round(entries / 21)} months`
}

// How big is too big — the number most likely to save someone money, so it
// goes first.
export function plainSize(risk) {
  if (!risk || risk.safeLeverage == null) return null
  const window = windowInWords(risk.entries)
  const x = risk.safeLeverage
  // The next size actually tested, not x + 1. Sizes are measured at set rungs
  // — 1, 2, 3, 5, 10 and up — so a survivable 5x means the next thing known to
  // have failed is 10x. Saying "at 6x" would be inventing a measurement of a
  // size nobody checked.
  const nextTested = LEVERAGE_RUNGS.find((r) => r > x) ?? null
  return {
    key: 'size',
    // Descriptive, not directive. See the note at the top of this file.
    headline: nextTested
      ? `At ${nextTested}x, this has already wiped out a position`
      : `Nothing this site tested was big enough to be wiped out`,
    body: nextTested
      ? `Over ${window} there was a week bad enough to take a ${nextTested}x position to zero. Anything up to ${x}x came through every week measured. That is not a prediction — it already happened.`
      : `Over ${window}, every size tested came through. The largest tested is ${x}x.`,
    figure: `${x}x`,
    label: 'Biggest size that survived',
  }
}

// What holding it feels like, which a win rate cannot say.
export function plainDrawdown(drawdown) {
  if (!drawdown || drawdown.medianAdversePct == null) return null
  const typical = Math.abs(drawdown.medianAdversePct)
  const worst = drawdown.worstPct != null ? Math.abs(drawdown.worstPct) : null
  return {
    key: 'drawdown',
    headline: `Expect to be down about ${typical.toFixed(0)}% at some point`,
    body: `That is the middle of the range: half the time it went further against you than that before the week was out.${
      worst ? ` The worst went ${worst.toFixed(0)}% down.` : ''
    } If being ${typical.toFixed(0)}% down would make you sell, this is the size where that happens.`,
    figure: `${typical.toFixed(1)}%`,
    label: 'Typical dip while you hold',
  }
}

// And whether it comes back, which is the question people do not think to ask
// until they are already waiting.
export function plainRecovery(recovery) {
  if (!recovery || recovery.medianSessions == null) return null
  const never = recovery.neverRecoveredPct
  const days = recovery.medianSessions
  return {
    key: 'recovery',
    headline:
      never >= 25
        ? `${never.toFixed(0)}% of the time it never came back`
        : `It usually gets back to where you bought within ${days} day${days === 1 ? '' : 's'}`,
    body:
      never >= 25
        ? `When this fell far enough to hurt, ${never.toFixed(
            0
          )}% of the time it had still not returned to the buying price three months later. The rest took about ${days} day${
            days === 1 ? '' : 's'
          }. Waiting it out is not free if you are borrowing to hold it.`
        : `When it fell far enough to hurt, it took about ${days} day${
            days === 1 ? '' : 's'
          } to get back — but ${never.toFixed(0)}% of the time it still had not, three months on.`,
    figure: never >= 25 ? `${never.toFixed(0)}%` : `${days}d`,
    label: never >= 25 ? 'Never recovered' : 'Usually back within',
  }
}

// Whether you could get out at the price on the screen. Only worth saying when
// the answer is no — for a mega-cap it is noise.
export function plainLiquidity(liquidity) {
  if (!liquidity?.reported || !liquidity.thin) return null
  return {
    key: 'liquidity',
    headline: 'This one is thinly traded',
    body: `Not much of it changes hands on a normal day, so a real position is a noticeable share of the trading — and the price you see is not necessarily the price you would get out at.`,
    figure: null,
    label: null,
  }
}

// The three or four things worth telling someone before they buy, in the order
// that decides whether they keep their money.
export function plainRisks({ risk, drawdown, recovery, liquidity }) {
  return [plainSize(risk), plainDrawdown(drawdown), plainRecovery(recovery), plainLiquidity(liquidity)].filter(Boolean)
}

export { LOOKBACK_LONG }
