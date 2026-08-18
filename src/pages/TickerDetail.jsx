import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { TICKERS } from '../lib/tickers'
import { getSeries, hasRealData, screenerDirectionCheck } from '../lib/dataProvider'
import { computeSignals, atrSeries } from '../lib/indicators'
import { readSetup } from '../lib/setupRead'
import { backtestTicker, backtestByScore, bestAvailableStat, mostRecentEvent, SIGNAL_LABELS } from '../lib/backtest'
import { pollLivePrices } from '../lib/livePrice'
import Sparkline from '../components/Sparkline'
import VerdictBadge from '../components/VerdictBadge'
import LivePrice from '../components/LivePrice'
import ShareCard from '../components/ShareCard'
import LeverageStudy from '../components/LeverageStudy'
import BalanceSheetValue from '../components/BalanceSheetValue'
import ScoreBreakdown from '../components/ScoreBreakdown'
import SetupRead from '../components/SetupRead'
import ConfluencePanel from '../components/ConfluencePanel'
import Explain from '../components/Explain'
import SimulateTradeForm from '../components/SimulateTradeForm'
import NotFound from './NotFound'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useBars } from '../lib/useMarketData'
import { pct, rate, price } from '../lib/format'
import { directionBanner } from '../lib/signalValidation'
import { TICKER_CHAPTERS, chapterFor, chapterNeighbours } from '../lib/chapters'
import { ChapterNav, ChapterHead, ChapterPager, useChapterKeys } from '../components/ChapterNav'
import FeedbackLink from '../components/FeedbackLink'
import { useWatchlist } from '../lib/watchlist'
import { riskRead, stopRead, drawdownRead, recoveryRead } from '../lib/riskRead'
import PlainRead from '../components/PlainRead'

export default function TickerDetail() {
  const { symbol, chapter } = useParams()
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

  return <TickerAnalysis symbol={symbol} meta={meta} chapterKey={chapter} />
}

function TickerAnalysis({ symbol, meta, chapterKey }) {
  // SPY too: its trend defines the regime the base rates are matched against.
  const barsReady = useBars([symbol, 'SPY'])
  if (!barsReady) {
    return (
      <div>
        <Link to="/" className="back-link">
          ← Back to screener
        </Link>
        <h1>{symbol}</h1>
        <p className="muted">Loading price history…</p>
      </div>
    )
  }

  // Tracked, but the sync has not fetched it yet — the window between adding a
  // symbol to the list and the next nightly run. loadBars resolves whether or
  // not the file existed, so without this check the page would sail on into
  // getSeries(), which hands back a generated random walk for a symbol it has
  // no bars for. Every indicator, base rate and chart below would then be
  // computed from invented prices and presented as this ticker's. An honest
  // dead end is the only correct output, exactly as for an untracked symbol.
  if (!hasRealData(symbol)) {
    return (
      <div>
        <Link to="/" className="back-link">
          ← Back to screener
        </Link>
        <h1>{symbol}</h1>
        <p className="muted">{meta.name}</p>
        <div className="callout callout-highlight">
          <strong>No price history synced for {symbol} yet.</strong> It is on the tracked list but the daily job has
          not fetched it — most likely it was added since the last run, which happens on weekday evenings. Nothing is
          shown rather than something derived from placeholder data.
        </div>
      </div>
    )
  }

  return <TickerAnalysisBody symbol={symbol} meta={meta} chapterKey={chapterKey} />
}

function TickerAnalysisBody({ symbol, meta, chapterKey }) {
  const watchlist = useWatchlist()
  const chapter = chapterFor(chapterKey)
  const { index } = chapterNeighbours(chapter.key)
  useDocumentTitle(`${symbol} — ${chapter.label}`)
  const bars = getSeries(symbol)
  const closes = bars.map((b) => b.close)
  const spyBars = getSeries('SPY')
  const signals = useMemo(() => computeSignals(bars), [bars])
  const setup_read = useMemo(() => readSetup(bars, signals), [bars, signals])
  const risk = useMemo(() => riskRead({ bars, symbol }), [bars, symbol])
  const stop = useMemo(
    () => stopRead({ bars, symbol, atr: atrSeries(bars, 14).at(-1) }),
    [bars, symbol]
  )
  const drawdown = useMemo(() => drawdownRead({ bars, symbol }), [bars, symbol])
  const recovery = useMemo(
    () => recoveryRead({ bars, symbol, atr: atrSeries(bars, 14).at(-1) }),
    [bars, symbol]
  )
  const backtest = useMemo(() => backtestTicker(bars), [bars])
  const scoreBacktest = useMemo(() => backtestByScore(bars, spyBars), [bars, spyBars])
  const setup = useMemo(() => bestAvailableStat(bars, spyBars), [bars, spyBars])
  const trigger = useMemo(() => mostRecentEvent(bars), [bars])
  // Derived from the self-check, never hardcoded — see directionBanner. Reads
  // the precomputed result rather than recomputing across every tracked
  // symbol on each ticker page view.
  const banner = useMemo(() => directionBanner(screenerDirectionCheck()), [])
  const [liveQuote, setLiveQuote] = useState(null)

  useEffect(() => {
    setLiveQuote(null)
    const controller = new AbortController()
    pollLivePrices([symbol], (_, quote) => setLiveQuote(quote), { signal: controller.signal })
    return () => controller.abort()
  }, [symbol])

  // Chapter one lives at the bare /ticker/:symbol so existing links, the
  // dashboard and every shared card keep working untouched.
  const hrefFor = useCallback(
    (key) => `/ticker/${encodeURIComponent(symbol)}${key === TICKER_CHAPTERS[0].key ? '' : `/${key}`}`,
    [symbol]
  )
  useChapterKeys({ chapters: TICKER_CHAPTERS, current: chapter.key, hrefFor })

  // Turning a page should put you at the top of it. Skipped on first load so
  // a deep link into a chapter does not fight the browser's own restoration.
  // Scroll position and focus are both handled by ChapterHead, which moves
  // focus to the new heading — the browser scrolls it into view as a result,
  // and doing it in one place keeps the two from fighting.

  // The badge is the only claim about *now*, so the caveat that it does not
  // predict direction belongs beside it wherever it appears — but only on the
  // pages the score actually drives.
  const scoreChapter = ['layers', 'signals', 'record'].includes(chapter.key)

  return (
    <div>
      <Link to="/" className="back-link">
        ← Back to screener
      </Link>

      <div className="detail-header">
        <div>
          {/* Starring belongs here as much as on the screener: this is the
              page where someone decides a name is worth following. */}
          <h1 className="detail-title">
            <button
              type="button"
              className={`star star-lg${watchlist.has(symbol) ? ' star-on' : ''}`}
              aria-pressed={watchlist.has(symbol)}
              aria-label={watchlist.has(symbol) ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
              onClick={() => watchlist.toggle(symbol)}
            >
              {watchlist.has(symbol) ? '\u2605' : '\u2606'}
            </button>
            {symbol}
          </h1>
          <p className="muted">{meta.name}</p>
        </div>
        {/* The badge is only what the indicators read right now. Shown alone
            it invites being taken as a forecast, so the historical record for
            this exact setup sits directly under it — including when that
            record disagrees with the badge, which is often. */}
        <div className="detail-verdict">
          {/* The "?" belongs on the badge, not floating ahead of the note
              below it — an unlabelled marker reads as a stray glyph. */}
          <Explain term="verdict">
            <VerdictBadge verdict={signals.verdict} bullishPoints={signals.bullishPoints} bearishPoints={signals.bearishPoints} />
          </Explain>
          <span className="muted small detail-verdict-note">
            {/* Static term on purpose — a computed one would slip past the
                glossary test that checks every term= actually resolves. */}
            <Explain term="winRate">
              {setup.stat
                ? setup.stat.drift == null
                  ? `Historically ${setup.stat.winRate.toFixed(0)}% over ${setup.stat.sampleSize} similar setups`
                  : setup.stat.distinguishable
                  ? // Either direction counts. A setup that reliably lands
                    // BELOW the drift is as much a measurement as one above
                    // it, and calling only the upside "an edge" would put a
                    // thumb on the scale.
                    `Historically ${setup.stat.winRate.toFixed(0)}% over ${setup.stat.sampleSize} similar setups, against ${setup.stat.drift.toFixed(0)}% for this ticker generally — ${
                      setup.stat.gap >= 0 ? 'above' : 'below'
                    } its own drift by ${Math.abs(setup.stat.gap).toFixed(0)} points`
                  : `Historically ${setup.stat.winRate.toFixed(0)}% over ${setup.stat.sampleSize} setups, against ${setup.stat.drift.toFixed(0)}% for this ticker generally — not distinguishable from its own drift`
                : 'No comparable history yet for this setup'}
            </Explain>
          </span>
        </div>
      </div>

      {banner && scoreChapter && (
        <div className="callout impact-note">
          Read the badge as how much the indicators currently agree with each other, not as a direction to expect.{' '}
          {banner} See the <Link to="/methodology/evidence">self-check</Link> for the measurement and its caveats.
        </div>
      )}

      <div className="detail-chart">
        <Sparkline values={closes.slice(-90)} width={480} height={120} />
        <div className="muted small">
          <Explain term="sparkline">Last 90 closes</Explain>
        </div>
      </div>

      {!hasRealData(symbol) && (
        <div className="callout">
          <Explain term="demoData">
            Running on generated demo data (a random walk), not real price history
          </Explain>{' '}
          — either the daily sync hasn't run yet, or it failed to fetch this symbol most recently. The mechanics below
          — divergence detection, base rates, volatility context — are real; the numbers they're computed from aren't.
        </div>
      )}

      {trigger && (
        <div className="callout callout-highlight">
          <strong>{SIGNAL_LABELS[trigger.key]}</strong> — triggered {trigger.barsAgo === 0 ? 'today' : `${trigger.barsAgo} session${trigger.barsAgo > 1 ? 's' : ''} ago`}.{' '}
          <Link to={hrefFor('record')}>See what happened the other times it fired.</Link>
        </div>
      )}

      <ChapterNav chapters={TICKER_CHAPTERS} current={chapter.key} hrefFor={hrefFor} />
      <ChapterHead chapter={chapter} index={index} total={TICKER_CHAPTERS.length} />

      {chapter.key === 'layers' && (
      <Section title={<Explain term="confluence">Confluence: technical, fundamental, macro</Explain>}>
        <ConfluencePanel symbol={symbol} kind={meta.kind} bars={bars} price={signals.price} />
      </Section>

      )}

      {chapter.key === 'signals' && (<>
      <SetupRead setup={setup_read} />

      <Section title={<Explain term="confluenceScore">What's driving this (technical detail)</Explain>}>
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
          <Stat
            label={<Explain term="livePrice">Price</Explain>}
            value={<LivePrice basePrice={signals.price} liveQuote={liveQuote} />}
          />
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
            value={signals.levels.resistance ? price(signals.levels.resistance.price) : 'none nearby'}
            note={signals.levels.resistance ? `Prior swing high on ${signals.levels.resistance.date}` : null}
          />
          <Stat
            label={<Explain term="supportResistance">Nearest support</Explain>}
            value={signals.levels.support ? price(signals.levels.support.price) : 'none nearby'}
            note={signals.levels.support ? `Prior swing low on ${signals.levels.support.date}` : null}
          />
          <Stat
            label={<Explain term="bollingerSqueeze">Bollinger squeeze</Explain>}
            value={signals.squeeze ? (signals.squeeze.isSqueeze ? 'Yes' : 'No') : 'not enough data'}
            note={signals.squeeze ? `Band width is at the ${signals.squeeze.percentile.toFixed(0)}th percentile of its recent range` : null}
          />
        </div>
      </Section>

      {(signals.divergence.lowUnconfirmed || signals.divergence.highUnconfirmed) && (
        <Section title={<Explain term="divergence">Price and momentum disagreeing</Explain>}>
          {signals.divergence.lowUnconfirmed && (
            <p>
              <strong>New low, unconfirmed:</strong> price fell from ${signals.divergence.lowUnconfirmed.priorPrice.toFixed(2)} (
              {signals.divergence.lowUnconfirmed.priorDate}) to a lower low of ${signals.divergence.lowUnconfirmed.recentPrice.toFixed(2)} (
              {signals.divergence.lowUnconfirmed.recentDate}), but RSI rose from {signals.divergence.lowUnconfirmed.priorRsi.toFixed(1)} to{' '}
              {signals.divergence.lowUnconfirmed.recentRsi.toFixed(1)} over the same stretch — momentum did not follow price to the new low. That often precedes a turn, and often does not.
            </p>
          )}
          {signals.divergence.highUnconfirmed && (
            <p>
              <strong>New high, unconfirmed:</strong> price rose from ${signals.divergence.highUnconfirmed.priorPrice.toFixed(2)} (
              {signals.divergence.highUnconfirmed.priorDate}) to a higher high of ${signals.divergence.highUnconfirmed.recentPrice.toFixed(2)} (
              {signals.divergence.highUnconfirmed.recentDate}), but RSI fell from {signals.divergence.highUnconfirmed.priorRsi.toFixed(1)} to{' '}
              {signals.divergence.highUnconfirmed.recentRsi.toFixed(1)} over the same stretch — momentum did not follow price to the new high. That often precedes a turn, and often does not.
            </p>
          )}
        </Section>
      )}

      </>)}

      {chapter.key === 'record' && (<>
      <Section
        title={
          <>
            <Explain term="confluenceScore">Confluence score history</Explain>{' '}
            <Explain term="forwardWindow">(next {scoreBacktest.forwardDays} sessions)</Explain>
          </>
        }
      >
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
                <th><Explain term="winRate">Win %</Explain></th>
                <th><Explain term="avgReturn">Avg return</Explain></th>
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
                  <td>{row.all.sampleSize ? rate(row.all.winRate) : '—'}</td>
                  <td>{row.all.sampleSize ? pct(row.all.avgReturn) : '—'}</td>
                  <td>{row.regimeMatched.sampleSize}</td>
                  <td>{row.regimeMatched.sampleSize ? rate(row.regimeMatched.winRate) : '—'}</td>
                  <td>{row.regimeMatched.sampleSize ? pct(row.regimeMatched.avgReturn) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title={
          <>
            <Explain term="signalEvent">Individual-signal base rates</Explain>{' '}
            <Explain term="forwardWindow">(next {backtest.forwardDays} sessions)</Explain>
          </>
        }
      >
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

      </>)}

      {chapter.key === 'balance-sheet' && (
      <Section title={<Explain term="bookEquity">Balance sheet vs market cap</Explain>}>
        <BalanceSheetValue symbol={symbol} kind={meta.kind} price={signals.price} bars={bars} />
      </Section>

      )}

      {chapter.key === 'risk' && (<>
      <div className="callout">
        Everything below is measured from {symbol}'s own last 250 sessions. It is the one part of this site stated as
        instructions, because size, stop distance, drawdown and recovery time are facts about how this instrument has
        already behaved — not guesses about what it does next. There is deliberately nothing here about whether to
        take a position, or in which direction.
      </div>

      {/* Ordered the way the decisions actually get made: how big, where it is
          wrong, what holding it feels like, and how long that lasts. */}
      {risk && (
        <PlainRead term="riskRead" tone={risk.safeLeverage == null || risk.safeLeverage < 3 ? 'down' : undefined}
          headline={risk.headline} caveat={risk.caveat}>
          {risk.read}
        </PlainRead>
      )}

      {stop && (
        <PlainRead term="stopRead" headline={stop.headline} caveat={stop.caveat}>
          {stop.read}
        </PlainRead>
      )}

      {drawdown && (
        <PlainRead term="drawdownRead" headline={drawdown.headline} caveat={drawdown.caveat}>
          {drawdown.read}
        </PlainRead>
      )}

      {recovery && (
        <PlainRead term="recoveryRead" tone={recovery.neverRecoveredPct >= 25 ? 'down' : undefined}
          headline={recovery.headline} caveat={recovery.caveat}>
          {recovery.read}
        </PlainRead>
      )}
      </>)}

      {chapter.key === 'what-if' && (<>
      <Section title={<Explain term="simulatedTrade">Simulate a trade</Explain>}>
        <SimulateTradeForm symbol={symbol} currentPrice={liveQuote?.price ?? signals.price} />
      </Section>

      <Section title={<Explain term="leverage">What leverage would have done to these signals</Explain>}>
        <LeverageStudy bars={bars} currentScore={scoreBacktest.currentScore} />
      </Section>

      </>)}

      {chapter.key === 'share' && (
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
      )}

      {/* Next to the figures rather than only in the nav. The distance
          between noticing a wrong number and reporting it is where nearly all
          of this kind of feedback is lost, and a link here opens the form with
          the category chosen and this page already attached. */}
      <p className="muted small report-line">
        <FeedbackLink kind="wrong-number" note={`On ${symbol} (${chapter.label}): `}>
          Something on this page look wrong?
        </FeedbackLink>
      </p>

      <ChapterPager chapters={TICKER_CHAPTERS} current={chapter.key} hrefFor={hrefFor} />
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
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
            <span>{rate(result.winRate)}</span>
          </div>
          {result.winRateLow != null && (
            <div className="backtest-row">
              <span className="muted small">
                <Explain term="confidenceInterval">95% range</Explain>
              </span>
              <span className={result.distinguishableFromCoinFlip ? '' : 'muted small'}>
                {result.winRateLow.toFixed(0)}–{rate(result.winRateHigh)}
                {!result.distinguishableFromCoinFlip && ' · spans 50%'}
              </span>
            </div>
          )}
          {/* The row the verdict actually rests on. A win rate only means
              something against the rate this instrument delivers anyway, and
              that comparison used to be missing entirely — the card tested
              against 50% and called the result an edge. */}
          {result.drift != null && (
            <div className="backtest-row">
              <span className="muted small">
                <Explain term="driftBaseline">vs. drift</Explain>
              </span>
              <span className={result.distinguishable ? '' : 'muted small'}>
                {rate(result.drift)} baseline · gap {result.gap >= 0 ? '+' : '−'}
                {Math.abs(result.gap).toFixed(1)}
                {result.gapLow != null && ` (${result.gapLow.toFixed(0)} to ${result.gapHigh.toFixed(0)})`}
                {!result.distinguishable && ' · spans zero'}
              </span>
            </div>
          )}
          <div className="backtest-row">
            <span className="muted small"><Explain term="avgReturn">Avg. return</Explain></span>
            <span>{pct(result.avgReturn)}</span>
          </div>
          <div className="backtest-row">
            <span className="muted small"><Explain term="bestWorst">Best / worst</Explain></span>
            <span>
              {pct(result.bestReturn)} / {pct(result.worstReturn)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
