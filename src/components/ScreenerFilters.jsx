import { useEffect, useRef, useState } from 'react'
import { KIND_LABELS, COLUMNS, DEFAULT_COLUMNS } from '../lib/screenerView'
import Explain from './Explain'

function Chip({ active, onClick, children, title }) {
  return (
    <button
      type="button"
      className={`facet-chip${active ? ' facet-chip-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}

// Multi-select: clicking a chip toggles it rather than replacing the
// selection, because "show me stocks and crypto" is a real question and
// radio-style facets cannot express it.
function toggle(list, key) {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key]
}

// How long the search box waits before writing to the address bar.
//
// This is not a performance tweak, it is a correctness fix. The filter value
// lived in the URL and the input was controlled by it, so every keystroke had
// to survive a round trip through the router before the next one arrived.
// Typing "NVDA" at speed left "A" in the box: each keystroke read a query
// string that had not caught up yet and overwrote the one before it. Slow
// typing hid the bug completely, which is why it survived this long.
//
// So the input is now driven by local state — the thing being typed is the
// thing shown, always — and the URL is brought into line a beat later.
const PUSH_DELAY = 120

export default function ScreenerFilters({ state, facets, onChange, shown, total, watchCount, onExport }) {
  const set = (patch) => onChange({ ...state, ...patch })

  const [draft, setDraft] = useState(state.query)
  // What this component last sent upward. Comparing against it is how a change
  // that came from somewhere else — the "clear the filters" button, or a link
  // opened with a query already in it — is told apart from the echo of our own
  // write coming back around.
  const pushed = useRef(state.query)

  useEffect(() => {
    if (draft === pushed.current) return
    const t = setTimeout(() => {
      pushed.current = draft
      onChange({ ...state, query: draft })
    }, PUSH_DELAY)
    return () => clearTimeout(t)
    // Deliberately keyed on the draft alone: re-running this when an unrelated
    // filter changes would restart the timer and swallow the pending write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  useEffect(() => {
    if (state.query !== pushed.current) {
      pushed.current = state.query
      setDraft(state.query)
    }
  }, [state.query])

  return (
    <div className="screener-filters">
      <div className="filter-row">
        <label className="visually-hidden" htmlFor="screener-q">
          Filter by symbol or name
        </label>
        <input
          id="screener-q"
          type="search"
          className="filter-search"
          placeholder="Filter by symbol or name…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <span className="muted small filter-count" role="status">
          {shown === total ? `${total} tickers` : `${shown} of ${total}`}
        </span>
      </div>

      <div className="facet-groups">
        <div className="facet-group">
          <span className="muted small facet-label">Yours</span>
          <Chip
            active={state.watchlistOnly}
            onClick={() => set({ watchlistOnly: !state.watchlistOnly })}
            title={watchCount ? `${watchCount} starred` : 'Star a row to start a watchlist'}
          >
            Watchlist{watchCount ? ` (${watchCount})` : ''}
          </Chip>
        </div>

        <div className="facet-group">
          <span className="muted small facet-label">Type</span>
          {facets.kinds.map((k) => (
            <Chip key={k} active={state.kinds.includes(k)} onClick={() => set({ kinds: toggle(state.kinds, k) })}>
              {KIND_LABELS[k] ?? k}
            </Chip>
          ))}
        </div>

        <div className="facet-group">
          <span className="muted small facet-label">
            <Explain term="setupRead">Setup</Explain>
          </span>
          {facets.setups.map((s) => (
            <Chip
              key={s.key}
              active={state.setups.includes(s.key)}
              onClick={() => set({ setups: toggle(state.setups, s.key) })}
            >
              {s.name}
            </Chip>
          ))}
        </div>

        <div className="facet-group">
          <span className="muted small facet-label">
            <Explain term="verdict">Confluence</Explain>
          </span>
          {facets.verdicts.map((v) => (
            <Chip
              key={v.key}
              active={state.verdicts.includes(v.key)}
              onClick={() => set({ verdicts: toggle(state.verdicts, v.key) })}
            >
              {v.name}
            </Chip>
          ))}
          {/* Plain text, not an Explain: a "?" is itself a button, and a
              button inside a button is invalid markup that browsers recover
              from by breaking one of the two click targets. The flags term is
              already explained on the column header. */}
          <Chip
            active={state.flagged}
            onClick={() => set({ flagged: !state.flagged })}
            title="Only rows carrying a divergence, squeeze or volume flag"
          >
            Has flags
          </Chip>
        </div>
      </div>

      {/* Columns and export sit below the filters, because they act on the
          result rather than producing it. The row already carries more
          measurement than a fixed table can show; this is how the rest of it
          is reached without making every visitor read all of it. */}
      <details className="column-picker">
        <summary>
          Columns <span className="muted small">({state.columns.length} of {COLUMNS.length})</span>
        </summary>
        <div className="facet-group">
          {COLUMNS.map((c) => (
            <Chip
              key={c.key}
              active={state.columns.includes(c.key)}
              onClick={() => set({ columns: toggle(state.columns, c.key) })}
            >
              {c.label}
            </Chip>
          ))}
          <button type="button" className="link-button" onClick={() => set({ columns: DEFAULT_COLUMNS })}>
            Reset
          </button>
        </div>
      </details>

      <div className="filter-actions">
        <button type="button" className="button-secondary" onClick={onExport}>
          Export {shown === total ? 'all' : `these ${shown}`} as CSV
        </button>
        <span className="muted small">
          Exactly the rows and columns on screen, in the same order, with the numbers unformatted.
        </span>
      </div>
    </div>
  )
}
