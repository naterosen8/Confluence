import { money, pct } from './format.js'

// A fixed amount put in on a fixed schedule, replayed against real closes.
//
// The version of this everyone has seen elsewhere picks one start date and
// prints one sentence: "$5 a week for five years turned $1,305 into $2,487."
// That sentence is true and nearly uninformative, because the start date is
// doing most of the work and the reader never sees the others. So this returns
// the one path someone asked about AND every other start date the same window
// fits into, and says how few of those are actually separate stretches of
// history.
//
// Nothing here picks the window, the amount or the instrument. The reader does.

const DAY_MS = 86_400_000

function dayOf(date) {
  return Date.parse(`${date}T00:00:00Z`)
}

// The same calendar date `years` earlier. Calendar years rather than 365-day
// blocks so "two years" ends on the date a person would say it does.
function yearsBefore(date, years) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() - years)
  return d.getTime()
}

function yearsAfter(date, years) {
  return yearsBefore(date, -years)
}

// Whole years of history the bars cover. A window the history does not reach
// back to is not offered: stretching a two-year window over the data you have
// and calling it five would be the most flattering possible mislabel.
export function yearsAvailable(bars) {
  if (!bars?.length) return 0
  const first = dayOf(bars[0].date)
  let years = 0
  while (yearsBefore(bars.at(-1).date, years + 1) >= first) years += 1
  return years
}

// Walks bars[from..to] putting `amount` in at the close on the first session
// on or after each scheduled date. The schedule steps from the previous
// scheduled date, not the previous fill, so a run of weekend or holiday gaps
// does not drift the whole calendar later.
export function replaySchedule(bars, from, to, amount, everyDays = 7) {
  let units = 0
  let invested = 0
  let nextDue = dayOf(bars[from].date)
  let fills = 0
  let low = null
  let underwater = 0
  const series = []

  for (let i = from; i <= to; i++) {
    const bar = bars[i]
    const t = dayOf(bar.date)
    if (t >= nextDue) {
      units += amount / bar.close
      invested += amount
      fills += 1
      while (nextDue <= t) nextDue += everyDays * DAY_MS
    }
    const value = units * bar.close
    const gap = value / invested - 1
    if (gap < 0) underwater += 1
    if (!low || gap < low.gapPct / 100) low = { date: bar.date, value, invested, gapPct: gap * 100 }
    series.push({ date: bar.date, invested, value })
  }

  const last = series.at(-1)
  return {
    start: bars[from].date,
    end: last.date,
    fills,
    invested: last.invested,
    value: last.value,
    changePct: (last.value / last.invested - 1) * 100,
    // The lowest the holding got relative to what had gone in by then. This is
    // the number the one-sentence version leaves out.
    low,
    underwaterPct: (underwater / series.length) * 100,
    series,
  }
}

// The window ending on the last synced session.
export function recentStack({ bars, amount, years, everyDays = 7 }) {
  if (!bars?.length || !(amount > 0) || years < 1 || years > yearsAvailable(bars)) return null
  const cutoff = yearsBefore(bars.at(-1).date, years)
  const from = bars.findIndex((b) => dayOf(b.date) >= cutoff)
  return replaySchedule(bars, from, bars.length - 1, amount, everyDays)
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

// Every start date the same window fits into, not just the one ending today.
//
// Check the N: these are not independent. Two start dates a week apart share
// all but one week of prices, so a thousand of them are one history seen from
// a thousand doors. `separateWindows` is how many non-overlapping stretches of
// this length the history actually holds, and it is the number any reading of
// the spread rests on. No interval is built from `starts`, on purpose.
export function everyStart({ bars, amount, years, everyDays = 7 }) {
  if (!bars?.length || !(amount > 0) || years < 1 || years > yearsAvailable(bars)) return null
  const lastDay = dayOf(bars.at(-1).date)
  const outcomes = []
  let to = 0
  for (let from = 0; from < bars.length; from++) {
    const endDay = yearsAfter(bars[from].date, years)
    if (endDay > lastDay) break
    while (to + 1 < bars.length && dayOf(bars[to + 1].date) <= endDay) to += 1
    const r = replaySchedule(bars, from, to, amount, everyDays)
    outcomes.push({ start: r.start, end: r.end, changePct: r.changePct })
  }
  const sorted = outcomes.map((o) => o.changePct).sort((a, b) => a - b)
  const byChange = [...outcomes].sort((a, b) => a.changePct - b.changePct)
  const spanDays = (lastDay - dayOf(bars[0].date)) / DAY_MS
  return {
    starts: outcomes.length,
    separateWindows: Math.floor(spanDays / (years * 365.25)),
    worst: byChange[0],
    median: quantile(sorted, 0.5),
    best: byChange.at(-1),
    endedBelowPct: (sorted.filter((c) => c < 0).length / sorted.length) * 100,
  }
}

// The words, kept here rather than in the component so a test can run every
// ticker through them. None of it says whether to do this; the only verbs are
// what already happened.
export function stackRead({ symbol, years, amount, recent, spread }) {
  if (!recent) return null
  const span = years === 1 ? 'year' : `${years} years`
  const stretch = `${years}-year`
  // `result` finishes the sentence the page's own controls start; `headline`
  // is the same claim standing alone.
  const result = `would have turned ${money(recent.invested)} into ${money(recent.value)}.`
  const headline = `Over the last ${span}, putting ${money(amount, Number.isInteger(amount) ? 0 : 2)} into ${symbol} every week ${result}`
  const path =
    recent.low.gapPct < 0
      ? `Along the way it was worth as little as ${money(recent.low.value)} against ${money(recent.low.invested)} put in (${pct(recent.low.gapPct, 0)}), on ${recent.low.date}, and it spent ${Math.round(recent.underwaterPct)}% of sessions worth less than had gone in.`
      : `On this path it was never worth less than had gone in.`
  const doors = spread
    ? `That sentence depends on the start date. Of the ${spread.starts} start dates a ${stretch} window fits into here, ${Math.round(spread.endedBelowPct)}% ended worth less than was put in. The worst began ${spread.worst.start} and ended ${pct(spread.worst.changePct, 0)}; the middle one ended ${pct(spread.median, 0)}; the best began ${spread.best.start} and ended ${pct(spread.best.changePct, 0)}. Those start dates overlap almost entirely — the history holds ${spread.separateWindows} separate ${stretch} stretch${spread.separateWindows === 1 ? '' : 'es'} — so this is one history seen from many doors, not ${spread.starts} trials.`
    : null
  return { headline, result, path, doors }
}
