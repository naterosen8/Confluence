import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FORWARD_DAYS } from '../lib/backtest'
import { useDocumentTitle } from '../lib/useDocumentTitle'

function pct(v, digits = 2) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`
}

function summarize(entries) {
  const decidable = entries.filter((e) => e.outcome && e.outcome.correct !== null)
  if (!decidable.length) return null
  const wins = decidable.filter((e) => e.outcome.correct).length
  const avgReturn = decidable.reduce((a, e) => a + e.outcome.returnPct, 0) / decidable.length
  return { total: decidable.length, winRate: (wins / decidable.length) * 100, avgReturn }
}

// Fetched at runtime, same as market-data.json — this log only ever grows,
// so baking it into the JS bundle via a static import would mean an
// ever-larger download for every visitor, on every page, whether or not
// they ever open this one.
export default function TrackRecord() {
  useDocumentTitle('Track record')
  const [trackRecord, setTrackRecord] = useState(null)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    fetch('/track-record.json')
      .then((res) => (res.ok ? res.json() : []))
      .then(setTrackRecord)
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

  if (!trackRecord) {
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

  const resolved = trackRecord.filter((e) => e.outcome).sort((a, b) => (a.date < b.date ? 1 : -1))
  const pending = trackRecord.filter((e) => !e.outcome)

  const overall = summarize(resolved)
  const bullish = summarize(resolved.filter((e) => e.verdict.includes('Bullish')))
  const bearish = summarize(resolved.filter((e) => e.verdict.includes('Bearish')))

  return (
    <div>
      <Link to="/" className="back-link">
        ← Back to screener
      </Link>

      <h1>Track record</h1>
      <p className="muted">
        Every non-neutral verdict this app has ever shown, logged automatically the day it fired, resolved{' '}
        {FORWARD_DAYS} trading sessions later against the actual close — misses included. Nothing here is curated or
        removed after the fact; the raw log is a committed file in the repo.
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
              some ticker showed a non-neutral verdict.
            </>
          )}
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <Stat label="Resolved calls" value={overall.total} />
            <Stat label="Overall win rate" value={`${overall.winRate.toFixed(0)}%`} />
            <Stat label="Overall avg. return" value={pct(overall.avgReturn)} />
            <Stat label="Bullish calls win rate" value={bullish ? `${bullish.winRate.toFixed(0)}% (N=${bullish.total})` : '—'} />
            <Stat label="Bearish calls win rate" value={bearish ? `${bearish.winRate.toFixed(0)}% (N=${bearish.total})` : '—'} />
            <Stat label="Pending resolution" value={pending.length} />
          </div>

          <Section title="Resolved calls">
            <div className="score-table-wrap">
              <table className="score-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Symbol</th>
                    <th>Verdict</th>
                    <th>Entry price</th>
                    <th>Resolved</th>
                    <th>Exit price</th>
                    <th>Return</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved.map((e) => (
                    <tr key={`${e.symbol}-${e.date}`}>
                      <td>{e.date}</td>
                      <td>
                        <strong>{e.symbol}</strong>
                      </td>
                      <td>{e.verdict}</td>
                      <td>${e.price.toFixed(2)}</td>
                      <td>{e.outcome.resolvedDate}</td>
                      <td>${e.outcome.exitPrice.toFixed(2)}</td>
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

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="muted small">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  )
}
