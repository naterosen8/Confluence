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
  const { overall, up: bullish, down: bearish, upBaseline, downBaseline, recent } = summary
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
          <div className="stat-grid">
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
            <Stat
              term="driftBaseline"
              label="Upward-leaning calls"
              value={bullish ? `${rate(bullish.winRate)} (N=${bullish.total})` : '—'}
              note={
                bullish && upBaseline != null
                  ? `Price rose in ${upBaseline.toFixed(0)}% of these windows regardless — edge ${
                      bullish.winRate - upBaseline >= 0 ? '+' : ''
                    }${(bullish.winRate - upBaseline).toFixed(1)} pts`
                  : null
              }
            />
            <Stat
              term="driftBaseline"
              label="Downward-leaning calls"
              value={bearish ? `${rate(bearish.winRate)} (N=${bearish.total})` : '—'}
              note={
                bearish && downBaseline != null
                  ? `Price fell in ${downBaseline.toFixed(0)}% of these windows regardless — edge ${
                      bearish.winRate - downBaseline >= 0 ? '+' : ''
                    }${(bearish.winRate - downBaseline).toFixed(1)} pts`
                  : null
              }
            />
            <Stat term="forwardWindow" label="Pending resolution" value={pending.length} />
          </div>

          <div className="callout impact-note">
            <Explain term="driftBaseline">
              <strong>Read the hit rate against the drift, not against 50%.</strong>
            </Explain>{' '}
            Over a period when prices rose in
            most five-session windows, an upward-leaning call is right most of the time without any skill being
            involved. The only number that means anything here is the gap between the hit rate and the baseline shown
            beside it — and on a sample this size that gap needs to be large before it is distinguishable from chance
            at all.
          </div>

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
                    <th><Explain term="dailySnapshot">Entry price</Explain></th>
                    <th><Explain term="forwardWindow">Resolved</Explain></th>
                    <th>Exit price</th>
                    <th><Explain term="avgReturn">Return</Explain></th>
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
                      <td>{price(e.price)}</td>
                      <td>{e.outcome.resolvedDate}</td>
                      <td>{price(e.outcome.exitPrice)}</td>
                      <td>{pct(e.outcome.returnPct)}</td>
                      <td className={e.outcome.correct ? 'top-setup-bullish' : 'top-setup-bearish'}>
                        {e.outcome.correct ? 'Hit' : 'Miss'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
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
