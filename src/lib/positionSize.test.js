import { describe, it, expect } from 'vitest'
import { stopDistance, positionSize, sizingRead, CEILINGS } from './positionSize.js'

describe('stopDistance', () => {
  it('converts an ATR multiple into dollars and a share of price', () => {
    const s = stopDistance({ price: 100, atr: 2, atrMultiple: 1.5 })
    expect(s.dollars).toBe(3)
    expect(s.pct).toBeCloseTo(3, 10)
    expect(s.belowZero).toBe(false)
  })

  it('marks a stop that would sit below zero rather than returning it silently', () => {
    expect(stopDistance({ price: 5, atr: 4, atrMultiple: 2 }).belowZero).toBe(true)
  })

  it('has nothing to say about missing or nonsensical inputs', () => {
    expect(stopDistance({ price: null, atr: 2, atrMultiple: 1 })).toBeNull()
    expect(stopDistance({ price: 100, atr: 0, atrMultiple: 1 })).toBeNull()
    expect(stopDistance({ price: 100, atr: 2, atrMultiple: 0 })).toBeNull()
    expect(stopDistance({ price: 100, atr: NaN, atrMultiple: 1 })).toBeNull()
  })
})

const base = { equity: 100_000, riskPct: 1, price: 100, atr: 2, atrMultiple: 1.5 }

describe('positionSize', () => {
  it('turns a stake and a tolerance into a share count', () => {
    const r = positionSize(base)
    // 1% of $100k is $1,000 at risk; a $3 stop buys 333.33 shares.
    expect(r.riskDollars).toBe(1000)
    expect(r.shares).toBeCloseTo(1000 / 3, 8)
    expect(r.notional).toBeCloseTo((1000 / 3) * 100, 6)
    expect(r.leverage).toBeCloseTo(r.notional / 100_000, 10)
  })

  it('scales linearly with the stated tolerance', () => {
    const one = positionSize({ ...base, riskPct: 1 })
    const two = positionSize({ ...base, riskPct: 2 })
    expect(two.shares).toBeCloseTo(one.shares * 2, 8)
  })

  it('shrinks the position as the stop widens', () => {
    const tight = positionSize({ ...base, atrMultiple: 1 })
    const wide = positionSize({ ...base, atrMultiple: 3 })
    expect(wide.shares).toBeLessThan(tight.shares)
    // Same money at risk either way — that is what the stop is for.
    expect(wide.riskDollars).toBe(tight.riskDollars)
  })

  it('says so instead of inventing a share count when the stop cannot be placed', () => {
    const r = positionSize({ ...base, price: 5, atr: 4, atrMultiple: 2 })
    expect(r.impossible).toBe('stop-below-zero')
    expect(r.shares).toBeUndefined()
    expect(r.read).toMatch(/cannot be placed/)
  })

  it('has nothing to say without both of the numbers only the user has', () => {
    expect(positionSize({ ...base, equity: null })).toBeNull()
    expect(positionSize({ ...base, riskPct: null })).toBeNull()
    expect(positionSize({ ...base, equity: 0 })).toBeNull()
    expect(positionSize({ ...base, riskPct: -1 })).toBeNull()
  })

  describe('ceilings', () => {
    it('always includes the account itself', () => {
      const r = positionSize(base)
      expect(r.caps.map((c) => c.key)).toContain('unlevered')
    })

    it('reports the smallest exceeded ceiling as the binding one', () => {
      // A 5% risk budget on a $3 stop is ~$167k of stock on a $100k account —
      // over the account, over 1x survivable, and over a $50k absorbable size.
      const r = positionSize({ ...base, riskPct: 5, safeLeverage: 1, absorbable: 50_000 })
      expect(r.binding.key).toBe('liquidity')
      expect(r.binding.label).toBe(CEILINGS.liquidity)
    })

    it('reports no binding ceiling when the position clears them all', () => {
      const r = positionSize({ ...base, safeLeverage: 5, absorbable: 10_000_000 })
      expect(r.binding).toBeNull()
      expect(r.cappedShares).toBeNull()
    })

    it('gives the size the binding ceiling allows, and what it actually risks', () => {
      const r = positionSize({ ...base, riskPct: 10, safeLeverage: 10, absorbable: 1e12 })
      expect(r.binding.key).toBe('unlevered')
      expect(r.cappedShares).toBeCloseTo(100_000 / 100, 8)
      // 1000 shares behind a $3 stop is $3,000, not the $10,000 asked for.
      expect(r.cappedRiskDollars).toBeCloseTo(3000, 6)
      expect(r.cappedRiskDollars).toBeLessThan(r.riskDollars)
    })

    it('lets a leveraged instrument clear the account ceiling', () => {
      const r = positionSize({ ...base, riskPct: 5, safeLeverage: 3, absorbable: 1e12 })
      expect(r.leverage).toBeGreaterThan(1)
      expect(r.binding.key).toBe('unlevered')
      expect(r.caps.find((c) => c.key === 'survivable').dollars).toBe(300_000)
    })

    it('skips ceilings it has no measurement for', () => {
      const r = positionSize(base)
      expect(r.caps.map((c) => c.key)).toEqual(['unlevered'])
    })
  })
})

describe('sizingRead', () => {
  it('states the cost of being wrong before the size', () => {
    const text = sizingRead(positionSize(base), { symbol: 'AAA', atrMultiple: 1.5 })
    // Grouped, and the separator belongs to the runtime's locale.
    const risk = text.match(/\$1\D?000/)
    expect(risk).not.toBeNull()
    expect(text.indexOf(risk[0])).toBeLessThan(text.indexOf('shares'))
  })

  it('names the ceiling it runs into', () => {
    const text = sizingRead(positionSize({ ...base, riskPct: 20, safeLeverage: 2, absorbable: 1e12 }), {
      symbol: 'AAA',
      atrMultiple: 1.5,
    })
    expect(text).toMatch(/account equity|survivable size/)
  })

  it('says plainly when nothing binds', () => {
    const text = sizingRead(positionSize({ ...base, safeLeverage: 10, absorbable: 1e12 }), { atrMultiple: 1.5 })
    expect(text).toMatch(/clears every ceiling/)
  })

  // The standing line: the site never picks a side, and never proposes a
  // budget. Both of those come in as arguments.
  it('never recommends a direction or a risk budget', () => {
    for (const args of [base, { ...base, riskPct: 20, safeLeverage: 1, absorbable: 1000 }]) {
      const text = sizingRead(positionSize(args), { symbol: 'AAA', atrMultiple: 1.5 })
      expect(text).not.toMatch(/\b(buy|sell|go long|short it|bullish|bearish|recommend|you should)\b/i)
    }
  })

  it('has nothing to say about nothing', () => {
    expect(sizingRead(null)).toBeNull()
  })
})
