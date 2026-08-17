import { describe, it, expect } from 'vitest'
import { filterToWatchlist } from './watchlist.js'
import { parseParams, toParams, isFiltered, DEFAULT_SORT } from './screenerView.js'

describe('filterToWatchlist', () => {
  const rows = [{ symbol: 'AAPL' }, { symbol: 'BTC/USD' }, { symbol: 'SPY' }]

  it('keeps only starred symbols', () => {
    expect(filterToWatchlist(rows, ['SPY', 'AAPL']).map((r) => r.symbol)).toEqual(['AAPL', 'SPY'])
  })

  // Strict rather than a no-op. Returning every row for an empty watchlist
  // leaves the chip visibly active with all 24 tickers still listed, which
  // reads as a broken filter — caught in a browser doing exactly that.
  it('matches nothing when nothing is starred', () => {
    expect(filterToWatchlist(rows, [])).toHaveLength(0)
    expect(filterToWatchlist(rows, null)).toHaveLength(0)
    expect(filterToWatchlist(rows, undefined)).toHaveLength(0)
  })

  it('ignores starred symbols that are no longer tracked', () => {
    // A symbol dropped from the universe should not resurrect a row or throw.
    expect(filterToWatchlist(rows, ['DELISTED']).map((r) => r.symbol)).toEqual([])
  })

  it('handles symbols containing a slash', () => {
    expect(filterToWatchlist(rows, ['BTC/USD']).map((r) => r.symbol)).toEqual(['BTC/USD'])
  })
})

describe('watchlist in the URL', () => {
  it('round-trips alongside the other filters', () => {
    const state = {
      query: '',
      kinds: ['crypto'],
      setups: [],
      verdicts: [],
      flagged: false,
      watchlistOnly: true,
      sort: DEFAULT_SORT,
    }
    expect(parseParams(toParams(state))).toEqual(state)
  })

  it('writes nothing when off', () => {
    expect(
      toParams({ query: '', kinds: [], setups: [], verdicts: [], flagged: false, watchlistOnly: false, sort: DEFAULT_SORT }).toString()
    ).toBe('')
  })

  it('counts as a filter', () => {
    expect(isFiltered({ query: '', kinds: [], setups: [], verdicts: [], flagged: false, watchlistOnly: true })).toBe(true)
  })
})
