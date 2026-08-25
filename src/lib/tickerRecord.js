import { wilsonInterval, differenceInterval, sampleSizeToDistinguish } from './stats.js'
import { isCounted } from './trackRecordSummary.js'
import { leanDirection } from './lean.js'

// What this site has actually said about one ticker, and how it turned out.
//
// The track-record page answers the aggregate question: across every call ever
// published, is there anything there. That is the right question for judging
// the site and the wrong one for the person in front of a single instrument,
// who is being shown a verdict badge on NVDA and has no way to ask the obvious
// follow-up — what did this thing say about NVDA before, and was it right?
//
// The answer, today, is usually "three calls, two of which missed". That is
// not a hit rate and this module will not print one as though it were. The
// value is not in the number; it is that the calls exist, are dated, are
// committed, and can be checked one at a time. A site claiming its record is
// public should be able to produce that record at the point where someone is
// reading a claim, not only in a summary on another page.

// How many resolved calls are kept per symbol in the published index.
//
// The raw log grows forever — one row per ticker per session whose readings
// leaned — so a per-ticker view built by fetching all of it stops working at
// exactly the point the log becomes interesting. Twelve is enough to see a
// pattern if one exists and fixes the file's size no matter how long the log
// gets. The complete history stays in track-record.json, linked from the page.
export const PER_SYMBOL_LIMIT = 12

// Below this, no rate is stated. Not "stated with a caveat" — not stated.
//
// A percentage printed beside a sample of three is read as a percentage. The
// interval around it spans nearly the whole range and the caveat explaining
// that sits underneath in smaller text, which is not a fair fight. Ten is
// still far too few to conclude anything, and above it the figure is always
// shown against this ticker's own drift with the interval on the difference —
// but at least at ten there is a number rather than an anecdote.
export const MIN_FOR_RATE = 10

const decidable = (entries) => entries.filter((e) => isCounted(e) && e.outcome && e.outcome.correct !== null)

// Rounding a tiny negative move produces negative zero, which JSON writes as
// `0` and reads back as `0` — so a file and the value it was built from stop
// being equal, and a validation test that recomputes the file fails on a
// difference nobody can see. It would also render as "−0.00%", which is not a
// move anything made. Normalised at the one place the rounding happens.
const round2 = (n) => {
  const r = Math.round(n * 100) / 100
  return r === 0 ? 0 : r
}

// The published per-symbol index: bounded, and carrying the counts in full so
// the page can say how much it is not showing.
export function bySymbol(log, { limit = PER_SYMBOL_LIMIT } = {}) {
  const groups = new Map()
  for (const entry of log ?? []) {
    if (!entry?.symbol) continue
    if (!groups.has(entry.symbol)) groups.set(entry.symbol, [])
    groups.get(entry.symbol).push(entry)
  }

  const out = {}
  for (const [symbol, entries] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const settled = decidable(entries)
    const newestFirst = [...settled].sort((a, b) => b.date.localeCompare(a.date))
    out[symbol] = {
      // Counts describe everything, including the calls trimmed from the list.
      resolvedCount: settled.length,
      pendingCount: entries.filter((e) => isCounted(e) && !e.outcome).length,
      voidedCount: entries.filter((e) => e.voided).length,
      hits: settled.filter((e) => e.outcome.correct).length,
      // Windows in which price rose, whatever the call said. The per-ticker
      // drift, over exactly the windows the calls were scored on.
      rose: settled.filter((e) => e.outcome.returnPct > 0).length,
      calls: newestFirst.slice(0, limit).map((e) => ({
        date: e.date,
        verdict: e.verdict,
        price: e.price,
        resolvedDate: e.outcome.resolvedDate,
        exitPrice: e.outcome.exitPrice,
        returnPct: round2(e.outcome.returnPct),
        correct: e.outcome.correct,
      })),
    }
  }
  return out
}

// The reading, for one symbol.
export function symbolRecord(block, symbol) {
  if (!block) return null
  const { resolvedCount, pendingCount, voidedCount, hits, rose, calls } = block
  const enough = resolvedCount >= MIN_FOR_RATE

  const rate = resolvedCount ? (hits / resolvedCount) * 100 : null
  const drift = resolvedCount ? (rose / resolvedCount) * 100 : null

  // Whether the calls leaned mostly one way decides which drift they should be
  // measured against: an upward-leaning call is right when price rose, and
  // over a rising stretch that happens often without any skill involved.
  const ups = calls.filter((c) => leanDirection(c.verdict) === 'up').length
  const downs = calls.filter((c) => leanDirection(c.verdict) === 'down').length
  const lean = ups === downs ? 'mixed' : ups > downs ? 'up' : 'down'

  const interval = enough ? wilsonInterval(hits, resolvedCount) : null
  // Against this ticker's own drift over the same windows, not against a coin
  // flip — the same null the rest of the site tests against.
  const gap =
    enough && lean !== 'mixed'
      ? differenceInterval(hits, resolvedCount, lean === 'up' ? rose : resolvedCount - rose, resolvedCount)
      : null

  return {
    symbol,
    resolvedCount,
    pendingCount,
    voidedCount,
    truncated: Math.max(0, resolvedCount - calls.length),
    hits,
    rate: enough ? rate : null,
    // Kept out of `rate` on purpose but still available, because the calls
    // themselves are listed and anyone can count them. Hiding the arithmetic
    // while showing its inputs would be theatre.
    rawRate: rate,
    drift,
    lean,
    interval: interval ? { low: interval.lower * 100, high: interval.upper * 100 } : null,
    gap,
    enough,
    // What it would take before a per-ticker rate could mean anything. Null
    // for a flawless or hopeless record, where the sample cannot estimate its
    // own variance and the question has no answer from this data.
    needed: rate == null ? null : sampleSizeToDistinguish(rate / 100),
    calls,
  }
}

export function tickerRecordRead(record) {
  if (!record) return null
  const { symbol, resolvedCount, pendingCount, hits, rawRate, drift, needed, enough, gap } = record

  if (!resolvedCount) {
    return pendingCount
      ? `${pendingCount} call${pendingCount === 1 ? '' : 's'} on ${symbol} ${pendingCount === 1 ? 'is' : 'are'} logged and waiting to resolve. Each settles five trading sessions after it fired, so nothing here is scored yet.`
      : `This site has not published a call on ${symbol} yet. Calls are logged automatically on any session whose readings lean one way rather than splitting, so a ticker that has been reading as a split throughout has nothing here — which is itself the record, not a gap in it.`
  }

  const parts = []
  parts.push(
    `${hits} of ${resolvedCount} resolved call${resolvedCount === 1 ? '' : 's'} on ${symbol} went the way the readings leaned. Price rose in ${drift.toFixed(0)}% of those same windows regardless of what the call said.`
  )

  if (!enough) {
    parts.push(
      `That is ${resolvedCount} observation${resolvedCount === 1 ? '' : 's'}, so no hit rate is quoted: ${rawRate.toFixed(0)}% of ${resolvedCount} and ${(100 - rawRate).toFixed(0)}% of ${resolvedCount} are the same evidence about this ticker, which is none.${needed ? ` Separating a rate like that from chance would take roughly ${needed} calls.` : ''} The calls are listed below because each one is a real, dated, checkable claim — that is what they are for.`
    )
  } else if (gap) {
    parts.push(
      gap.distinguishable
        ? `Against this ticker's own drift the gap is ${gap.point >= 0 ? '+' : '−'}${Math.abs(gap.point).toFixed(1)} points, and the 95% interval on that difference (${gap.lower.toFixed(1)} to ${gap.upper.toFixed(1)}) excludes zero.`
        : `Against this ticker's own drift the gap is ${gap.point >= 0 ? '+' : '−'}${Math.abs(gap.point).toFixed(1)} points, with a 95% interval on the difference of ${gap.lower.toFixed(1)} to ${gap.upper.toFixed(1)} — which includes zero, so it is not distinguishable from the ticker simply doing what it does.`
    )
  }

  if (pendingCount) {
    parts.push(`${pendingCount} more ${pendingCount === 1 ? 'is' : 'are'} logged and still waiting to resolve.`)
  }

  return parts.join(' ')
}
