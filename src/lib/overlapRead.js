import { pairsWithin, effectiveBets, clusters, SAME_BET, CORRELATION_LOOKBACK } from './correlation.js'

// The basket read, in words.
//
// The measurement lives in correlation.js and stays pure arithmetic. This is
// the sentence someone actually reads, and it says one thing: how many
// separate decisions the list in front of them amounts to.
//
// It is a description of what these instruments have done together over the
// last few months. It does not say to hold fewer of them, or which to drop,
// or what to hold instead — those are portfolio decisions and the site does
// not make those. It says what the basket has been.

// Where the count stops being a technicality and starts being the point. A
// basket carrying two-thirds the independence of its name count is ordinary;
// one carrying a third of it is a single position with extra tickets.
const CONCENTRATED = 0.5
const DIVERSE = 0.75

export function overlapRead({ matrix, symbols, lookback = CORRELATION_LOOKBACK, threshold = SAME_BET }) {
  if (!matrix?.symbols?.length) return null
  const held = [...new Set(symbols ?? [])].filter((s) => matrix.symbols.includes(s))
  const missing = [...new Set(symbols ?? [])].filter((s) => !matrix.symbols.includes(s))

  if (held.length < 2) {
    return {
      count: held.length,
      held,
      missing,
      headline: held.length === 1 ? 'One name — nothing to overlap' : 'Nothing selected',
      read:
        held.length === 1
          ? 'Overlap is a property of a basket. With one name there is nothing for it to be correlated with, and the risk figures on its own page describe it completely.'
          : 'Star a few names on the screener, or pick a set below, and this measures how much of the resulting basket is the same bet.',
      pairs: [],
      groups: held.map((s) => ({ members: [s], meanCorrelation: null })),
    }
  }

  const pairs = pairsWithin(matrix, held)
  const rs = pairs.map((p) => p.r)
  const k = effectiveBets(rs, held.length)
  const groups = clusters(matrix, held, threshold)
  const mean = rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null
  const ratio = k == null ? null : k / held.length

  const strongest = pairs[0] ?? null
  const weakest = pairs.at(-1) ?? null
  const blocks = groups.filter((g) => g.members.length > 1)

  const headline =
    k == null
      ? `${held.length} names, not enough shared history to measure`
      : `${held.length} names, about ${k.toFixed(1)} independent ${k.toFixed(1) === '1.0' ? 'bet' : 'bets'}`

  const parts = []
  if (k != null) {
    const tone = ratio <= CONCENTRATED ? 'concentrated' : ratio >= DIVERSE ? 'diverse' : 'partial'
    if (tone === 'concentrated') {
      parts.push(
        `These ${held.length} move together closely enough that holding all of them carries roughly the risk of ${k.toFixed(1)} separate positions, not ${held.length}. Splitting a stake across them spreads the ticket, not the exposure.`
      )
    } else if (tone === 'diverse') {
      parts.push(
        `These ${held.length} have mostly moved on their own: the basket carries about ${k.toFixed(1)} positions' worth of independent risk, close to the ${held.length} it looks like.`
      )
    } else {
      parts.push(
        `These ${held.length} share a meaningful amount of their movement — the basket behaves like about ${k.toFixed(1)} independent positions rather than ${held.length}.`
      )
    }
    parts.push(
      `Average pairwise correlation over the last ${lookback} sessions is ${mean.toFixed(2)}${strongest ? `, ranging from ${weakest.r.toFixed(2)} (${weakest.a}/${weakest.b}) to ${strongest.r.toFixed(2)} (${strongest.a}/${strongest.b})` : ''}.`
    )
  } else {
    parts.push(
      `Fewer than the minimum shared sessions between these names, so no correlation can be computed. Usually this means one of them is newly listed.`
    )
  }

  if (blocks.length) {
    parts.push(
      `At the ${threshold.toFixed(2)} threshold, ${blocks.length === 1 ? 'one group moves' : `${blocks.length} groups move`} as a unit: ` +
        blocks.map((g) => `${g.members.join(', ')} (mean ${g.meanCorrelation.toFixed(2)})`).join('; ') +
        '.'
    )
  } else if (k != null) {
    parts.push(`No pair clears the ${threshold.toFixed(2)} threshold, so nothing here is close enough to call the same bet outright.`)
  }

  if (missing.length) {
    parts.push(`Not measured: ${missing.join(', ')} — no bar history synced for ${missing.length === 1 ? 'it' : 'them'}.`)
  }

  return {
    count: held.length,
    held,
    missing,
    effectiveBets: k,
    ratio,
    meanCorrelation: mean,
    pairs,
    groups,
    blocks,
    threshold,
    lookback,
    headline,
    read: parts.join(' '),
    // Directional tone for the panel border only — concentrated is the state
    // worth noticing, and it is a fact about the basket, not a judgement about
    // whether to hold it.
    tone: ratio == null ? null : ratio <= CONCENTRATED ? 'critical' : ratio >= DIVERSE ? 'wide' : 'moderate',
    caveat: `Correlation of daily closes over the last ${lookback} sessions, on the dates each pair actually shared. It measures direction only — equal risk weights, so a position held at several times the size of the others is more concentrated than this says. Correlations change, and they change fastest in the sessions where they matter most: things that normally move apart tend to fall together.`,
  }
}
