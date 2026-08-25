// Uncertainty quantification for the base rates this app reports.
//
// The motivating problem: a 60% win rate over 10 occurrences and a 60% win
// rate over 400 occurrences are wildly different claims, and printing both as
// "60%" hides that completely. Worse, the first one is statistically
// indistinguishable from a coin flip — its confidence interval comfortably
// contains 50% — so presenting it as an edge is not a rounding error, it is
// the wrong conclusion.
//
// The honest move is not to assert confidence but to measure it, and to say
// plainly when a sample cannot support any conclusion at all.

// z for a two-sided normal interval at common confidence levels.
const Z = { 0.9: 1.6448536269514722, 0.95: 1.959963984540054, 0.99: 2.5758293035489004 }

// Wilson score interval. Chosen over the textbook normal approximation
// (p ± z·sqrt(p(1-p)/n)) because that one is badly behaved exactly where this
// app lives: small n, and proportions near 0 or 1, where it happily produces
// bounds below 0% or above 100%. Wilson stays inside [0,1] and keeps roughly
// nominal coverage down to single-digit samples.
export function wilsonInterval(successes, total, confidence = 0.95) {
  if (!total || total <= 0) return null
  const z = Z[confidence] ?? Z[0.95]
  const p = successes / total
  const z2 = z * z
  const denom = 1 + z2 / total
  const center = (p + z2 / (2 * total)) / denom
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))
  return {
    point: p,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    confidence,
    total,
  }
}

// The question that actually matters for a win rate: given this sample, can
// we distinguish it from a coin flip at all? If the interval contains 0.5,
// the honest answer is no — regardless of how far the point estimate sits
// from 50%.
export function distinguishableFromChance(successes, total, confidence = 0.95) {
  const ci = wilsonInterval(successes, total, confidence)
  if (!ci) return null
  const containsHalf = ci.lower <= 0.5 && ci.upper >= 0.5
  return {
    ...ci,
    distinguishable: !containsHalf,
    direction: ci.lower > 0.5 ? 'above' : ci.upper < 0.5 ? 'below' : 'inconclusive',
  }
}

// The difference between two proportions, with an interval on the difference
// itself.
//
// This exists because the site's headline test was against the wrong null. A
// hit rate is compared to 50%, as though the alternative to skill were a coin
// flip. It is not. Over a rising market "price went up" is true most of the
// time regardless of what any call said, so the thing an upward-leaning call
// has to beat is the drift, not chance. A 54% hit rate against 54% drift is
// exactly zero skill while clearing a coin-flip test looks like a pass.
//
// So the figure that carries the information is the gap, and a gap needs its
// own interval — the difference of two point estimates is noisier than either
// of them, and eyeballing whether two overlapping intervals "look different"
// is a well-known way to get this wrong in both directions.
//
// Newcombe's hybrid-score method: build a Wilson interval for each proportion
// and combine the bounds. Chosen over a normal approximation on the difference
// for the same reason Wilson is used above — it behaves at small n, which is
// the only regime this record has ever been in.
export function differenceInterval(k1, n1, k2, n2, confidence = 0.95) {
  const a = wilsonInterval(k1, n1, confidence)
  const b = wilsonInterval(k2, n2, confidence)
  if (!a || !b) return null
  const point = a.point - b.point
  const lower = point - Math.sqrt((a.point - a.lower) ** 2 + (b.upper - b.point) ** 2)
  const upper = point + Math.sqrt((a.upper - a.point) ** 2 + (b.point - b.lower) ** 2)
  return {
    point,
    lower: Math.max(-1, lower),
    upper: Math.min(1, upper),
    confidence,
    // If the interval spans zero, the honest reading is that no difference has
    // been demonstrated — however far apart the two point estimates look.
    distinguishable: lower > 0 || upper < 0,
  }
}

// How many independent occurrences would be needed before a win rate this far
// from 50% could be distinguished from chance. Answers "how much more data
// would settle this?" instead of leaving a thin sample looking merely
// unlucky. Returns null when the observed rate is 50% (no effect to detect).
export function sampleSizeToDistinguish(observedRate, confidence = 0.95) {
  const effect = Math.abs(observedRate - 0.5)
  if (effect < 1e-9) return null
  // A rate of exactly 0 or 1 has no usable variance to estimate from — the
  // formula's p(1-p) term goes to zero and it returns 0, which reads as "no
  // more data needed" when a flawless three-for-three is precisely the case
  // that needs the most. The sample cannot answer the question; saying so is
  // the honest return.
  if (observedRate <= 0 || observedRate >= 1) return null
  const z = Z[confidence] ?? Z[0.95]
  // Normal approximation is adequate here: this is a rough "order of
  // magnitude more data" figure, not a formal power calculation.
  const n = (z * z * observedRate * (1 - observedRate)) / (effect * effect)
  return Math.ceil(n)
}

// Occurrences whose forward windows overlap are not independent observations:
// a signal on Monday and one on Tuesday share four of their five forward
// sessions. Reporting N as though they were independent overstates the
// evidence, sometimes by a lot.
//
// This estimates the count of non-overlapping episodes by greedily walking
// the sorted occurrence indices and skipping any that begin before the
// previous one's window has closed. It is a conservative floor on the real
// independent count, not a precise correction — clustering is a property of
// the market, not of the arithmetic.
export function independentCount(indices, forwardDays) {
  if (!indices?.length) return 0
  const sorted = [...indices].sort((a, b) => a - b)
  let count = 0
  let freeFrom = -Infinity
  for (const i of sorted) {
    if (i >= freeFrom) {
      count++
      freeFrom = i + forwardDays
    }
  }
  return count
}

// Mean and standard error of a set of returns, plus whether the mean is
// distinguishable from zero. A positive average return over a handful of
// noisy observations usually is not.
// Two-tailed 95% t values by degrees of freedom, falling back to the normal
// limit past 30. A z-score on eleven observations understates the interval by
// about 14%, and — like every other error of this kind found here — it
// understates it in the direction that flatters whatever is being measured.
const T95 = [
  12.71, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086,
  2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
]

export function tValue(df, confidence = 0.95) {
  if (confidence !== 0.95 || df < 1) return Z[confidence] ?? Z[0.95]
  return df <= T95.length ? T95[df - 1] : Z[0.95]
}

export function meanWithInterval(values, confidence = 0.95) {
  const n = values.length
  if (n < 2) return null
  // t, not z: this is a mean of a sample whose variance is estimated from the
  // same sample, and n here is routinely in the low tens.
  const z = tValue(n - 1, confidence)
  const mean = values.reduce((a, b) => a + b, 0) / n
  // Sample variance (n-1): these returns are a sample, not the population.
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)
  const stderr = Math.sqrt(variance / n)
  const margin = z * stderr
  return {
    mean,
    stderr,
    lower: mean - margin,
    upper: mean + margin,
    distinguishableFromZero: mean - margin > 0 || mean + margin < 0,
    total: n,
  }
}
