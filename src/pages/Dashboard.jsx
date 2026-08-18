import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TICKERS } from '../lib/tickers'
import { screenerRows, screenerLeaderboardCheck, screenerMarketRead, HAS_LIVE_DATA, DATA_GENERATED_AT, isSnapshotStale, snapshotAgeDays } from '../lib/dataProvider'
import { leaderboardVerdict } from '../lib/leaderboardCheck'
import MarketRead from '../components/MarketRead'
import { FORWARD_DAYS } from '../lib/backtest'
import { pollLivePrices, HAS_LIVE_PRICE } from '../lib/livePrice'
import Sparkline from '../components/Sparkline'
import VerdictBadge from '../components/VerdictBadge'
import Explain from '../components/Explain'
import LivePrice from '../components/LivePrice'
import { rate } from '../lib/format'
import ScreenerFilters from '../components/ScreenerFilters'
import FeedbackLink from '../components/FeedbackLink'
import { useWatchlist, filterToWatchlist } from '../lib/watchlist'
import {
  SORTS,
  sortRows,
  filterRows,
  availableFacets,
  parseParams,
  toParams,
  isFiltered,
  nextSort,
} from '../lib/screenerView'

function formatSyncTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// A header that sorts. Rendered as a real button inside the th so it is
// reachable by keyboard and announced as pressable, with aria-sort on the th
// itself so a screen reader can report the current ordering rather than
// leaving it as a purely visual cue.
function SortableTh({ sortKey, sort, onSort, term, children }) {
  const active = sort.key === sortKey
  const ariaSort = !active ? 'none' : sort.dir === 1 ? 'ascending' : 'descending'
  return (
    <th aria-sort={ariaSort} className={active ? 'th-sorted' : undefined}>
      <span className="th-inner">
        <button type="button" className="th-sort" onClick={() => onSort(nextSort(sort, sortKey))}>
          <span>{children}</span>
          <span aria-hidden="true" className="sort-caret">
            {active ? (sort.dir === 1 ? '\u25b2' : '\u25bc') : '\u2195'}
          </span>
        </button>
        {term && <Explain term={term} />}
      </span>
    </th>
  )
}

function StarButton({ symbol, starred, onToggle }) {
  return (
    <button
      type="button"
      className={`star${starred ? ' star-on' : ''}`}
      aria-pressed={starred}
      aria-label={starred ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      onClick={() => onToggle(symbol)}
      title={starred ? 'On your watchlist' : 'Add to watchlist'}
    >
      {starred ? '\u2605' : '\u2606'}
    </button>
  )
}

const CLEARED = { query: '', kinds: [], setups: [], verdicts: [], flagged: false, watchlistOnly: false }

export default function Dashboard() {
  const [livePrices, setLivePrices] = useState({})
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const controller = new AbortController()
    const symbols = TICKERS.map((t) => t.symbol)
    pollLivePrices(symbols, (symbol, quote) => setLivePrices((prev) => ({ ...prev, [symbol]: quote })), {
      signal: controller.signal,
    })
    return () => controller.abort()
  }, [])

  // Read straight from the precomputed index rather than downloading every
  // ticker's full history and recomputing RSI, MACD, divergence and a base-rate
  // backtest for all of them before the first row can paint. Identical numbers
  // for every visitor, computed once a day by the job that already has the
  // bars in memory. See src/lib/screener.js.
  const rows = useMemo(() => screenerRows(), [])

  // Filter and sort state lives in the URL, like every other view on this
  // site. A narrowed screener is exactly the kind of thing someone wants to
  // send to another person or reload back into, and state held only in the
  // component is the one view that cannot be.
  const watchlist = useWatchlist()
  const view = useMemo(() => parseParams(searchParams), [searchParams])
  const facets = useMemo(() => availableFacets(rows), [rows])
  const visibleRows = useMemo(() => {
    const filtered = filterRows(rows, view)
    // Composed with the other filters rather than replacing them: "my names,
    // and of those the ones in a pullback" is the question this is for.
    const scoped = view.watchlistOnly ? filterToWatchlist(filtered, watchlist.symbols) : filtered
    return sortRows(scoped, view.sort)
  }, [rows, view, watchlist.symbols])

  const setView = useCallback(
    (next) => {
      // replace, not push: dragging a filter around should not bury the page
      // someone arrived from under a stack of history entries.
      setSearchParams(toParams(next), { replace: true })
    },
    [setSearchParams]
  )
  const setSort = useCallback((sort) => setView({ ...view, sort }), [setView, view])

  const leaderboard = useMemo(() => screenerLeaderboardCheck(), [])
  const market = useMemo(() => screenerMarketRead(), [])

  // Ranked by evidence against each ticker's own drift, which is the same
  // test the verdict sentence below the panel reports.
  //
  // It used to rank by |edge| — distance from a coin flip, weighted by sample
  // size — and said so in the copy directly above a sentence describing a
  // Benjamini-Hochberg correction computed against drift. Two different nulls
  // stacked on the site's most prominent panel, left behind when everything
  // else moved off the coin flip. On live data the two orderings share only
  // two of five names, so this was not a cosmetic mismatch: the panel was
  // promoting a different five than the analysis underneath it had found.
  //
  // The leaderboard already computes a per-row p-value against drift, so this
  // reuses it rather than inventing a third ranking. Ordering by |gap| alone
  // would have been the obvious move and the wrong one — it ignores sample
  // size, so a 41-observation result outranks a 201-observation one.
  const topSetups = useMemo(() => {
    const evidence = new Map((leaderboard?.rows ?? []).map((r) => [r.symbol, r]))
    const survivors = new Set(leaderboard?.survivors ?? [])
    return [...rows]
      .filter((r) => r.stat && r.kind !== 'macro' && evidence.has(r.symbol))
      .map((r) => ({ row: r, ev: evidence.get(r.symbol), survives: survivors.has(r.symbol) }))
      .sort((a, b) => a.ev.p - b.ev.p)
      .slice(0, 5)
  }, [rows, leaderboard])

  return (
    <div>
      {isSnapshotStale() && (
        <div className="callout impact-note">
          <strong>This data is {Math.floor(snapshotAgeDays())} days old.</strong> The daily sync has not completed
          since then, so every price, indicator and base rate on this page describes that date rather than today. It
          is shown rather than hidden, but it should not be read as current.
        </div>
      )}

      {/* The screener had no h1 at all: the outline started at the "Most
          extreme readings" h2, so the site's main page was the one page with
          no top-level heading for a screen reader to land on. */}
      <div className="page-head">
        <h1>Screener</h1>
        <p className="muted small">
          {rows.length} tickers, each scored on the same checks and shown with the record behind them. Click any
          symbol for the full read.
          {rows.length < TICKERS.length && (
            <>
              {' '}
              {TICKERS.length - rows.length} more {TICKERS.length - rows.length === 1 ? 'is' : 'are'} on the tracked
              list but have not been through a sync yet; they appear here once they have real history behind them.
            </>
          )}
        </p>
      </div>

      <MarketRead market={market} />

      <div className="toolbar">
        <span className="muted">
          {HAS_LIVE_DATA ? (
            <Explain term="dailySnapshot">Daily market data — last synced {formatSyncTime(DATA_GENERATED_AT)}</Explain>
          ) : (
            <Explain term="demoData">Demo data — market data syncs daily via GitHub Actions (not run yet)</Explain>
          )}
          {HAS_LIVE_PRICE && <Explain term="livePrice"> + live price ticker (Finnhub)</Explain>}
        </span>
      </div>

      {topSetups.length > 0 && (
        <div className="top-setups">
          <h2>
            <Explain term="driftBaseline">Furthest from their own drift</Explain>
          </h2>
          <p className="muted small">
            Ordered by the strength of the evidence that each ticker's historical win rate differs from the rate that
            ticker delivers anyway — not by distance from a coin flip, which says more about whether the instrument
            rose than about the signal. This is a <em>selection</em>, not a ranking of quality, and a gap can point
            either way: a setup landing reliably <em>below</em> its drift is a measurement too, not an opportunity.
          </p>
          {/* Derived every sync, never hardcoded. The previous wording carried
              a p-value measured once by hand, which would have kept claiming
              the same number however many tickers were added — the one
              hardcoded honesty claim on a site whose other self-checks all
              derive themselves. */}
          <p className="muted small">
            <Explain term="selectionCorrection">{leaderboardVerdict(leaderboard)}</Explain>
          </p>
          <div className="top-setups-grid">
            {topSetups.map(({ row, ev, survives }) => {
              const gap = ev.winRate - ev.driftRate
              return (
                <Link key={row.symbol} to={`/ticker/${encodeURIComponent(row.symbol)}`} className="top-setup-card">
                  <div className="top-setup-head">
                    <strong>{row.symbol}</strong>
                    <VerdictBadge verdict={row.verdict} bullishPoints={row.bullishPoints} bearishPoints={row.bearishPoints} />
                  </div>
                  {/* The comparison, not a rating. "Fell 78% of the time" is
                      what the old card printed for a 22% win rate — true, and
                      framed against a coin flip, which is the wrong reference
                      when this instrument fell about half the time anyway.
                      Above or below its own drift is the fact worth showing,
                      and it is spelled out in words rather than left to colour
                      so it survives being read by someone colourblind. */}
                  <div className={`top-setup-stat top-setup-${gap >= 0 ? 'bullish' : 'bearish'}`}>
                    {gap >= 0 ? '+' : '−'}
                    {Math.abs(gap).toFixed(1)} pts {gap >= 0 ? 'above' : 'below'} its drift
                  </div>
                  <div className="muted small">
                    Won {rate(ev.winRate)} of {ev.sampleSize} against {rate(ev.driftRate)} for this ticker generally.
                    {survives ? ' Survives the selection correction.' : ' Does not survive the selection correction.'}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <h2 className="table-heading">All tracked tickers</h2>

      <ScreenerFilters
        state={view}
        facets={facets}
        onChange={setView}
        shown={visibleRows.length}
        total={rows.length}
        watchCount={watchlist.count}
      />

      <div className="table-wrap">
      <table className="grid">
        <thead>
          {/* The sort control and the "?" are siblings inside the cell, never
              nested. A button inside a button is invalid markup, and it would
              also mean every attempt to read a definition silently re-sorted
              the table under the reader. */}
          <tr>
            <th><span className="visually-hidden">Watchlist</span></th>
            <SortableTh sortKey="symbol" sort={view.sort} onSort={setSort}>Symbol</SortableTh>
            <SortableTh sortKey="price" sort={view.sort} onSort={setSort} term="livePrice">Price</SortableTh>
            <th><Explain term="sparkline">Trend</Explain></th>
            <SortableTh sortKey="rsi" sort={view.sort} onSort={setSort} term="rsi">RSI(14)</SortableTh>
            <SortableTh sortKey="macd" sort={view.sort} onSort={setSort} term="macd">MACD</SortableTh>
            <SortableTh sortKey="setup" sort={view.sort} onSort={setSort} term="setupRead">Setup</SortableTh>
            <SortableTh sortKey="flags" sort={view.sort} onSort={setSort} term="flags">Flags</SortableTh>
            <SortableTh sortKey="edge" sort={view.sort} onSort={setSort} term="edge">Edge</SortableTh>
            <SortableTh sortKey="safeLeverage" sort={view.sort} onSort={setSort} term="riskRead">Max size</SortableTh>
            <SortableTh sortKey="verdict" sort={view.sort} onSort={setSort} term="verdict">Confluence</SortableTh>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            return (
              <tr key={row.symbol} className={watchlist.has(row.symbol) ? 'row-watched' : undefined}>
                <td className="star-cell">
                  <StarButton symbol={row.symbol} starred={watchlist.has(row.symbol)} onToggle={watchlist.toggle} />
                </td>
                <td>
                  <Link to={`/ticker/${encodeURIComponent(row.symbol)}`} className="symbol-link">
                    <strong>{row.symbol}</strong>
                    <span className="muted small">{row.name}</span>
                  </Link>
                </td>
                <td>
                  <LivePrice basePrice={row.price} liveQuote={livePrices[row.symbol]} />
                </td>
                <td>
                  <Sparkline values={row.spark} />
                </td>
                <td>{row.rsi != null ? row.rsi.toFixed(1) : '—'}</td>
                <td>{row.macd ? (row.macd === 'above' ? 'Above signal' : 'Below signal') : '—'}</td>
                <td className={`setup-cell${row.setup ? ` setup-cell-${row.setup.key}` : ''}`}>
                  {row.setup ? row.setup.name : '—'}
                </td>
                <td className="muted small">{row.flags.length ? row.flags.join(', ') : '—'}</td>
                <td className="muted small">
                  {row.stat ? `${rate(row.stat.winRate)} (N=${row.stat.sampleSize})` : '—'}
                </td>
                {/* The size this instrument has already gone through. Low
                    numbers are the signal here, which is why the column sorts
                    ascending first. */}
                <td className={row.risk?.safeLeverage != null && row.risk.safeLeverage <= 3 ? 'size-tight' : undefined}>
                  {row.risk?.safeLeverage != null ? `${row.risk.safeLeverage}x` : '—'}
                </td>
                <td>
                  <VerdictBadge verdict={row.verdict} bullishPoints={row.bullishPoints} bearishPoints={row.bearishPoints} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>

      {/* An empty table with no explanation reads as a broken page. It is a
          real answer — nothing here is doing that right now — and saying so
          is more useful than leaving someone to guess which filter did it. */}
      {visibleRows.length === 0 &&
        (view.watchlistOnly && watchlist.count === 0 ? (
          // An empty watchlist is not a failed filter, and telling someone to
          // "clear the filters" when the real answer is "you have not starred
          // anything yet" sends them looking for a bug that is not there.
          <div className="callout empty-state">
            <strong>Your watchlist is empty.</strong> Star any row with the ☆ beside its symbol and it will collect
            here. Kept in this browser only — no account, and it does not follow you to another device.
          </div>
        ) : (
          <div className="callout empty-state">
            <strong>Nothing matches those filters.</strong> That is an answer rather than an error — none of the{' '}
            {rows.length} tracked tickers is in that state today.{' '}
            <button type="button" className="link-button" onClick={() => setView({ ...view, ...CLEARED })}>
              Clear the filters
            </button>{' '}
            to see all of them again.
          </div>
        ))}

      <p className="muted small report-line">
        <FeedbackLink kind="wrong-number" note="On the screener: ">
          Spotted a number here that looks wrong?
        </FeedbackLink>
      </p>
    </div>
  )
}
