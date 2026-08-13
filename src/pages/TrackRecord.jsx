import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FORWARD_DAYS } from '../lib/backtest'
import { leanByKey, leanDirection } from '../lib/lean'
import { distinguishableFromChance } from '../lib/stats'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { pct, rate, price } from '../lib/format'
import Explain from '../components/Explain'

function summarize(entries) {
  const decidable = entries.filter((e) => e.outcome && e.outcome.correct !== null)
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
function baselineOf(resolved, direction) {
  const decidable = resolved.filter((e) => e.outcome && e.outcome.correct !== null)
  if (!decidable.length) return null
  const moved = decidable.filter((e) =>
    direction === 'up' ? e.outcome.returnPct > 0 : e.outcome.returnPct < 0
  ).length
  return (moved / decidable.length) * 100
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
  // Scored by band direction, which resolves both the current keys and the
  // pre-rename labels still present in the logged history.
  const bullish = summarize(resolved.filter((e) => leanDirection(e.verdict) === 'up'))
  const bearish = summarize(resolved.filter((e) => leanDirection(e.verdict) === 'down'))
  const upBaseline = baselineOf(resolved, 'up')
  const downBaseline = baselineOf(resolved, 'down')

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
        close — misses included. Nothing here is curated or removed after the fact; the raw log is a committed file in
        the repo.
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

          <Section title="Resolved calls">
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
                  {resolved.map((e) => (
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
