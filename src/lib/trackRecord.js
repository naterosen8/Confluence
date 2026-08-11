// Which bar a track-record entry should be stamped against.
//
// Two separate mistakes have been made here, both of which silently
// falsified the public log, so the rule lives in one tested place rather
// than inline in the sync script.
//
//   1. Stamping the date the job ran. A weekend or holiday run stamped a
//      date that appears in no bar, so resolution could never find the
//      entry and it sat pending forever. That produced 15 dead rows.
//
//   2. Stamping the last bar unconditionally. Crypto trades 24/7 on
//      UTC-day bars, so at 21:30 UTC the bar dated today still has hours
//      left to run — its close is provisional and gets revised overnight.
//      BTC/USD 2026-08-09 was logged at 65234.61 and settled at 64901.59,
//      and the verdict beside it had been computed from that partial
//      session. US equities are unaffected: their session has closed well
//      before this job runs, so a bar dated today is final.
//
// Returns the index of the bar to use, or -1 when there is nothing usable.
export function entryBarIndex({ bars, kind, today }) {
  if (!bars || !bars.length) return -1
  const last = bars.length - 1
  const stillForming = kind === 'crypto' && bars[last].date === today
  return stillForming ? last - 1 : last
}

// The UTC calendar day, which is the basis crypto daily bars are cut on.
export function utcToday(now = new Date()) {
  return now.toISOString().slice(0, 10)
}
