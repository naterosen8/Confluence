import { KIND_LABELS } from '../lib/screenerView'
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

export default function ScreenerFilters({ state, facets, onChange, shown, total, watchCount }) {
  const set = (patch) => onChange({ ...state, ...patch })

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
          value={state.query}
          onChange={(e) => set({ query: e.target.value })}
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
    </div>
  )
}
