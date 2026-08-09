import { useMemo } from 'react'
import { TICKERS } from '../lib/tickers'
import { getSeries } from '../lib/dataProvider'
import { cachedScoreDirectionCheck, DIRECTION_COPY } from '../lib/signalValidation'

// Publishes the app's own self-check. If the score does not predict what its
// label implies, that belongs on the site rather than in a private notebook.
export default function SignalCheck() {
  const result = useMemo(() => {
    const bySymbol = {}
    for (const t of TICKERS) bySymbol[t.symbol] = getSeries(t.symbol)
    return cachedScoreDirectionCheck(bySymbol, TICKERS.map((t) => t.symbol))
  }, [])

  if (!result) return <p className="muted small">{DIRECTION_COPY.unknown.detail}</p>
  const copy = DIRECTION_COPY[result.direction]
  const maxAbs = Math.max(...result.rows.map((r) => Math.abs(r.meanReturn)), 0.01)

  return (
    <div className="signal-check">
      <div className={`callout ${result.direction === 'inverted' ? 'impact-note' : 'callout-highlight'}`}>
        <strong>{copy.headline}</strong>
        <div style={{ marginTop: 6 }}>{copy.detail}</div>
      </div>

      <p className="muted small">
        Correlation between the score and the next {result.forwardDays} sessions' return, measured per ticker across{' '}
        {result.tickerCount} symbols: mean <strong>{result.meanCorr.toFixed(3)}</strong> (95% CI{' '}
        {result.lower.toFixed(3)} to {result.upper.toFixed(3)}).{' '}
        <strong>
          {result.negativeCount} of {result.tickerCount}
        </strong>{' '}
        tickers show a negative relationship.
      </p>

      <div className="score-table-wrap">
        <table className="score-table">
          <thead>
            <tr>
              <th>Score</th>
              <th>Observations</th>
              <th>Mean return over next {result.forwardDays} sessions</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.score}>
                <td>
                  <strong>
                    {r.score > 0 ? '+' : ''}
                    {r.score}
                  </strong>
                </td>
                <td>{r.n}</td>
                <td className={r.meanReturn >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                  {r.meanReturn >= 0 ? '+' : ''}
                  {r.meanReturn.toFixed(2)}%
                </td>
                <td style={{ width: '40%' }}>
                  <span
                    className={`bucket-bar bucket-bar-${r.meanReturn >= 0 ? 'pos' : 'neg'}`}
                    style={{ width: `${(Math.abs(r.meanReturn) / maxAbs) * 100}%` }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted small">
        If the badge's wording described the outcome, this column would rise with the score. Caveats that cut both
        ways: this is one window of roughly {result.scoredDays} scored sessions per ticker, those sessions overlap
        heavily, and the tickers are mostly correlated US equities — so this is closer to one observation of one market
        period than to {result.tickerCount} independent tests. It is not evidence that inverting the signal would make
        money, which would be the same overfitting error in reverse, and costs would consume a gap this size.
      </p>
    </div>
  )
}
