import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pct, rate, price, signedMoney, compactMoney, shareCount, group, money } from './format.js'

const SRC = path.resolve(new URL('..', import.meta.url).pathname)

describe('shared formatters', () => {
  it('signs percentages with a real minus, not a hyphen', () => {
    // The four copies of this helper disagreed: some produced "-1.40%" from
    // toFixed's hyphen, one produced "−$123". A hyphen is narrower than a
    // digit and does not align in a column of numbers.
    expect(pct(1.234)).toBe('+1.23%')
    expect(pct(-1.234)).toBe('−1.23%')
    expect(pct(0)).toBe('+0.00%')
  })

  it('renders a missing number as a dash rather than NaN', () => {
    // One of the four copies had no null guard at all and would have printed
    // "NaN%" — a missing figure and a zero are different claims.
    for (const f of [pct, rate, price, signedMoney, compactMoney, shareCount, group, money]) {
      expect(f(null)).toBe('—')
      expect(f(undefined)).toBe('—')
      expect(f(NaN)).toBe('—')
      expect(f(Infinity)).toBe('—')
    }
  })

  it('leaves unsigned rates unsigned', () => {
    expect(rate(54.6)).toBe('55%')
    expect(rate(54.6, 1)).toBe('54.6%')
  })

  it('formats prices to two places so columns line up', () => {
    expect(price(7)).toBe('$7.00')
    expect(price(601.257)).toBe('$601.26')
  })

  it('puts the sign outside the currency symbol', () => {
    expect(signedMoney(123.4)).toBe('+$123.40')
    expect(signedMoney(-123.4)).toBe('−$123.40')
    expect(signedMoney(-14, 0)).toBe('−$14')
  })

  it('abbreviates large figures without losing the sign', () => {
    expect(compactMoney(3.2e12)).toBe('$3.20T')
    expect(compactMoney(-125.93e9)).toBe('−$125.93B')
    expect(compactMoney(4.5e6)).toBe('$4.5M')
    // Grouped below the abbreviation threshold. Asserted as a shape rather
    // than a literal because the separator is the runtime's, not ours: a
    // machine set to a European locale groups with a dot or a space, and
    // pinning "1,000" here would fail on a correct result.
    expect(compactMoney(-1000)).toMatch(/^−\$1\D?000$/)
    expect(compactMoney(999_999)).toMatch(/^\$999\D?999$/)
  })

  it('groups full-precision amounts so digits do not have to be counted', () => {
    expect(group(1234567)).toMatch(/^1\D?234\D?567$/)
    expect(money(-1234)).toMatch(/^−\$1\D?234$/)
    expect(money(1234.5, 2)).toMatch(/^\$1\D?234[.,]50$/)
  })

  it('abbreviates share counts', () => {
    expect(shareCount(15.2e9)).toBe('15.20B')
    expect(shareCount(742e6)).toBe('742M')
  })
})

// The whole point of centralising these was that four copies drifted apart.
// A fifth copy would drift too, so re-defining one locally is now a failure.
describe('no page redefines a formatter locally', () => {
  const files = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (/\.jsx$/.test(e.name)) files.push(full)
    }
  }
  walk(SRC)

  it('has no local pct/money/dollars helper left', () => {
    const offenders = []
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8')
      if (/^\s*(function|const)\s+(pct|money|dollars|signedMoney|compactMoney|shareCount)\b/m.test(s)) {
        offenders.push(path.relative(SRC, f))
      }
    }
    expect(offenders).toEqual([])
  })
})
