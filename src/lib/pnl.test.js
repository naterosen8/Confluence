import { describe, it, expect } from 'vitest'
import { computePnl, evaluatePosition, marketImpactEstimate } from './pnl'
import { simulatePosition } from './leverageStudy'

const bar = (date, close, low = close, high = close) => ({ date, open: close, high, low, close, volume: 1 })

describe('computePnl', () => {
  it('scales the underlying move by the leverage in both directions', () => {
    expect(computePnl({ direction: 'long', entryPrice: 100, currentPrice: 110, capital: 1000, leverage: 1 }).pnlPct).toBeCloseTo(10, 9)
    expect(computePnl({ direction: 'long', entryPrice: 100, currentPrice: 110, capital: 1000, leverage: 5 }).pnlPct).toBeCloseTo(50, 9)
    expect(computePnl({ direction: 'short', entryPrice: 100, currentPrice: 90, capital: 1000, leverage: 5 }).pnlPct).toBeCloseTo(50, 9)
  })

  it('converts percentage to dollars against the stake', () => {
    const r = computePnl({ direction: 'long', entryPrice: 100, currentPrice: 110, capital: 2000, leverage: 3 })
    expect(r.pnlDollars).toBeCloseTo(600, 9) // 30% of 2000
  })

  it('clamps a loss at the full stake and flags it', () => {
    const r = computePnl({ direction: 'long', entryPrice: 100, currentPrice: 80, capital: 1000, leverage: 10 })
    expect(r.liquidated).toBe(true)
    expect(r.pnlPct).toBe(-100)
    expect(r.pnlDollars).toBe(-1000)
  })

  it('treats exactly -100% as liquidated', () => {
    const r = computePnl({ direction: 'long', entryPrice: 100, currentPrice: 90, capital: 1000, leverage: 10 })
    expect(r.liquidated).toBe(true)
    expect(r.pnlPct).toBe(-100)
  })

  it('never reports a loss beyond the stake', () => {
    for (const price of [50, 10, 1, 0.01]) {
      const r = computePnl({ direction: 'long', entryPrice: 100, currentPrice: price, capital: 1000, leverage: 20 })
      expect(r.pnlDollars).toBeGreaterThanOrEqual(-1000)
    }
  })
})

describe('evaluatePosition', () => {
  const bars = [bar('2024-01-01', 100), bar('2024-01-02', 101), bar('2024-01-03', 102)]

  it('settles at the latest close when never liquidated', () => {
    const r = evaluatePosition({ bars, entryDate: '2024-01-01', entryPrice: 100, direction: 'long', capital: 1000, leverage: 2 })
    expect(r.asOfDate).toBe('2024-01-03')
    expect(r.asOfPrice).toBe(102)
    expect(r.pnlPct).toBeCloseTo(4, 9)
  })

  it('settles on the day the position was wiped out, not on the latest day', () => {
    const path = [bar('2024-01-01', 100), bar('2024-01-02', 80), bar('2024-01-03', 120)]
    const r = evaluatePosition({ bars: path, entryDate: '2024-01-01', entryPrice: 100, direction: 'long', capital: 1000, leverage: 10 })
    expect(r.liquidated).toBe(true)
    expect(r.asOfDate).toBe('2024-01-02')
    expect(r.pnlPct).toBe(-100)
  })

  it('handles an entry with no forward bars yet', () => {
    const r = evaluatePosition({ bars, entryDate: '2099-01-01', entryPrice: 100, direction: 'long', capital: 1000, leverage: 2 })
    expect(r.asOfPrice).toBe(100)
    expect(r.pnlPct).toBe(0)
  })

  // The important cross-module property: the simulator and the leverage study
  // model the same physical event and must not disagree about whether a
  // position survived. Liquidation happens intraday, when price *touches* the
  // level — a bar that dips through it and closes back above still ends the
  // position.
  it('agrees with the leverage study about an intraday wipeout', () => {
    const path = [
      bar('2024-01-01', 100),
      bar('2024-01-02', 100, 92), // dips 8% intraday, closes flat
      bar('2024-01-03', 100),
      bar('2024-01-04', 100),
      bar('2024-01-05', 100),
      bar('2024-01-06', 100),
    ]
    const study = simulatePosition(path, 0, 'long', 20, 5)
    const sim = evaluatePosition({
      bars: path,
      entryDate: '2024-01-01',
      entryPrice: 100,
      direction: 'long',
      capital: 1000,
      leverage: 20,
    })
    expect(study.liquidated).toBe(true)
    expect(sim.liquidated).toBe(study.liquidated)
  })

  it('does not liquidate on the entry bar itself', () => {
    // The entry bar's low happened before the position existed — the user
    // entered at that bar's close.
    const path = [bar('2024-01-01', 100, 80), bar('2024-01-02', 100), bar('2024-01-03', 100)]
    const r = evaluatePosition({
      bars: path,
      entryDate: '2024-01-01',
      entryPrice: 100,
      direction: 'long',
      capital: 1000,
      leverage: 20,
    })
    expect(r.liquidated).toBe(false)
  })
})

describe('marketImpactEstimate', () => {
  // $10M of dollar volume a day, ~2% daily moves.
  const bars = Array.from({ length: 30 }, (_, i) => ({
    date: `d${i}`,
    open: 100,
    high: 102,
    low: 98,
    close: 100 * (1 + (i % 2 ? 0.02 : -0.02)),
    volume: 100_000,
  }))

  it('scales participation linearly with position size', () => {
    const small = marketImpactEstimate({ bars, notional: 10_000 })
    const large = marketImpactEstimate({ bars, notional: 100_000 })
    expect(large.participationPct).toBeCloseTo(small.participationPct * 10, 6)
  })

  it('grows impact with the square root of participation, not linearly', () => {
    const a = marketImpactEstimate({ bars, notional: 100_000 })
    const b = marketImpactEstimate({ bars, notional: 400_000 })
    // 4x the size -> 2x the impact under a square-root model.
    expect(b.impactPct / a.impactPct).toBeCloseTo(2, 6)
  })

  it('flags the point where the printed-price assumption stops holding', () => {
    const tiny = marketImpactEstimate({ bars, notional: 1_000 })
    const big = marketImpactEstimate({ bars, notional: 2_000_000 })
    expect(tiny.material).toBe(false)
    expect(big.material).toBe(true)
    expect(big.severe).toBe(true)
  })

  it('returns null rather than a fabricated number without volume data', () => {
    expect(marketImpactEstimate({ bars: [], notional: 1000 })).toBeNull()
    expect(marketImpactEstimate({ bars, notional: 0 })).toBeNull()
    expect(marketImpactEstimate({ bars: bars.map((b) => ({ ...b, volume: 0 })), notional: 1000 })).toBeNull()
  })
})

// Reported as "leverage isn't being applied": a BTC long, $1000 at 50x, showing
// +96% and about +$960. The inference was that +96% of $1000 = $960 means 1:1.
// It does not — $960 IS 96% of $1000 by definition, whatever the leverage. The
// leverage lives inside the 96%, and these pin that.
describe('the "+96% on $1000 must mean 1:1" report', () => {
  const move = { direction: 'long', entryPrice: 62274.34, currentPrice: 63470.01, capital: 1000 }

  it('multiplies the same price move by the leverage', () => {
    const at1 = computePnl({ ...move, leverage: 1 })
    const at50 = computePnl({ ...move, leverage: 50 })
    // Identical underlying move, fifty times the result.
    expect(at1.underlyingPct).toBeCloseTo(at50.underlyingPct, 6)
    expect(at50.pnlPct / at1.pnlPct).toBeCloseTo(50, 6)
    expect(at1.pnlDollars).toBeCloseTo(19.2, 1)
    expect(at50.pnlDollars).toBeCloseTo(960, 0)
  })

  it('reports the underlying move separately so the arithmetic is visible', () => {
    const r = computePnl({ ...move, leverage: 50 })
    expect(r.underlyingPct).toBeCloseTo(1.92, 2)
    expect(r.pnlPct).toBeCloseTo(96, 0)
    // The relationship the UI now prints: underlying × leverage = P&L.
    expect(r.underlyingPct * 50).toBeCloseTo(r.pnlPct, 6)
  })

  it('dollars are always that percentage of the stake, at every leverage', () => {
    for (const leverage of [1, 2, 10, 50]) {
      const r = computePnl({ ...move, leverage })
      expect(r.pnlDollars).toBeCloseTo(1000 * (r.pnlPct / 100), 6)
    }
  })
})

// Reported as "liquidation isn't working": a long showing −34% that should have
// been wiped out. Liquidation is losing the whole stake — −100%, not −34% —
// and −34% is a third of the stake at any leverage.
describe('the "−34% should have liquidated" report', () => {
  const bars = [
    { date: '2026-01-01', open: 100, high: 100, low: 100, close: 100 },
    { date: '2026-01-02', open: 100, high: 100, low: 99.32, close: 99.32 },
  ]

  it('does not liquidate a position that has only lost part of the stake', () => {
    const r = evaluatePosition({
      bars, entryDate: '2026-01-01', entryPrice: 100,
      direction: 'long', capital: 1000, leverage: 50,
    })
    expect(r.pnlPct).toBeCloseTo(-34, 0)
    expect(r.liquidated).toBe(false)
    expect(r.pnlDollars).toBeCloseTo(-340, 0)
  })

  it('liquidates exactly when the whole stake is gone, not before', () => {
    const toZero = [
      bars[0],
      { date: '2026-01-02', open: 100, high: 100, low: 98, close: 98 }, // −2% at 50x
    ]
    const r = evaluatePosition({
      bars: toZero, entryDate: '2026-01-01', entryPrice: 100,
      direction: 'long', capital: 1000, leverage: 50,
    })
    expect(r.liquidated).toBe(true)
    expect(r.pnlPct).toBe(-100)
    expect(r.pnlDollars).toBe(-1000)
  })

  it('publishes the level and the distance to it while the position is open', () => {
    const r = evaluatePosition({
      bars, entryDate: '2026-01-01', entryPrice: 100,
      direction: 'long', capital: 1000, leverage: 50,
    })
    expect(r.liquidationAt).toBeCloseTo(98, 6)
    // 99.32 has to fall a further ~1.33% to reach 98.
    expect(r.roomToLiquidationPct).toBeCloseTo(-1.33, 1)
  })

  it('reports no liquidation level at all without borrowing', () => {
    const r = evaluatePosition({
      bars, entryDate: '2026-01-01', entryPrice: 100,
      direction: 'long', capital: 1000, leverage: 1,
    })
    expect(r.liquidationAt).toBeNull()
    expect(r.liquidated).toBe(false)
  })
})
