import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { loadCorrelations, screenerRows } from '../lib/dataProvider'
import { overlapRead } from '../lib/overlapRead'
import { pairLookup, CORRELATION_LOOKBACK } from '../lib/correlation'
import { useWatchlist } from '../lib/watchlist'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import PlainRead from '../components/PlainRead'
import Explain from '../components/Explain'

// How much of a basket is one bet.
//
// The gap this fills is structural, not cosmetic. Every other page here
// describes a single instrument, and a screener's output is a list — so the
// site was very good at answering "what is NVDA doing" and had nothing at all
// to say about the thing that actually decides whether a set of positions
// behaves the way the person holding them expects. Filter eighty-nine names
// down to six that all read the same way and the natural conclusion is that
// six opportunities were found. Usually one was.
//
// The basket comes from the watchlist by default, because that is already the
// site's "names I care about" primitive and it works across pages. A
// ?symbols= parameter overrides it, so a specific basket can be linked to and
// argued about without anyone having to reproduce a watchlist.

// Buckets for the shading in the matrix. Coarse on purpose — the difference
// between 0.61 and 0.64 is not a difference anyone should read a decision off,
// and a continuous gradient invites exactly that.
function heat(r) {
  if (r == null) return ''
  if (r >= 0.85) return 'corr-c5'
  if (r >= 0.7) return 'corr-c4'
  if (r >= 0.5) return 'corr-c3'
  if (r >= 0.25) return 'corr-c2'
  if (r > -0.25) return 'corr-c1'
  return 'corr-neg'
}

function SymbolChip({ symbol, onRemove }) {
  return (
    <span className="basket-chip">
      <Link to={`/ticker/${encodeURIComponent(symbol)}`}>{symbol}</Link>
      <button type="button" aria-label={`Remove ${symbol} from the basket`} onClick={() => onRemove(symbol)}>
        ×
      </button>
    </span>
  )
}

export default function Overlap() {
  useDocumentTitle('Overlap')
  const [matrix, setMatrix] = useState(undefined) // undefined = loading, null = unavailable
  const [searchParams, setSearchParams] = useSearchParams()
  const watchlist = useWatchlist()
  const [draft, setDraft] = useState('')

  useEffect(() => {
    loadCorrelations().then((data) => setMatrix(data ?? null))
  }, [])

  const rows = useMemo(() => screenerRows(), [])
  const known = useMemo(() => rows.map((r) => r.symbol), [rows])

  // An explicit ?symbols= wins over the watchlist, so a basket can be linked
  // to. Editing while a link is open edits the link, not the person's saved
  // list — the two are different things and silently merging them would mean
  // opening someone else's basket quietly rewrote your own.
  const linked = searchParams.get('symbols')
  const basket = useMemo(() => {
    if (linked != null) return linked.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    return watchlist.symbols
  }, [linked, watchlist.symbols])

  const setBasket = useCallback(
    (next) => {
      const unique = [...new Set(next)]
      if (linked != null) {
        const p = new URLSearchParams(searchParams)
        if (unique.length) p.set('symbols', unique.join(','))
        else p.delete('symbols')
        setSearchParams(p, { replace: true })
      } else {
        for (const s of watchlist.symbols) if (!unique.includes(s)) watchlist.toggle(s)
        for (const s of unique) if (!watchlist.symbols.includes(s)) watchlist.toggle(s)
      }
    },
    [linked, searchParams, setSearchParams, watchlist]
  )

  const add = useCallback(
    (raw) => {
      const symbol = raw.trim().toUpperCase()
      if (!symbol) return
      if (!known.includes(symbol)) return
      if (basket.includes(symbol)) return
      setBasket([...basket, symbol])
      setDraft('')
    },
    [basket, known, setBasket]
  )

  const read = useMemo(
    () => (matrix ? overlapRead({ matrix, symbols: basket, lookback: matrix.lookback ?? CORRELATION_LOOKBACK }) : null),
    [matrix, basket]
  )
  const at = useMemo(() => (matrix ? pairLookup(matrix) : null), [matrix])

  // The other question the matrix can answer that no ticker page can: which
  // tracked names have not simply been the index in a costume.
  const independents = useMemo(
    () =>
      rows
        .filter((r) => r.corrSpy != null && r.symbol !== 'SPY')
        .sort((a, b) => Math.abs(a.corrSpy) - Math.abs(b.corrSpy))
        .slice(0, 10),
    [rows]
  )

  return (
    <div>
      <Link to="/" className="back-link">
        ← Back to screener
      </Link>

      <h1>Overlap</h1>
      <p className="muted">
        Every other page here reads one instrument. This one reads a basket, and answers the question a list of
        screener results cannot: how many separate positions it actually amounts to once{' '}
        <Explain term="correlation">the fact that its names move together</Explain> is accounted for. Measured over the
        last {matrix?.lookback ?? CORRELATION_LOOKBACK} sessions. It says what the basket has been — not what to hold.
      </p>

      {matrix === undefined && <p className="muted">Loading correlations…</p>}
      {matrix === null && (
        <div className="callout">
          The correlation file has not been generated yet. It is written by the daily sync alongside the screener index
          — until that has run once with this build, there is nothing to measure against.
        </div>
      )}

      {matrix && (
        <>
          <section className="detail-section">
            <h2>The basket</h2>
            <p className="muted small">
              {linked != null ? (
                <>
                  A linked basket, taken from this page’s address. Editing it changes the link only —{' '}
                  <button type="button" className="link-button" onClick={() => setSearchParams({}, { replace: true })}>
                    switch back to your watchlist
                  </button>
                  .
                </>
              ) : (
                <>
                  Your watchlist — the same stars as on the screener. Add names below, or{' '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setSearchParams({ symbols: basket.join(',') }, { replace: false })}
                    disabled={!basket.length}
                  >
                    turn it into a link
                  </button>{' '}
                  to share a basket without touching anyone’s saved list.
                </>
              )}
            </p>

            <div className="basket">
              {basket.length === 0 && <span className="muted small">Nothing in the basket yet.</span>}
              {basket.map((s) => (
                <SymbolChip key={s} symbol={s} onRemove={(sym) => setBasket(basket.filter((x) => x !== sym))} />
              ))}
            </div>

            <form
              className="basket-add"
              onSubmit={(e) => {
                e.preventDefault()
                add(draft)
              }}
            >
              <label className="visually-hidden" htmlFor="basket-add">
                Add a symbol to the basket
              </label>
              <input
                id="basket-add"
                list="basket-symbols"
                value={draft}
                placeholder="Add a symbol…"
                onChange={(e) => setDraft(e.target.value)}
                autoComplete="off"
              />
              <datalist id="basket-symbols">
                {known
                  .filter((s) => !basket.includes(s))
                  .map((s) => (
                    <option key={s} value={s} />
                  ))}
              </datalist>
              <button type="submit" className="button-secondary" disabled={!known.includes(draft.trim().toUpperCase())}>
                Add
              </button>
              {basket.length > 0 && (
                <button type="button" className="link-button" onClick={() => setBasket([])}>
                  Clear
                </button>
              )}
            </form>
          </section>

          {read && (
            <PlainRead
              term="effectiveBets"
              tone={read.tone}
              headline={read.headline}
              caveat={read.caveat}
            >
              {read.read}
            </PlainRead>
          )}

          {read?.count >= 2 && (
            <>
              <div className="record-stats">
                <div className="stat">
                  <span className="muted small">
                    <Explain term="effectiveBets">Independent bets</Explain>
                  </span>
                  <span className="stat-value">{read.effectiveBets?.toFixed(1) ?? '—'}</span>
                  <span className="stat-note">out of {read.count} names</span>
                </div>
                <div className="stat">
                  <span className="muted small">
                    <Explain term="correlation">Average correlation</Explain>
                  </span>
                  <span className="stat-value">{read.meanCorrelation?.toFixed(2) ?? '—'}</span>
                  <span className="stat-note">across {read.pairs.length} pairs</span>
                </div>
                <div className="stat">
                  <span className="muted small">
                    <Explain term="sameBet">Groups at {read.threshold.toFixed(2)}</Explain>
                  </span>
                  <span className="stat-value">{read.groups.length}</span>
                  <span className="stat-note">
                    {read.blocks.length
                      ? `${read.blocks.length} of them ${read.blocks.length === 1 ? 'moves' : 'move'} as a unit`
                      : 'none move as a unit'}
                  </span>
                </div>
              </div>

              {read.blocks.length > 0 && (
                <section className="detail-section">
                  <h2>What moves together</h2>
                  <div className="cluster-grid">
                    {read.groups.map((g) => (
                      <div key={g.members.join('-')} className={`cluster${g.members.length > 1 ? ' cluster-block' : ''}`}>
                        <div className="cluster-members">
                          {g.members.map((s) => (
                            <Link key={s} to={`/ticker/${encodeURIComponent(s)}`}>
                              {s}
                            </Link>
                          ))}
                        </div>
                        <div className="muted small">
                          {g.members.length > 1
                            ? `mean ${g.meanCorrelation.toFixed(2)} — one position wearing ${g.members.length} tickers`
                            : 'on its own'}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="detail-section">
                <h2>Pair by pair</h2>
                <div className="score-table-wrap">
                  <table className="score-table corr-matrix">
                    <thead>
                      <tr>
                        <th />
                        {read.held.map((s) => (
                          <th key={s} className="num">
                            {s}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {read.held.map((rowSym) => (
                        <tr key={rowSym}>
                          <th scope="row">{rowSym}</th>
                          {read.held.map((colSym) => {
                            const r = rowSym === colSym ? null : at(rowSym, colSym)
                            return (
                              <td key={colSym} className={`num ${rowSym === colSym ? 'corr-self' : heat(r)}`}>
                                {rowSym === colSym ? '·' : r == null ? '—' : r.toFixed(2)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted small">
                  Shaded by band rather than by a continuous gradient, because the difference between 0.61 and 0.64 is
                  not one to read a decision off. A dash means the two have not shared enough sessions to measure.
                </p>
              </section>
            </>
          )}

          <section className="detail-section">
            <h2>Least tied to the index</h2>
            <p className="muted small">
              The tracked names whose daily moves have been furthest from SPY’s over the same window — measured by
              distance from zero, so a name that reliably moves opposite the index is not counted as independent of it.
              This is a fact about the last {matrix.lookback ?? CORRELATION_LOOKBACK} sessions and nothing more.
            </p>
            <div className="score-table-wrap">
              <table className="score-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th className="text">Name</th>
                    <th className="num">
                      <Explain term="correlation">vs SPY</Explain>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {independents.map((r) => (
                    <tr key={r.symbol}>
                      <td>
                        <Link to={`/ticker/${encodeURIComponent(r.symbol)}`}>
                          <strong>{r.symbol}</strong>
                        </Link>
                      </td>
                      <td className="muted text">{r.name}</td>
                      <td className={`num ${heat(r.corrSpy)}`}>{r.corrSpy.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
