import { describe, it, expect } from 'vitest'
import {
  SORTS,
  DEFAULT_SORT,
  sortRows,
  filterRows,
  availableFacets,
  parseParams,
  toParams,
  isFiltered,
  nextSort,
} from './screenerView.js'

const row = (over = {}) => ({
  symbol: 'AAA',
  name: 'Alpha Inc',
  kind: 'stock',
  price: 100,
  rsi: 50,
  macd: 'above',
  verdict: 'split',
  flags: [],
  setup: { key: 'trend-intact', name: 'Trend intact' },
  stat: { winRate: 55, sampleSize: 40 },
  ...over,
})

const rows = [
  row({ symbol: 'CCC', rsi: 70, price: 300, verdict: 'aligned-up', kind: 'etf', stat: { winRate: 61, sampleSize: 20 } }),
  row({ symbol: 'AAA', rsi: 30, price: 100, verdict: 'aligned-down', flags: ['volatility squeeze'] }),
  row({ symbol: 'BBB', rsi: null, price: 200, verdict: 'split', macd: null, setup: null, stat: null, kind: 'crypto' }),
]

describe('sortRows', () => {
  const order = (key, dir) => sortRows(rows, { key, dir }).map((r) => r.symbol)

  it('sorts by symbol by default', () => {
    expect(sortRows(rows).map((r) => r.symbol)).toEqual(['AAA', 'BBB', 'CCC'])
  })

  it('sorts numerically, both directions', () => {
    expect(order('price', 1)).toEqual(['AAA', 'BBB', 'CCC'])
    expect(order('price', -1)).toEqual(['CCC', 'BBB', 'AAA'])
  })

  // Flipping a sort should reorder the rows that have data, not swap a block
  // of dashes from one end of the table to the other.
  it('keeps rows with no value last in BOTH directions', () => {
    expect(order('rsi', 1)).toEqual(['AAA', 'CCC', 'BBB'])
    expect(order('rsi', -1)).toEqual(['CCC', 'AAA', 'BBB'])
    expect(order('edge', 1).at(-1)).toBe('BBB')
    expect(order('edge', -1).at(-1)).toBe('BBB')
  })

  it('orders the confluence column by lean rather than alphabetically', () => {
    // 'aligned-up' outranks 'split' outranks 'aligned-down'; alphabetically it
    // would be the reverse of that in two places.
    expect(order('verdict', -1)).toEqual(['CCC', 'BBB', 'AAA'])
  })

  it('sorts MACD by side of the signal line, nulls last', () => {
    const o = order('macd', -1)
    expect(o[0]).toBe('AAA')
    expect(o.at(-1)).toBe('BBB')
  })

  // The Edge cell displays a win rate. Sorting it by the signed `edge` field
  // behind it would order the table by a number the reader cannot see.
  it('sorts Edge by the win rate the cell actually shows', () => {
    const rs = [
      row({ symbol: 'LO', stat: { winRate: 20, sampleSize: 10 }, edge: 99 }),
      row({ symbol: 'HI', stat: { winRate: 80, sampleSize: 10 }, edge: -99 }),
    ]
    expect(sortRows(rs, { key: 'edge', dir: -1 }).map((r) => r.symbol)).toEqual(['HI', 'LO'])
  })

  it('breaks ties by symbol so the order is total and stable', () => {
    const tied = [row({ symbol: 'ZZZ', price: 10 }), row({ symbol: 'AAA', price: 10 })]
    expect(sortRows(tied, { key: 'price', dir: -1 }).map((r) => r.symbol)).toEqual(['AAA', 'ZZZ'])
  })

  it('does not mutate the input array', () => {
    const before = rows.map((r) => r.symbol)
    sortRows(rows, { key: 'price', dir: -1 })
    expect(rows.map((r) => r.symbol)).toEqual(before)
  })

  it('falls back to the input order for an unknown key', () => {
    expect(sortRows(rows, { key: 'nope', dir: 1 }).map((r) => r.symbol)).toEqual(rows.map((r) => r.symbol))
  })
})

describe('filterRows', () => {
  it('returns everything with no filters', () => {
    expect(filterRows(rows, {})).toHaveLength(3)
    expect(filterRows(rows)).toHaveLength(3)
  })

  it('matches symbol or name, case-insensitively', () => {
    expect(filterRows(rows, { query: 'aaa' }).map((r) => r.symbol)).toEqual(['AAA'])
    expect(filterRows(rows, { query: 'alpha' })).toHaveLength(3)
    expect(filterRows(rows, { query: '  CcC ' }).map((r) => r.symbol)).toEqual(['CCC'])
  })

  it('treats multiple values within a facet as OR', () => {
    expect(filterRows(rows, { kinds: ['etf', 'crypto'] }).map((r) => r.symbol)).toEqual(['CCC', 'BBB'])
  })

  it('treats separate facets as AND', () => {
    expect(filterRows(rows, { kinds: ['etf'], verdicts: ['aligned-down'] })).toHaveLength(0)
  })

  it('filters to rows carrying a flag', () => {
    expect(filterRows(rows, { flagged: true }).map((r) => r.symbol)).toEqual(['AAA'])
  })

  it('excludes rows with no setup when filtering by setup', () => {
    expect(filterRows(rows, { setups: ['trend-intact'] }).map((r) => r.symbol)).toEqual(['CCC', 'AAA'])
  })
})

describe('availableFacets', () => {
  // Offering a filter for a state nothing is in produces an empty table and
  // reads as a broken page rather than as an honest zero.
  it('offers only values present in the data', () => {
    const f = availableFacets(rows)
    expect(new Set(f.kinds)).toEqual(new Set(['stock', 'etf', 'crypto']))
    expect(f.setups.map((s) => s.key)).toEqual(['trend-intact'])
    expect(f.verdicts.map((v) => v.key)).toEqual(['aligned-up', 'split', 'aligned-down'])
  })

  it('orders verdicts by lean rather than by first appearance', () => {
    const f = availableFacets([rows[1], rows[0]])
    expect(f.verdicts.map((v) => v.key)).toEqual(['aligned-up', 'aligned-down'])
  })

  it('survives rows with nothing on them', () => {
    expect(() => availableFacets([{ symbol: 'X' }])).not.toThrow()
  })
})

describe('URL round-trip', () => {
  const roundTrip = (state) => parseParams(toParams(state))

  it('preserves every field', () => {
    const state = {
      query: 'tsla',
      kinds: ['stock', 'crypto'],
      setups: ['pullback'],
      verdicts: ['aligned-up'],
      flagged: true,
      watchlistOnly: false,
      sort: { key: 'rsi', dir: -1 },
    }
    expect(roundTrip(state)).toEqual(state)
  })

  it('writes nothing for an untouched screener', () => {
    const clean = { query: '', kinds: [], setups: [], verdicts: [], flagged: false, watchlistOnly: false, sort: DEFAULT_SORT }
    expect(toParams(clean).toString()).toBe('')
  })

  it('defaults cleanly from an empty URL', () => {
    expect(parseParams(new URLSearchParams())).toEqual({
      query: '',
      kinds: [],
      setups: [],
      verdicts: [],
      flagged: false,
      watchlistOnly: false,
      sort: DEFAULT_SORT,
    })
  })

  it('ignores a sort key that does not exist rather than sorting by nothing', () => {
    expect(parseParams(new URLSearchParams('sort=haxx:desc')).sort).toEqual(DEFAULT_SORT)
  })

  it('tolerates junk in the list params', () => {
    const p = parseParams(new URLSearchParams('kind=,,stock,,&verdict='))
    expect(p.kinds).toEqual(['stock'])
    expect(p.verdicts).toEqual([])
  })

  it('trims the query so a space is not a filter', () => {
    expect(toParams({ query: '   ', sort: DEFAULT_SORT }).toString()).toBe('')
  })
})

describe('isFiltered', () => {
  it('is false only when nothing is narrowing the table', () => {
    expect(isFiltered({ query: '', kinds: [], setups: [], verdicts: [], flagged: false })).toBe(false)
    expect(isFiltered({ query: '  ', kinds: [], setups: [], verdicts: [], flagged: false })).toBe(false)
    expect(isFiltered({ query: 'a', kinds: [], setups: [], verdicts: [], flagged: false })).toBe(true)
    expect(isFiltered({ query: '', kinds: [], setups: [], verdicts: [], flagged: true })).toBe(true)
  })
})

describe('nextSort', () => {
  it('flips direction when the same column is clicked again', () => {
    expect(nextSort({ key: 'rsi', dir: -1 }, 'rsi')).toEqual({ key: 'rsi', dir: 1 })
    expect(nextSort({ key: 'rsi', dir: 1 }, 'rsi')).toEqual({ key: 'rsi', dir: -1 })
  })

  it('starts a new column at the direction that is useful first', () => {
    // Measurements open on their largest value; names open alphabetically.
    expect(nextSort({ key: 'symbol', dir: 1 }, 'rsi')).toEqual({ key: 'rsi', dir: -1 })
    expect(nextSort({ key: 'rsi', dir: -1 }, 'symbol')).toEqual({ key: 'symbol', dir: 1 })
  })

  it('has a default direction for every sortable column', () => {
    for (const [key, spec] of Object.entries(SORTS)) {
      expect([1, -1], key).toContain(spec.defaultDir)
      expect(typeof spec.get, key).toBe('function')
      expect(spec.label, key).toBeTruthy()
    }
  })
})
