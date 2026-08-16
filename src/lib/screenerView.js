import { LEAN_BANDS } from './lean.js'

// Sorting and filtering for the screener table.
//
// Twenty-four rows fit on a screen and can be read straight through, so the
// table has never needed either. That stops being true at the size this is
// heading for: the payload work is done — a row is a few hundred bytes and
// the index carries a hundred-plus tickers comfortably — but a hundred rows
// in fixed alphabetical order with no way to narrow them is a worse screener
// than twenty-four, not a better one. The point of a screener is to answer
// "which of these is doing the thing I care about", and that question has no
// affordance on the page today.
//
// Kept as pure functions over the row array so the whole thing is testable
// without a browser, and so the table component stays a table component.
//
// One rule throughout: sort by what the cell actually displays. A column
// showing a win rate sorts by win rate, not by the signed edge behind it.
// Sorting by a number the reader cannot see is how a table becomes
// untrustworthy.

// Rows with nothing in the sorted column go last in BOTH directions. Flipping
// a sort should reorder the rows that have data, not swap a block of dashes
// from one end to the other.
function nullsLast(a, b, dir) {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return null
}

const compare = (av, bv, dir) => {
  const n = nullsLast(av, bv, dir)
  if (n !== null) return n
  if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * dir
  return (av - bv) * dir
}

// Score order for the confluence column, derived from the bands rather than
// written out again — a new band would otherwise sort as unranked.
const LEAN_ORDER = new Map(LEAN_BANDS.map((b, i) => [b.key, LEAN_BANDS.length - i]))

export const SORTS = {
  symbol: { label: 'Symbol', get: (r) => r.symbol, defaultDir: 1 },
  price: { label: 'Price', get: (r) => r.price, defaultDir: -1 },
  rsi: { label: 'RSI', get: (r) => r.rsi, defaultDir: -1 },
  // Above the signal line first when descending, and rows with no MACD last.
  macd: { label: 'MACD', get: (r) => (r.macd == null ? null : r.macd === 'above' ? 1 : 0), defaultDir: -1 },
  setup: { label: 'Setup', get: (r) => r.setup?.name ?? null, defaultDir: 1 },
  flags: { label: 'Flags', get: (r) => r.flags?.length ?? 0, defaultDir: -1 },
  // What the cell shows is the win rate and its sample size, so that is what
  // it sorts on — not `edge`, which is signed and weighted and invisible.
  edge: { label: 'Edge', get: (r) => r.stat?.winRate ?? null, defaultDir: -1 },
  verdict: { label: 'Confluence', get: (r) => LEAN_ORDER.get(r.verdict) ?? null, defaultDir: -1 },
}

export const DEFAULT_SORT = { key: 'symbol', dir: 1 }

export function sortRows(rows, sort = DEFAULT_SORT) {
  const spec = SORTS[sort?.key]
  if (!spec) return [...rows]
  const dir = sort.dir === -1 ? -1 : 1
  return [...rows].sort((a, b) => {
    const primary = compare(spec.get(a), spec.get(b), dir)
    // Ties resolve by symbol so the order is total and stable — otherwise the
    // same data can paint in two different orders across renders.
    return primary !== 0 ? primary : a.symbol.localeCompare(b.symbol)
  })
}

export const KIND_LABELS = { stock: 'Stocks', etf: 'ETFs', crypto: 'Crypto', macro: 'Macro' }

export function filterRows(rows, { query = '', kinds = [], setups = [], verdicts = [], flagged = false } = {}) {
  const q = query.trim().toLowerCase()
  const kindSet = new Set(kinds)
  const setupSet = new Set(setups)
  const verdictSet = new Set(verdicts)

  return rows.filter((r) => {
    if (q && !r.symbol.toLowerCase().includes(q) && !(r.name ?? '').toLowerCase().includes(q)) return false
    if (kindSet.size && !kindSet.has(r.kind)) return false
    if (setupSet.size && !setupSet.has(r.setup?.key)) return false
    if (verdictSet.size && !verdictSet.has(r.verdict)) return false
    if (flagged && !(r.flags?.length > 0)) return false
    return true
  })
}

// Which filter values are actually present in this data. A filter offering
// "capitulation" when nothing is capitulating produces an empty table and
// reads as a broken page rather than as an honest zero.
export function availableFacets(rows) {
  const kinds = new Set()
  const setups = new Map()
  const verdicts = new Set()
  for (const r of rows) {
    if (r.kind) kinds.add(r.kind)
    if (r.setup?.key) setups.set(r.setup.key, r.setup.name ?? r.setup.key)
    if (r.verdict) verdicts.add(r.verdict)
  }
  return {
    kinds: [...kinds],
    setups: [...setups].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name)),
    verdicts: LEAN_BANDS.filter((b) => verdicts.has(b.key)).map((b) => ({ key: b.key, name: b.short })),
  }
}

// --- URL state -------------------------------------------------------------
// A filtered screener is a view worth linking to, and the site already treats
// every other view that way — chapters are URLs precisely so they can be sent
// to someone. A filter that lives only in component state is the one view you
// cannot share or reload back into.

const LIST_KEYS = ['kind', 'setup', 'verdict']

export function parseParams(params) {
  const get = (k) => params.get(k) ?? ''
  const list = (k) => get(k).split(',').map((s) => s.trim()).filter(Boolean)
  const [key, dirRaw] = get('sort').split(':')
  return {
    query: get('q'),
    kinds: list('kind'),
    setups: list('setup'),
    verdicts: list('verdict'),
    flagged: get('flagged') === '1',
    sort: SORTS[key] ? { key, dir: dirRaw === 'desc' ? -1 : 1 } : DEFAULT_SORT,
  }
}

// Only non-default state is written, so an untouched screener keeps a clean
// URL and the back button does not walk through a trail of identical views.
export function toParams({ query, kinds, setups, verdicts, flagged, sort }) {
  const p = new URLSearchParams()
  if (query?.trim()) p.set('q', query.trim())
  const lists = { kind: kinds, setup: setups, verdict: verdicts }
  for (const k of LIST_KEYS) if (lists[k]?.length) p.set(k, lists[k].join(','))
  if (flagged) p.set('flagged', '1')
  if (sort && (sort.key !== DEFAULT_SORT.key || sort.dir !== DEFAULT_SORT.dir)) {
    p.set('sort', `${sort.key}:${sort.dir === -1 ? 'desc' : 'asc'}`)
  }
  return p
}

export function isFiltered({ query, kinds, setups, verdicts, flagged }) {
  return Boolean(query?.trim() || kinds?.length || setups?.length || verdicts?.length || flagged)
}

// Clicking the active column flips it; clicking a new one starts at whichever
// direction is useful first for that column — descending for a measurement,
// ascending for a name.
export function nextSort(current, key) {
  if (current?.key === key) return { key, dir: current.dir === 1 ? -1 : 1 }
  return { key, dir: SORTS[key]?.defaultDir ?? 1 }
}
