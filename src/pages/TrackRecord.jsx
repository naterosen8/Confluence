import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FORWARD_DAYS } from '../lib/backtest'
import { leanByKey } from '../lib/lean'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { pct, rate, price } from '../lib/format'
import { RECENT_LIMIT } from '../lib/trackRecordSummary'
import Explain from '../components/Explain'

// Reads the precomputed summary rather than the raw log. The log only ever
// grows — one row per ticker per session whose readings leaned — so at any
// real number of tickers downloading all of it to render summary statistics
// and a table stops being viable. The summary is a fixed size however long the
// log gets. The raw log stays committed and linked, because "nothing is
// removed after the fact" only means something if it is there to check.
export default function TrackRecord() {
  useDocumentTitle('Track record')
  const [summary, setSummary] = useState(null)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    fetch('/track-record-summary.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSummary(data ?? { resolvedCount: 0, pendingCount: 0, recent: [] }))
      .catch(() => setLoadError('Could not load the track record right now.'))
  }, [])

  if (loadError) {
    return (
      <div>
        <Link to="/" className="back-link">
          ← Back to screener
        </Link>
        <h1>Track record</h1>
        <p className="muted small">Error: {loadError}</p>
      </div>
    )
  }

  if (!summary) {
    return (
      <div>
        <Link to="/" className="back-link">
          ← Back to screener
        </Link>
        <h1>Track record</h1>
        <p className="muted">Loading…</p>
      </div>
    )
  }

  // Scored by band direction, which resolves both the current keys and the
  // pre-rename labels still present in the logged history — done by the job.
  const { overall, up: bullish, down: bearish, upBaseline, downBaseline, upGap, downGap, recent } = summary
  const pending = { length: summary.pendingCount }

  return (
    <div>
      <Link to="/" className="back-link">
        ← Back to screener
      </Link>

      <h1>Track record</h1>
      <p className="muted">
        <Explain term="trackRecord">
          Every day the readings leaned one way rather than splitting, logged automatically as it happened
        </Explain>{' '}
        and resolved <Explain term="forwardWindow">{FORWARD_DAYS} trading sessions later</Explain> against the actual
        close — misses included. Nothing here is curated or removed after the fact: this page shows a summary, and the{' '}
        <a href="/track-record.json">complete raw log</a> is a committed file you can read yourself.
      </p>

      {!overall ? (
        /* Without the pending count this read as "nothing here / broken" even
           when the job was running fine and already tracking calls — the
           tracking just hadn't matured 5 sessions yet. */
        <div className="callout callout-highlight">
          {pending.length > 0 ? (
            <>
              <strong>
                {pending.length} call{pending.length === 1 ? '' : 's'} logged and awaiting resolution.
              </strong>{' '}
              Each one resolves {FORWARD_DAYS} trading sessions after it fired, so the first results appear about a week
              after tracking starts. Nothing is scored yet.
            </>
          ) : (
            <>
              No calls logged yet. This log is written by a daily job — check back after it has run on a session where
              some ticker’s readings leaned one way.
            </>
          )}
        </div>
      ) : (
        <>
          <div className="record-stats">
            <Stat term="trackRecord" label="Resolved calls" value={overall.total} />
            <Stat
              term="hitRate"
              label="Overall hit rate"
              value={rate(overall.winRate)}
              note={
                overall.low != null ? (
                  <Explain term="confidenceInterval">
                    95% range {overall.low.toFixed(0)}–{overall.high.toFixed(0)}%
                  </Explain>
                ) : null
              }
            />
            <Stat term="avgReturn" label="Mean return per call" value={pct(overall.avgReturn)} />
            <Stat term="forwardWindow" label="Pending resolution" value={pending.length} />
            {summary.voidedCount > 0 && (
              <Stat term="voidedCall" label="Retracted calls" value={summary.voidedCount} />
            )}
          </div>

          {/* These two carry a paragraph each, so they get width rather than
              being squeezed into a tile sized for a single number. */}
          <div className="record-compare">
            <Stat
              term="driftBaseline"
              label="Upward-leaning calls"
              value={bullish ? `${rate(bullish.winRate)} (N=${bullish.total})` : '—'}
              note={<GapNote baseline={upBaseline} gap={upGap} rose />}
            />
            <Stat
              term="driftBaseline"
              label="Downward-leaning calls"
              value={bearish ? `${rate(bearish.winRate)} (N=${bearish.total})` : '—'}
              note={<GapNote baseline={downBaseline} gap={downGap} />}
            />
          </div>

          <GapVerdict gap={upGap} />

          <p className="muted small record-note">
            <Explain term="driftBaseline">
              Why the drift and not 50%
            </Explain>{' '}
            — over a period when prices rose in most five-session windows, an upward-leaning call is right most of the
            time without any skill involved. The gap carries its own uncertainty, wider than either rate it is built
            from, which is why two numbers that look far apart routinely are not.
          </p>

          <Section
            title={
              summary.truncated
                ? `Resolved calls — most recent ${RECENT_LIMIT} of ${summary.resolvedCount}`
                : 'Resolved calls'
            }
          >
            <div className="score-table-wrap">
              <table className="score-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Symbol</th>
                    <th><Explain term="verdict">Verdict</Explain></th>
                    <th className="num"><Explain term="dailySnapshot">Entry price</Explain></th>
                    <th><Explain term="forwardWindow">Resolved</Explain></th>
                    <th className="num">Exit price</th>
                    <th className="num"><Explain term="avgReturn">Return</Explain></th>
                    <th><Explain term="hitRate">Result</Explain></th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((e) => (
                    <tr key={`${e.symbol}-${e.date}`}>
                      <td>{e.date}</td>
                      <td>
                        <strong>{e.symbol}</strong>
                      </td>
                      <td>{leanByKey(e.verdict)?.short ?? e.verdict}</td>
                      <td className="num">{price(e.price)}</td>
                      <td>{e.outcome.resolvedDate}</td>
                      <td className="num">{price(e.outcome.exitPrice)}</td>
                      {/* Deliberately not coloured by sign. Return here is the
                          raw price move, not the call's outcome — a
                          downward-leaning call that saw price rise shows a
                          positive return and is a Miss. Green on that number
                          beside a red "Miss" reads as a contradiction, and
                          implies the move was good news when for this call it
                          was the opposite. Hit/Miss carries the judgement. */}
                      <td className="num">{pct(e.outcome.returnPct)}</td>
                      <td className={e.outcome.correct ? 'result-hit' : 'result-miss'}>
                        {e.outcome.correct ? 'Hit' : 'Miss'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {summary.voided?.length > 0 && (
            <Section title={`Retracted calls (${summary.voidedCount})`}>
              <p className="muted small">
                Calls the log has withdrawn. When a provider settles the bar an entry was stamped against, the verdict
                is recomputed from history truncated to that bar; if it becomes a split, the call would never have been
                logged. These are kept here and excluded from every figure above — an earlier version deleted them
                outright, which meant the record could shrink with nothing saying so.
              </p>
              <div className="table-wrap">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Symbol</th>
                      <th>Verdict as logged</th>
                      <th><Explain term="voidedCall">Why retracted</Explain></th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.voided.map((e) => (
                      <tr key={`${e.symbol}-${e.date}`} className="row-voided">
                        <td>{e.date}</td>
                        <td>{e.symbol}</td>
                        <td className="muted">{leanByKey(e.voided.verdictWas ?? e.verdict)?.short ?? e.verdict}</td>
                        <td className="muted small">
                          {e.voided.reason === 'rescored-to-split'
                            ? 'Settled bar turned the verdict to a split'
                            : e.voided.reason === 'stamped-against-forming-bar'
                            ? 'Stamped against a bar that was still forming'
                            : e.voided.reason}
                          {e.voided.at && ` · ${e.voided.at}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  )
}

// The gap, with the interval that decides whether it means anything. A bare
// "edge +10.0 pts" is the exact overclaim the callout below warns against —
// on ten calls that number is compatible with a substantial edge, with none,
// and with the opposite.
function GapNote({ baseline, gap, rose }) {
  if (baseline == null) return null
  const verb = rose ? 'rose' : 'fell'
  if (!gap) return <>Price {verb} in {baseline.toFixed(0)}% of these windows regardless.</>
  const sign = gap.points >= 0 ? '+' : '−'
  return (
    <>
      Price {verb} in {baseline.toFixed(0)}% of these windows regardless — gap{' '}
      <Explain term="gapInterval">
        {sign}
        {Math.abs(gap.points).toFixed(1)} pts, 95% range {gap.low.toFixed(0)} to {gap.high.toFixed(0)}
      </Explain>
      {!gap.distinguishable && ' · spans zero'}
    </>
  )
}

// The one sentence the whole page exists to produce, stated rather than left
// for the reader to assemble out of four stat tiles.
function GapVerdict({ gap }) {
  if (!gap) return null
  if (gap.distinguishable) {
    return (
      <div className="callout callout-highlight">
        <strong>
          Upward-leaning calls are beating the drift by {gap.points.toFixed(1)} points on {gap.calls} calls.
        </strong>{' '}
        The 95% range on that gap is {gap.low.toFixed(0)} to {gap.high.toFixed(0)} points and does not include zero, so
        on this sample the difference is not attributable to chance alone. It is still a small sample, the windows
        overlap, and nothing here says the next call is more likely to be right.
      </div>
    )
  }
  return (
    <div className="callout callout-highlight">
      <strong>No edge has been demonstrated.</strong> Upward-leaning calls hit{' '}
      {((gap.hits / gap.calls) * 100).toFixed(0)}% against a drift of{' '}
      {((gap.drifted / gap.windows) * 100).toFixed(0)}% — a gap of {gap.points >= 0 ? '+' : '−'}
      {Math.abs(gap.points).toFixed(1)} points whose 95% range runs from {gap.low.toFixed(0)} to{' '}
      {gap.high.toFixed(0)}. That range includes zero, so this record is so far consistent with the calls carrying no
      information at all. {gap.calls} resolved call{gap.calls === 1 ? '' : 's'} is not enough to say otherwise either
      way.
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="detail-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function Stat({ label, value, note, term }) {
  return (
    <div className="stat">
      <span className="muted small">{term ? <Explain term={term}>{label}</Explain> : label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  )
}
