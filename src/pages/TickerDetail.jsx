import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { TICKERS } from '../lib/tickers'
import { getSeries, hasRealData } from '../lib/dataProvider'
import { computeSignals } from '../lib/indicators'
import { backtestTicker, backtestByScore, bestAvailableStat, mostRecentEvent, SIGNAL_LABELS } from '../lib/backtest'
import { pollLivePrices } from '../lib/livePrice'
import Sparkline from '../components/Sparkline'
import VerdictBadge from '../components/VerdictBadge'
import LivePrice from '../components/LivePrice'
import ShareCard from '../components/ShareCard'
import LeverageStudy from '../components/LeverageStudy'
import BalanceSheetValue from '../components/BalanceSheetValue'
import ScoreBreakdown from '../components/ScoreBreakdown'
import ConfluencePanel from '../components/ConfluencePanel'
import Explain from '../components/Explain'
import SimulateTradeForm from '../components/SimulateTradeForm'
import NotFound from './NotFound'
import { useDocumentTitle } from '../lib/useDocumentTitle'

function pct(v, digits = 2) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`
}

export default function TickerDetail() {
  const { symbol } = useParams()
  const meta = TICKERS.find((t) => t.symbol === symbol)

  // Bail out before computing anything. getSeries() falls back to a demo
  // random walk for symbols it doesn't know, which for an untracked ticker
  // meant rendering a full verdict, base-rate tables and a shareable card
  // captioned "backtested against real history" — for a symbol this app has
  // never fetched. An honest dead end is the only correct output here.
  if (!meta) {
    return (
      <NotFound
        title={`${symbol} isn't tracked here`}
        message={`Confluence analyzes a fixed, curated list of ${TICKERS.length} symbols so every one of them has real synced price history behind it. ${symbol} isn't on that list, so there's nothing genuine to show.`}
      />
    )
  }

  return <TickerAnalysis symbol={symbol} meta={meta} />
}

function TickerAnalysis({ symbol, meta }) {
  useDocumentTitle(`${symbol} — ${meta.name}`)
  const bars = getSeries(symbol)
  const closes = bars.map((b) => b.close)
  const spyBars = getSeries('SPY')
  const signals = useMemo(() => computeSignals(bars), [bars])
  const backtest = useMemo(() => backtestTicker(bars), [bars])
  const scoreBacktest = useMemo(() => backtestByScore(bars, spyBars), [bars, spyBars])
  const setup = useMemo(() => bestAvailableStat(bars, spyBars), [bars, spyBars])
  const trigger = useMemo(() => mostRecentEvent(bars), [bars])
  const [liveQuote, setLiveQuote] = useState(null)

  useEffect(() => {
    setLiveQuote(null)
    const controller = new AbortController()
    pollLivePrices([symbol], (_, quote) => setLiveQuote(quote), { signal: controller.signal })
    return () => controller.abort()
  }, [symbol])

  return (
    <div>
      <Link to="/" className="back-link">
        ← Back to screener
      </Link>

      <div className="detail-header">
        <div>
          <h1>{symbol}</h1>
          <p className="muted">{meta.name}</p>
        </div>
        {/* The badge is only what the indicators read right now. Shown alone
            it invites being taken as a forecast, so the historical record for
            this exact setup sits directly under it — including when that
            record disagrees with the badge, which is often. */}
        <div className="detail-verdict">
          <VerdictBadge verdict={signals.verdict} />
          <span className="muted small detail-verdict-note">
            <Explain term="verdict" />{' '}
            {setup.stat
              ? setup.stat.distinguishable
                ? `Historically ${setup.stat.winRate.toFixed(0)}% won over ${setup.stat.sampleSize} similar setups`
                : `Historically ${setup.stat.winRate.toFixed(0)}% over ${setup.stat.sampleSize} setups — not distinguishable from chance`
              : 'No comparable history yet for this setup'}
          </span>
        </div>
      </div>

      <div className="detail-chart">
        <Sparkline values={closes.slice(-90)} width={480} height={120} />
      </div>

      <Section title="Simulate a trade">
        <SimulateTradeForm symbol={symbol} currentPrice={liveQuote?.price ?? signals.price} />
      </Section>

      {!hasRealData(symbol) && (
        <div className="callout">
          Running on generated demo data (a random walk), not real price history — either the daily sync hasn't run
          yet, or it failed to fetch this symbol most recently. The mechanics below — divergence detection, base
          rates, volatility context — are real; the numbers they're computed from aren't.
        </div>
      )}

      {trigger && (
        <div className="callout callout-highlight">
          <strong>{SIGNAL_LABELS[trigger.key]}</strong> — triggered {trigger.barsAgo === 0 ? 'today' : `${trigger.barsAgo} session${trigger.barsAgo > 1 ? 's' : ''} ago`}.
          See the base rate for this exact setup below.
        </div>
      )}

      <Section title="Confluence: technical, fundamental, macro">
        <ConfluencePanel symbol={symbol} kind={meta.kind} bars={bars} price={signals.price} />
      </Section>

      <Section title="What's driving this (technical detail)">
        <ScoreBreakdown signals={signals} />
        {signals.notes.length > 0 && (
          <details className="detail-notes">
            <summary className="muted small">Read each signal in full</summary>
            <ul>
              {signals.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section title="Volatility, volume & structure">
        <div className="stat-grid">
          <Stat label="Price" value={<LivePrice basePrice={signals.price} liveQuote={liveQuote} />} />
          <Stat
            label={<Explain term="atrPercentile">Volatility (ATR percentile)</Explain>}
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
            label={<Explain term="relativeVolume">Relative volume</Explain>}
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
            label={<Explain term="supportResistance">Nearest resistance</Explain>}
            value={signals.levels.resistance ? `$${signals.levels.resistance.price.toFixed(2)}` : 'none nearby'}
            note={signals.levels.resistance ? `Prior swing high on ${signals.levels.resistance.date}` : null}
          />
          <Stat
            label={<Explain term="supportResistance">Nearest support</Explain>}
            value={signals.levels.support ? `$${signals.levels.support.price.toFixed(2)}` : 'none nearby'}
            note={signals.levels.support ? `Prior swing low on ${signals.levels.support.date}` : null}
          />
          <Stat
            label={<Explain term="bollingerSqueeze">Bollinger squeeze</Explain>}
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

      <Section title={`Confluence score history (next ${scoreBacktest.forwardDays} sessions)`}>
        <p className="muted small">
          Individual events (below) tell you whether one mechanism has mattered on its own. This is the more honest
          "confluence" question: every day in this ticker's history is scored on RSI + MACD + trend + weekly
          alignment, grouped by that score, and compared to what happened next. Today's market is currently{' '}
          <strong>{scoreBacktest.currentRegimeLabel || 'unclassified'}</strong> (based on SPY's own trend) — the
          "regime-matched" column restricts the sample to days when the broader market was in the same kind of regime
          as today, which is usually a much smaller, more relevant sample than "all history."
        </p>
        <p className="muted small">
          Note: this score deliberately excludes divergence (recomputing swing structure for every day in the
          history is expensive) — the verdict badge above does include it. When a divergence is flagged, the badge
          above and the score highlighted as "today" below can disagree by one tier; the divergence writeup further
          down still applies even though it isn't reflected in this table's numbers.
        </p>
        <p className="muted small">
          Also worth weighing: occurrences of the same score that fall close together in time share overlapping
          price history (a 5-session forward window started yesterday overlaps most of today's), so a large N here
          reflects fewer truly independent market episodes than the raw count suggests — read it as directional
          evidence, not a rigorous statistical sample.
        </p>
        <div className="score-table-wrap">
          <table className="score-table">
            <thead>
              <tr>
                <th><Explain term="confluenceScore">Score</Explain></th>
                <th colSpan={3}>All history</th>
                <th colSpan={3}>Regime-matched ({scoreBacktest.currentRegimeLabel || '—'})</th>
              </tr>
              <tr className="score-table-subhead">
                <th></th>
                <th><Explain term="sampleSize">N</Explain></th>
                <th><Explain term="winRate">Win %</Explain></th>
                <th><Explain term="avgReturn">Avg return</Explain></th>
                <th><Explain term="regimeMatched">N</Explain></th>
                <th>Win %</th>
                <th>Avg return</th>
              </tr>
            </thead>
            <tbody>
              {scoreBacktest.rows.map((row) => (
                <tr key={row.score} className={row.score === scoreBacktest.currentScore ? 'score-row-active' : ''}>
                  <td>
                    <strong>{row.score > 0 ? `+${row.score}` : row.score}</strong>
                    {row.score === scoreBacktest.currentScore && <span className="muted small"> ← today</span>}
                  </td>
                  <td>{row.all.sampleSize}</td>
                  <td>{row.all.sampleSize ? `${row.all.winRate.toFixed(0)}%` : '—'}</td>
                  <td>{row.all.sampleSize ? pct(row.all.avgReturn) : '—'}</td>
                  <td>{row.regimeMatched.sampleSize}</td>
                  <td>{row.regimeMatched.sampleSize ? `${row.regimeMatched.winRate.toFixed(0)}%` : '—'}</td>
                  <td>{row.regimeMatched.sampleSize ? pct(row.regimeMatched.avgReturn) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Balance sheet vs market cap">
        <BalanceSheetValue symbol={symbol} kind={meta.kind} price={signals.price} bars={bars} />
      </Section>

      <Section title="What leverage would have done to these signals">
        <LeverageStudy bars={bars} currentScore={scoreBacktest.currentScore} />
      </Section>

      <Section title={`Individual-signal base rates (next ${backtest.forwardDays} sessions)`}>
        <p className="muted small">
          Every prior time each single event fired in this ticker's tracked history, forward-looking outcome. Small
          sample sizes are common and are called out — treat anything under ~15 occurrences as a hint, not a statistic.
        </p>
        <div className="backtest-grid">
          {Object.entries(SIGNAL_LABELS).map(([key, label]) => (
            <BacktestCard key={key} label={label} result={backtest[key]} active={trigger?.key === key} />
          ))}
        </div>
      </Section>

      <Section title="Share this setup">
        <p className="muted small">
          Generates a downloadable image and a ready-to-paste caption from what's on this page right now — the
          disclaimer is baked into the caption automatically.
        </p>
        <ShareCard
          symbol={symbol}
          name={meta.name}
          price={signals.price}
          verdict={signals.verdict}
          closes={closes.slice(-90)}
          stat={setup.stat}
          statSource={setup.source}
        />
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
            <span className="muted small"><Explain term="sampleSize">Sample size</Explain></span>
            <span>{result.sampleSize} occurrence{result.sampleSize > 1 ? 's' : ''}</span>
          </div>
          <div className="backtest-row">
            <span className="muted small"><Explain term="winRate">Win rate</Explain></span>
            <span>{result.winRate.toFixed(0)}%</span>
          </div>
          {result.winRateLow != null && (
            <div className="backtest-row">
              <span className="muted small">
                <Explain term="confidenceInterval">95% range</Explain>
              </span>
              <span className={result.distinguishable ? '' : 'muted small'}>
                {result.winRateLow.toFixed(0)}–{result.winRateHigh.toFixed(0)}%
                {!result.distinguishable && ' · spans 50%'}
              </span>
            </div>
          )}
          <div className="backtest-row">
            <span className="muted small"><Explain term="avgReturn">Avg. return</Explain></span>
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
