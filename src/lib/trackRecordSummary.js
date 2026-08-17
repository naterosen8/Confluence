import { distinguishableFromChance, differenceInterval } from './stats.js'
import { leanDirection } from './lean.js'

// The track-record page's figures, computed by the daily job rather than by
// downloading the whole log into every visitor's browser.
//
// The log only ever grows — one row per ticker per session whose readings
// leaned. At 24 tickers that is ~20 rows a day and the file is trivial. At 500
// it is ~400 a day, roughly 100,000 rows a year, and the page fetches all of
// them to display summary statistics and a table nobody scrolls to the bottom
// of. The summary is a fixed size no matter how long the log gets.
//
// The full log stays committed and fetchable. It is the audit trail — the
// claim that nothing is removed after the fact only means something if the
// raw file is still there to check.

// How many resolved calls the page shows. Enough to scan for a pattern,
// bounded so the payload does not grow with the log.
export const RECENT_LIMIT = 100

// A voided entry is one the log retracted — the settled bar turned its
// verdict to a split, so it was never a call anybody made. It stays in the
// file and on the page, and stays out of every statistic.
export const isCounted = (e) => !e.voided

export function summarize(entries) {
  const decidable = entries.filter((e) => isCounted(e) && e.outcome && e.outcome.correct !== null)
  if (!decidable.length) return null
  const wins = decidable.filter((e) => e.outcome.correct).length
  const avgReturn = decidable.reduce((a, e) => a + e.outcome.returnPct, 0) / decidable.length
  const ci = distinguishableFromChance(wins, decidable.length)
  return {
    total: decidable.length,
    winRate: (wins / decidable.length) * 100,
    avgReturn,
    low: ci ? ci.lower * 100 : null,
    high: ci ? ci.upper * 100 : null,
  }
}

// A hit rate is meaningless without the rate it has to beat. Over a rising
// market, "price went up" is true more often than not no matter what the call
// said — so a 54% hit rate on upward-leaning calls against a 54% drift rate is
// exactly zero skill, while looking like a passing grade. This computes the
// drift over the same resolved windows so the two can be shown together.
export function baselineOf(resolved, direction) {
  const decidable = resolved.filter((e) => isCounted(e) && e.outcome && e.outcome.correct !== null)
  if (!decidable.length) return null
  const moved = decidable.filter((e) => (direction === 'up' ? e.outcome.returnPct > 0 : e.outcome.returnPct < 0)).length
  return (moved / decidable.length) * 100
}

// The gap between a directional hit rate and the drift over the same windows,
// with an interval on the gap itself.
//
// This is the only figure on the page that carries information. The hit rate
// alone cannot distinguish skill from a rising market, and comparing it to 50%
// tests it against the wrong null — the alternative to skill is drift, not a
// coin flip. Where the two point estimates land is not the question either:
// the interval on the difference is wider than either input, so "70% versus
// 60%" can and usually does mean nothing at all.
function gapOf(calls, resolved, direction) {
  const decidable = calls.filter((e) => isCounted(e) && e.outcome && e.outcome.correct !== null)
  const windows = resolved.filter((e) => isCounted(e) && e.outcome && e.outcome.correct !== null)
  if (!decidable.length || !windows.length) return null

  const hits = decidable.filter((e) => e.outcome.correct).length
  const drifted = windows.filter((e) =>
    direction === 'up' ? e.outcome.returnPct > 0 : e.outcome.returnPct < 0
  ).length

  const ci = differenceInterval(hits, decidable.length, drifted, windows.length)
  if (!ci) return null
  return {
    hits,
    calls: decidable.length,
    drifted,
    windows: windows.length,
    points: ci.point * 100,
    low: ci.lower * 100,
    high: ci.upper * 100,
    // Newcombe assumes independent samples and these are not fully
    // independent: the drift windows include the called ones, and overlapping
    // forward windows are correlated. Both push toward understating the
    // interval, so a gap that fails to clear it here would fail a stricter
    // test too. Reported rather than corrected for, because the correction
    // would need an assumption less defensible than the caveat.
    distinguishable: ci.distinguishable,
  }
}

export function summarizeTrackRecord(log, { recentLimit = RECENT_LIMIT } = {}) {
  const entries = Array.isArray(log) ? log : []
  const resolved = entries.filter((e) => e.outcome).sort((a, b) => (a.date < b.date ? 1 : -1))
  const pending = entries.filter((e) => !e.outcome && !e.voided)
  const voided = entries.filter((e) => e.voided)
  const up = resolved.filter((e) => leanDirection(e.verdict) === 'up')
  const down = resolved.filter((e) => leanDirection(e.verdict) === 'down')

  return {
    generatedAt: new Date().toISOString(),
    resolvedCount: resolved.filter(isCounted).length,
    pendingCount: pending.length,
    // Surfaced rather than silently netted out of the totals: a record that
    // retracts calls has to say how many, or the retraction is just deletion
    // with extra steps.
    voidedCount: voided.length,
    overall: summarize(resolved),
    up: summarize(up),
    down: summarize(down),
    upBaseline: baselineOf(resolved, 'up'),
    downBaseline: baselineOf(resolved, 'down'),
    upGap: gapOf(up, resolved, 'up'),
    downGap: gapOf(down, resolved, 'down'),
    // Already sorted newest first, so this is the most recent slice. The count
    // above says how many exist, so a truncated table can say so rather than
    // quietly looking like the whole record.
    recent: resolved.slice(0, recentLimit),
    truncated: resolved.length > recentLimit,
    voided: voided.slice(0, recentLimit),
  }
}
