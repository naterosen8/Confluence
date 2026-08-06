import { Link } from 'react-router-dom'
import trackRecord from '../../data/track-record.json'

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

export default function TrackRecord() {
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
        Every non-neutral verdict this app has ever shown, logged automatically the day it fired, resolved 5 trading
        sessions later against the actual close — misses included. Nothing here is curated or removed after the
        fact; the raw log is a committed file in the repo.
      </p>

      {!overall ? (
        <div className="callout callout-highlight">
          No resolved calls yet. This log is written by a daily job — check back after a few trading sessions have
          passed since the app started tracking.
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
