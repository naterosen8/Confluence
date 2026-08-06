import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { TICKERS } from '../lib/tickers'
import { getSeries, HAS_LIVE_DATA } from '../lib/dataProvider'
import { computeSignals } from '../lib/indicators'
import { backtestTicker, mostRecentEvent, SIGNAL_LABELS } from '../lib/backtest'
import Sparkline from '../components/Sparkline'
import VerdictBadge from '../components/VerdictBadge'

function pct(v, digits = 2) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`
}

export default function TickerDetail() {
  const { symbol } = useParams()
  const meta = TICKERS.find((t) => t.symbol === symbol)
  const bars = getSeries(symbol)
  const closes = bars.map((b) => b.close)
  const signals = useMemo(() => computeSignals(bars), [bars])
  const backtest = useMemo(() => backtestTicker(bars), [bars])
  const trigger = useMemo(() => mostRecentEvent(bars), [bars])

  return (
    <div>
      <Link to="/" className="back-link">
        ← Back to screener
      </Link>

      <div className="detail-header">
        <div>
          <h1>{symbol}</h1>
          <p className="muted">{meta?.name || 'Unknown ticker'}</p>
        </div>
        <VerdictBadge verdict={signals.verdict} />
      </div>

      <div className="detail-chart">
        <Sparkline values={closes.slice(-90)} width={480} height={120} />
      </div>

      {!HAS_LIVE_DATA && (
        <div className="callout">
          Running on generated demo data (a random walk), not real price history. The mechanics below — divergence
          detection, base rates, volatility context — are real; the numbers they're computed from aren't, until a
          data source is connected.
        </div>
      )}

      {trigger && (
        <div className="callout callout-highlight">
          <strong>{SIGNAL_LABELS[trigger.key]}</strong> — triggered {trigger.barsAgo === 0 ? 'today' : `${trigger.barsAgo} session${trigger.barsAgo > 1 ? 's' : ''} ago`}.
          See the base rate for this exact setup below.
        </div>
      )}

      <Section title="What's driving this">
        {signals.notes.length ? (
          <ul>
            {signals.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No indicator is showing a strong lean right now.</p>
        )}
      </Section>

      <Section title="Volatility, volume & structure">
        <div className="stat-grid">
          <Stat label="Price" value={`$${signals.price.toFixed(2)}`} />
          <Stat
            label="Volatility (ATR percentile)"
            value={signals.atrPercentile != null ? `${signals.atrPercentile.toFixed(0)}th` : 'not enough data'}
            note={
              signals.atrPercentile == null
                ? null
                : signals.atrPercentile < 30
                ? 'Compressed vs. its own recent range — often precedes a bigger move, direction unknown'
                : signals.atrPercentile > 70
                ? 'Elevated vs. its own recent range — a move may already be underway or overdone'
                : 'Typical for this ticker recently'
            }
          />
          <Stat
            label="Relative volume"
            value={signals.relVolume != null ? `${signals.relVolume.toFixed(2)}x avg` : 'not enough data'}
            note={
              signals.relVolume == null
                ? null
                : signals.relVolume >= 1.5
                ? 'Elevated — today\'s move has real participation behind it'
                : signals.relVolume < 0.7
                ? 'Below average — today\'s move has thin participation, treat it skeptically'
                : 'Roughly normal'
            }
          />
          <Stat
            label="Nearest resistance"
            value={signals.levels.resistance ? `$${signals.levels.resistance.price.toFixed(2)}` : 'none nearby'}
            note={signals.levels.resistance ? `Prior swing high on ${signals.levels.resistance.date}` : null}
          />
          <Stat
            label="Nearest support"
            value={signals.levels.support ? `$${signals.levels.support.price.toFixed(2)}` : 'none nearby'}
            note={signals.levels.support ? `Prior swing low on ${signals.levels.support.date}` : null}
          />
          <Stat
            label="Bollinger squeeze"
            value={signals.squeeze ? (signals.squeeze.isSqueeze ? 'Yes' : 'No') : 'not enough data'}
            note={signals.squeeze ? `Band width is at the ${signals.squeeze.percentile.toFixed(0)}th percentile of its recent range` : null}
          />
        </div>
      </Section>

      {(signals.divergence.bullish || signals.divergence.bearish) && (
        <Section title="Divergence">
          {signals.divergence.bullish && (
            <p>
              <strong>Bullish:</strong> price fell from ${signals.divergence.bullish.priorPrice.toFixed(2)} (
              {signals.divergence.bullish.priorDate}) to a lower low of ${signals.divergence.bullish.recentPrice.toFixed(2)} (
              {signals.divergence.bullish.recentDate}), but RSI rose from {signals.divergence.bullish.priorRsi.toFixed(1)} to{' '}
              {signals.divergence.bullish.recentRsi.toFixed(1)} over the same stretch — selling pressure is weakening even as price
              makes new lows.
            </p>
          )}
          {signals.divergence.bearish && (
            <p>
              <strong>Bearish:</strong> price rose from ${signals.divergence.bearish.priorPrice.toFixed(2)} (
              {signals.divergence.bearish.priorDate}) to a higher high of ${signals.divergence.bearish.recentPrice.toFixed(2)} (
              {signals.divergence.bearish.recentDate}), but RSI fell from {signals.divergence.bearish.priorRsi.toFixed(1)} to{' '}
              {signals.divergence.bearish.recentRsi.toFixed(1)} over the same stretch — buying pressure is weakening even as price
              makes new highs.
            </p>
          )}
        </Section>
      )}

      <Section title={`Historical base rates (next ${backtest.forwardDays} sessions)`}>
        <p className="muted small">
          Every prior time each event fired in this ticker's tracked history, forward-looking outcome. Small sample
          sizes are common and are called out — treat anything under ~15 occurrences as a hint, not a statistic.
        </p>
        <div className="backtest-grid">
          {Object.entries(SIGNAL_LABELS).map(([key, label]) => (
            <BacktestCard key={key} label={label} result={backtest[key]} active={trigger?.key === key} />
          ))}
        </div>
      </Section>
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

function Stat({ label, value, note }) {
  return (
    <div className="stat">
      <span className="muted small">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  )
}

function BacktestCard({ label, result, active }) {
  return (
    <div className={`backtest-card${active ? ' backtest-card-active' : ''}`}>
      <div className="backtest-label">{label}</div>
      {!result || result.sampleSize === 0 ? (
        <p className="muted small">Hasn't occurred in the tracked history.</p>
      ) : (
        <>
          <div className="backtest-row">
            <span className="muted small">Sample size</span>
            <span>{result.sampleSize} occurrence{result.sampleSize > 1 ? 's' : ''}</span>
          </div>
          <div className="backtest-row">
            <span className="muted small">Win rate</span>
            <span>{result.winRate.toFixed(0)}%</span>
          </div>
          <div className="backtest-row">
            <span className="muted small">Avg. return</span>
            <span>{pct(result.avgReturn)}</span>
          </div>
          <div className="backtest-row">
            <span className="muted small">Best / worst</span>
            <span>
              {pct(result.bestReturn)} / {pct(result.worstReturn)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
