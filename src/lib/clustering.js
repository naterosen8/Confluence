import { meanWithInterval, wilsonInterval, independentCount } from './stats.js'

// How much of the record is actually independent evidence.
//
// The track record says "260 resolved calls" and puts a 95% interval of
// 43.6–55.7% underneath it. Both numbers are arithmetically correct and the
// second one is wrong, because the interval assumes 260 independent
// observations and the record does not contain anything like that many.
//
// Those 260 calls were made on ten distinct days. Seventy-four of them fired
// on one date. Every call made on the same session is scored over the same
// five sessions of the same market, so they do not fail independently — if
// that week went up, the upward-leaning calls made that morning are right
// together, and the number of them says more about how many tickers the site
// tracks than about how many times the method was tested. Worse, the forward
// windows overlap: at five sessions, ten call dates spread over three weeks
// contain about two non-overlapping episodes.
//
// This is the same class of error the site already corrected twice — testing
// against the wrong null, then finding the same mistake in three places. An
// interval built on an N that is not really N overstates confidence in exactly
// the direction that flatters the site, so it is worth the same treatment:
// compute the honest one, publish it as the headline, and keep the flattering
// one visible beside it so the difference is the thing people see.

// Treating each call date as one observation is the conservative, standard
// remedy for clustered data, and it is the one that can be explained in a
// sentence: score each day, then ask how much the days disagree. It gives up
// some power — a day with two calls counts the same as a day with seventy-four
// — and that is the right trade when the alternative is a confidence claim the
// data cannot support.
export function byEpisode(entries, { forwardDays = 5 } = {}) {
  const days = new Map()
  for (const e of entries) {
    if (!e?.date) continue
    if (!days.has(e.date)) days.set(e.date, [])
    days.get(e.date).push(e)
  }
  const dates = [...days.keys()].sort()
  return {
    dates,
    // Indices into the sorted date list, so overlapping windows can be counted
    // in sessions rather than in calendar days.
    independentEpisodes: independentCount(
      dates.map((_, i) => i),
      forwardDays
    ),
    episodes: dates.map((date) => {
      const calls = days.get(date)
      const hits = calls.filter((e) => e.outcome?.correct).length
      return { date, calls: calls.length, hits, rate: (hits / calls.length) * 100 }
    }),
  }
}

// Both readings of the same record, side by side.
//
// `perCall` is what the page published before: every call its own observation.
// `perEpisode` is the mean of the daily rates with an interval on that mean —
// the honest one. The ratio between their widths is the size of the overstatement.
export function clusteredRate(entries, { forwardDays = 5 } = {}) {
  const decidable = entries.filter((e) => e?.outcome && e.outcome.correct !== null)
  if (!decidable.length) return null

  const hits = decidable.filter((e) => e.outcome.correct).length
  const per = wilsonInterval(hits, decidable.length)
  const { dates, episodes, independentEpisodes } = byEpisode(decidable, { forwardDays })

  // One day of calls cannot disagree with itself, so there is no spread to put
  // an interval on. Reported as absent rather than as a suspiciously tight
  // range around a single number.
  const mean = episodes.length >= 2 ? meanWithInterval(episodes.map((e) => e.rate)) : null

  // Naming a number and then not using it is how the last wrong-N survived, so
  // this says outright which one the interval is built on. It is `days`, not
  // `independentEpisodes`: with three episodes there is no spread worth an
  // interval, and a range computed on three points would be so wide it stops
  // carrying information at all. Days is the conservative reading that still
  // says something — and it is still not the floor, because consecutive call
  // dates share most of their forward window. The prose says so.
  return {
    total: decidable.length,
    hits,
    days: dates.length,
    independentEpisodes,
    intervalBasis: 'days',
    episodes,
    perCall: {
      rate: (hits / decidable.length) * 100,
      low: per ? per.lower * 100 : null,
      high: per ? per.upper * 100 : null,
      n: decidable.length,
    },
    perEpisode: mean
      ? { rate: mean.mean, low: mean.lower, high: mean.upper, n: episodes.length }
      : null,
    // The largest single day, because "260 calls" reads very differently once
    // you know that one session contributed a quarter of them.
    largestDay: episodes.reduce((a, b) => (b.calls > (a?.calls ?? 0) ? b : a), null),
  }
}

// How much narrower the naive interval is than the honest one, as a multiple.
export function overstatement(clustered) {
  if (!clustered?.perEpisode || clustered.perCall.low == null) return null
  const naive = clustered.perCall.high - clustered.perCall.low
  const honest = clustered.perEpisode.high - clustered.perEpisode.low
  if (!(naive > 0) || !(honest > 0)) return null
  return honest / naive
}

export function clusterRead(clustered) {
  if (!clustered) return null
  const { total, days, independentEpisodes, perCall, perEpisode, largestDay } = clustered

  const parts = [
    `${total} resolved call${total === 1 ? '' : 's'}, made on ${days} distinct ${days === 1 ? 'day' : 'days'}.`,
  ]

  if (largestDay && days > 1) {
    parts.push(
      `${largestDay.calls} of them fired on ${largestDay.date} alone — every call made on one session is scored over the same five sessions of the same market, so those are not ${largestDay.calls} separate tests of anything.`
    )
  }

  parts.push(
    `At a five-session hold, those ${days} dates contain about ${independentEpisodes} non-overlapping ${independentEpisodes === 1 ? 'episode' : 'episodes'} — the range below is computed across the ${days} days rather than the ${independentEpisodes}, so it is still not the widest honest reading, only a much better one than per call.`
  )

  if (perEpisode) {
    const factor = overstatement(clustered)
    parts.push(
      `Scored per call the range is ${perCall.low.toFixed(1)}–${perCall.high.toFixed(1)}%; scored per day, which is closer to how the evidence actually arrives, it is ${perEpisode.low.toFixed(1)}–${perEpisode.high.toFixed(1)}%${factor ? ` — ${factor.toFixed(1)} times wider` : ''}. The second one is the honest one, and it is the reason this page does not claim to have measured anything yet.`
    )
  }

  return parts.join(' ')
}
