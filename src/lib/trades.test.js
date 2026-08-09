import { describe, it, expect, vi, beforeEach } from 'vitest'

// The simulator's database layer was rewritten (liquidation semantics, an
// optional close date, auto-settlement on load) and then never exercised,
// because reaching a live Supabase from here is not possible. A stubbed
// client covers the part that actually broke in review: the shape and content
// of what gets written.
const calls = []
const chain = (result) => {
  const c = {
    from: vi.fn(() => c),
    select: vi.fn(() => c),
    insert: vi.fn((v) => { calls.push(['insert', v]); return c }),
    update: vi.fn((v) => { calls.push(['update', v]); return c }),
    delete: vi.fn(() => { calls.push(['delete', null]); return c }),
    eq: vi.fn((col, val) => { calls.push(['eq', { [col]: val }]); return c }),
    order: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    then: (res) => Promise.resolve(result).then(res),
  }
  return c
}

let response = { data: {}, error: null }
vi.mock('./supabaseClient', () => ({
  HAS_SUPABASE: true,
  supabase: { from: (...a) => chain(response).from(...a) },
}))

const { listTrades, createTrade, closeTrade, deleteTrade } = await import('./trades')

beforeEach(() => {
  calls.length = 0
  response = { data: {}, error: null }
})

describe('createTrade', () => {
  it('writes the user-chosen fields and never a status or outcome', async () => {
    await createTrade({
      userId: 'u1',
      symbol: 'SPY',
      direction: 'short',
      capital: 2500,
      leverage: 7,
      entryPrice: 601.25,
    })
    const [, payload] = calls.find(([k]) => k === 'insert')
    expect(payload).toEqual({
      user_id: 'u1',
      symbol: 'SPY',
      direction: 'short',
      capital: 2500,
      leverage: 7,
      entry_price: 601.25,
    })
    // status/close_* are the database's and the app's business, never the
    // caller's — a trade is created open by definition.
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('close_price')
  })
})

describe('closeTrade', () => {
  it('marks a liquidation distinctly from a voluntary close', async () => {
    await closeTrade('t1', { closePrice: 90, liquidated: true, closeDate: '2026-08-07T00:00:00.000Z' })
    const [, liq] = calls.find(([k]) => k === 'update')
    expect(liq.status).toBe('liquidated')
    expect(liq.close_price).toBe(90)
    // Settles on the session it was wiped out, not whenever the user looked.
    expect(liq.close_date).toBe('2026-08-07T00:00:00.000Z')

    calls.length = 0
    await closeTrade('t2', { closePrice: 110, liquidated: false })
    const [, closed] = calls.find(([k]) => k === 'update')
    expect(closed.status).toBe('closed')
    expect(closed.close_date).toBeTruthy() // defaults to now
  })

  it('targets exactly one row by id', async () => {
    await closeTrade('t3', { closePrice: 1, liquidated: false })
    expect(calls.filter(([k]) => k === 'eq')).toEqual([['eq', { id: 't3' }]])
  })

  it('propagates a database error rather than reporting success', async () => {
    response = { data: null, error: new Error('rls denied') }
    await expect(closeTrade('t4', { closePrice: 1, liquidated: false })).rejects.toThrow('rls denied')
  })
})

describe('listTrades and deleteTrade', () => {
  it('scopes the read to the caller', async () => {
    response = { data: [], error: null }
    await listTrades('u9')
    expect(calls).toContainEqual(['eq', { user_id: 'u9' }])
  })

  it('deletes by id and surfaces failures', async () => {
    response = { data: null, error: null }
    await deleteTrade('t5')
    expect(calls).toContainEqual(['delete', null])
    expect(calls).toContainEqual(['eq', { id: 't5' }])

    response = { data: null, error: new Error('nope') }
    await expect(deleteTrade('t6')).rejects.toThrow('nope')
  })
})
