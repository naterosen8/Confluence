import { rate } from './format.js'

// The site's verdict on itself, assembled from what it published.
//
// This is the product. Everything else here — eighty-nine tickers, eight
// chapters each, a glossary of seventy-six terms — is apparatus, and the
// apparatus exists to answer one question: does reading charts tell you which
// way price goes next. The answer has been no, in four independent ways, for
// months. That answer was buried on an inside page while a screener with
// verdict badges sat on the front door, which had it exactly backwards.
//
// Every figure below is read from the published files. None is written down.
// That is not tidiness — it is the whole basis for trusting the page. A verdict
// with a hardcoded number in it is an opinion that was true once, and this one
// has to be able to change: if the record ever does show an edge, this page is
// obliged to say so. It says what the data says, including if that stops being
// convenient.

// Four separate ways of asking, so that agreement between them means
// something. They use different data and can fail independently: the live
// record is calls published before the outcome was known, the correlation is
// measured across every scored day in the history, the base rates are per
// instrument, and the leaderboard asks whether the best of them survives
// having been selected.
export function selfCheck({ summary, screener }) {
  const checks = []

  const s = summary
  if (s?.resolvedCount && s.overall) {
    const c = s.clustered
    const gaps = [s.upGap, s.downGap].filter(Boolean)
    const anyDistinguishable = gaps.some((g) => g.distinguishable)
    checks.push({
      key: 'record',
      label: 'Calls published in advance',
      finding: `${rate(s.overall.winRate, 1)} across ${s.resolvedCount} resolved calls`,
      detail: c?.perEpisode
        ? `Logged automatically before the outcome was known and scored ${
            s.resolvedCount
          } times. The honest interval — computed across the ${c.days} days the calls were made on rather than pretending each call is a separate test — runs ${c.perEpisode.low.toFixed(
            0
          )}–${c.perEpisode.high.toFixed(0)}%.`
        : `Logged automatically before the outcome was known.`,
      verdict: anyDistinguishable ? 'found' : 'nothing',
    })

    for (const [key, gap, name] of [
      ['upGap', s.upGap, 'Upward-leaning calls'],
      ['downGap', s.downGap, 'Downward-leaning calls'],
    ]) {
      if (!gap) continue
      checks.push({
        key,
        label: name,
        finding: `${gap.points >= 0 ? '+' : '−'}${Math.abs(gap.points).toFixed(1)} points against drift`,
        detail: `Measured against the rate price moved that way anyway over the same windows — the only comparison that carries information. 95% interval ${gap.low.toFixed(
          1
        )} to ${gap.high.toFixed(1)}.`,
        verdict: gap.distinguishable ? 'found' : 'nothing',
      })
    }
  }

  const d = screener?.directionCheck
  if (d && d.meanCorr != null) {
    checks.push({
      key: 'correlation',
      label: 'Does a higher score mean a better return',
      finding: `correlation of ${d.meanCorr.toFixed(3)} across ${d.tickerCount} instruments`,
      detail: `Every scored day in the tracked history, score against what followed. 95% interval ${d.lower.toFixed(
        3
      )} to ${d.upper.toFixed(3)}. Zero would mean the score carries nothing.`,
      // A correlation this small is nothing whichever side of zero it lands.
      verdict: Math.abs(d.meanCorr) >= 0.1 ? 'found' : 'nothing',
    })
  }

  const rows = screener?.rows ?? []
  if (rows.length) {
    const distinguishable = rows.filter((r) => r.stat?.distinguishable)
    checks.push({
      key: 'baseRates',
      label: 'Instruments whose setups beat their own drift',
      finding: `${distinguishable.length} of ${rows.length}`,
      detail: `Each instrument's own base rate against its own drift, with the interval computed on the sample that is actually independent rather than on the raw count. Chance alone would produce about ${(
        rows.length * 0.05
      ).toFixed(0)}.`,
      verdict: distinguishable.length > rows.length * 0.05 ? 'found' : 'nothing',
    })
  }

  const lb = screener?.leaderboard
  if (lb?.testedCount) {
    checks.push({
      key: 'leaderboard',
      label: 'The strongest results, after correcting for having looked',
      finding: `${lb.survivorCount} of ${lb.testedCount} survive`,
      detail: `Ranking ${lb.testedCount} instruments by extremeness manufactures extreme numbers on its own, so the survivors are corrected for the number of tests. Surviving means unlikely to be pure selection — not that it predicts anything.`,
      verdict: lb.survivorCount > lb.testedCount * 0.05 ? 'found' : 'nothing',
    })
  }

  const found = checks.filter((c) => c.verdict === 'found')
  // Four sources, more rows than that: the published record contributes three
  // (overall, and the two directions split out) because a hit rate and a gap
  // against drift are different claims. Counted rather than written, so the
  // copy cannot drift from what is on screen.
  const sources = new Set(checks.map((c) => (['record', 'upGap', 'downGap'].includes(c.key) ? 'record' : c.key)))
  return {
    checks,
    sourceCount: sources.size,
    foundCount: found.length,
    // The headline the page leads with, and it is allowed to change. If the
    // measurements ever start disagreeing with each other, that is the
    // interesting state and this says so rather than smoothing it over.
    conclusion:
      checks.length === 0
        ? 'unmeasured'
        : found.length === 0
        ? 'nothing'
        : found.length === checks.length
        ? 'something'
        : 'mixed',
  }
}

export const CONCLUSION_HEADLINE = {
  nothing: 'None of it predicts which way price goes',
  mixed: 'The measurements disagree with each other',
  something: 'Every measurement here now finds an edge — read them before believing it',
  unmeasured: 'Nothing has been measured yet',
}

export const CONCLUSION_BLURB = {
  nothing:
    'Several independent ways of asking, none of them finding anything. That is the most useful thing this site knows, and it is the reason it will not tell you what to buy.',
  mixed:
    'Some of these find something and some do not. That is a state worth looking at closely rather than summarising — the disagreement is the information, and it usually means one of the measurements is asking a different question than it appears to.',
  something:
    'This is the outcome the site was built to be able to report and has never reported. Treat it with more suspicion than the alternative, not less: check what changed in the data before you check what it might be worth.',
  unmeasured: 'The daily job has not produced enough resolved calls to say anything yet.',
}
