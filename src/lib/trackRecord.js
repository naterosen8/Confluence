// Which bar a track-record entry may be stamped against, and how to repair
// entries that were stamped against an unstable one.
//
// Three separate mistakes have been made here, each of which silently
// falsified the public log, so the rules live in one tested place rather than
// inline in the sync script.
//
//   1. Stamping the date the job ran. A weekend or holiday run stamped a date
//      that appears in no bar, so resolution could never find the entry and it
//      sat pending forever. That produced 15 dead rows.
//
//   2. Stamping the last bar unconditionally. See below.
//
//   3. Fixing (2) for crypto only. The first diagnosis was that crypto trades
//      24/7 on UTC-day bars, so at 21:30 UTC the bar dated today still had
//      hours to run. True, but too narrow — the very next sync mis-stamped
//      QQQ and TLT as well.
//
// Measuring it settled the question. Comparing each committed snapshot against
// the current one, every revision the provider has made sits at the last bar
// and nowhere else: across four consecutive snapshots, zero bars changed once
// they were no longer the newest. Magnitudes reached 0.84% on crypto and
// 0.06% on equities — small, but the log recorded an entry price that the
// finished bar then contradicted, and the verdict beside it was computed from
// a session that had not closed.
//
// So the rule is not about market hours at all: the last bar is provisional,
// every earlier bar is settled.

// The newest bar the provider has stopped revising. Returns -1 when there is
// no settled bar yet.
export function lastSettledIndex(bars) {
  if (!bars || bars.length < 2) return -1
  return bars.length - 2
}

// The UTC calendar day. Kept here because crypto bars are cut on it, and the
// job runs at 21:30 UTC, which is still the previous day in US timezones.
export function utcToday(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

// Brings already-logged, still-unresolved entries back into agreement with the
// snapshot after the provider settles a bar.
//
// Entries are matched by symbol AND date — never by price. A previous attempt
// at this matched on price and mapped an August 2026 entry onto a November
// 2022 bar, collapsing the log from 33 entries to 21. Date is the only safe
// key.
//
// A settled outcome is never touched. Correcting an entry price after the
// return has been computed would rewrite a measured result, which is exactly
// what this log exists not to do.
//
// `rescore` is passed history truncated to the entry's own bar, so the
// re-derived verdict carries no look-ahead. If the settled bar turns the
// verdict to a split, the entry would never have been logged at all — it is
// marked void IN PLACE rather than deleted.
//
// Deleting was the original behaviour and it was wrong. Two crypto calls
// seeded on 2026-08-09 were removed by a later sync, and the only way to
// discover that was to diff the file against its own history: the log simply
// had two fewer rows than it was seeded with, with nothing saying so. A
// public accuracy record that can quietly shrink is not an accuracy record,
// and "nothing is removed after the fact" was precisely the claim this log
// was built to support. A voided entry stays visible, carries the reason it
// was voided, and is excluded from the statistics — which is the difference
// between amending a record and editing it.
export function repairUnresolved({ log, barsBySymbol, rescore, now = new Date() }) {
  const repaired = []
  const voided = []

  for (const entry of log) {
    if (entry.outcome) continue
    // Already voided by an earlier run. Voiding is terminal — re-examining it
    // every sync would let a later bar revision quietly bring a retracted call
    // back into the statistics.
    if (entry.voided) continue
    const bars = barsBySymbol?.[entry.symbol]
    if (!bars) continue
    const index = bars.findIndex((b) => b.date === entry.date)
    if (index === -1) continue

    const close = bars[index].close
    if (close === entry.price) continue

    const change = { symbol: entry.symbol, date: entry.date, from: entry.price, to: close }
    entry.price = close

    if (rescore) {
      const scored = rescore(bars.slice(0, index + 1))
      if (scored.verdict === 'split') {
        // Kept in the log, marked, and excluded from the statistics.
        entry.voided = {
          reason: 'rescored-to-split',
          verdictWas: entry.verdict,
          at: now.toISOString().slice(0, 10),
        }
        change.voided = true
        voided.push(entry)
      } else {
        change.verdictFrom = entry.verdict
        entry.verdict = scored.verdict
        entry.score = scored.score
      }
    }
    repaired.push(change)
  }

  return { repaired, voided, log }
}
