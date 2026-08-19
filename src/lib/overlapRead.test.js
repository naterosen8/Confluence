import { describe, it, expect } from 'vitest'
import { overlapRead } from './overlapRead.js'
import { correlationMatrix } from './correlation.js'

function weekdays(n, from = '2024-01-01') {
  const out = []
  const d = new Date(`${from}T00:00:00Z`)
  while (out.length < n) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

function walk(n, seed) {
  let s = seed
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648 - 0.5
  }
  const closes = [100]
  for (let i = 1; i < n; i++) closes.push(closes[i - 1] * (1 + rand() * 0.04))
  return closes
}

const dates = weekdays(200)
const bars = (closes) => dates.map((date, i) => ({ date, open: closes[i], high: closes[i], low: closes[i], close: closes[i], volume: 1 }))

const shared = walk(200, 3)
// A block that moves as one, and two names that move on their own.
const barsBySymbol = {
  TIED1: bars(shared),
  TIED2: bars(shared.map((c, i) => c * (1 + (i % 7) * 0.0001))),
  TIED3: bars(shared.map((c, i) => c * (1 + (i % 11) * 0.0001))),
  LONE1: bars(walk(200, 91)),
  LONE2: bars(walk(200, 137)),
}
const matrix = correlationMatrix(barsBySymbol, Object.keys(barsBySymbol))

describe('overlapRead', () => {
  it('reports a tightly correlated basket as far fewer bets than names', () => {
    const r = overlapRead({ matrix, symbols: ['TIED1', 'TIED2', 'TIED3'] })
    expect(r.count).toBe(3)
    expect(r.effectiveBets).toBeLessThan(1.5)
    expect(r.headline).toMatch(/3 names, about 1\.\d independent bets?/)
    expect(r.tone).toBe('critical')
    expect(r.read).toMatch(/spreads the ticket, not the exposure/)
  })

  // "1.3 independent bet" is not a sentence. Singular only when the figure
  // actually rounds to one.
  it('pluralises the count against the number it prints', () => {
    const tied = overlapRead({ matrix, symbols: ['TIED1', 'TIED2', 'TIED3'] })
    const printed = tied.headline.match(/about ([\d.]+) independent (bets?)/)
    expect(printed[2]).toBe(printed[1] === '1.0' ? 'bet' : 'bets')
    expect(overlapRead({ matrix, symbols: ['LONE1', 'LONE2'] }).headline).toMatch(/independent bets$/)
  })

  it('reports independent names as close to their own count', () => {
    const r = overlapRead({ matrix, symbols: ['LONE1', 'LONE2'] })
    expect(r.effectiveBets).toBeGreaterThan(1.5)
    expect(r.tone).toBe('wide')
    expect(r.read).toMatch(/mostly moved on their own/)
  })

  it('names the groups that move as a unit', () => {
    const r = overlapRead({ matrix, symbols: ['TIED1', 'TIED2', 'TIED3', 'LONE1'] })
    expect(r.blocks).toHaveLength(1)
    expect(r.blocks[0].members).toEqual(['TIED1', 'TIED2', 'TIED3'])
    expect(r.read).toMatch(/one group moves as a unit/)
    // The lone name is still accounted for, as its own group.
    expect(r.groups.flatMap((g) => g.members).sort()).toEqual(['LONE1', 'TIED1', 'TIED2', 'TIED3'])
  })

  it('says plainly when nothing is close enough to call the same bet', () => {
    const r = overlapRead({ matrix, symbols: ['LONE1', 'LONE2'] })
    expect(r.blocks).toHaveLength(0)
    expect(r.read).toMatch(/No pair clears/)
  })

  it('gives the range as well as the average', () => {
    const r = overlapRead({ matrix, symbols: ['TIED1', 'TIED2', 'LONE1'] })
    expect(r.read).toMatch(/Average pairwise correlation over the last 120 sessions is/)
    expect(r.read).toMatch(/ranging from -?\d\.\d\d \(\w+\/\w+\) to \d\.\d\d/)
  })

  it('has nothing to overlap with one name, and says so rather than erroring', () => {
    const r = overlapRead({ matrix, symbols: ['LONE1'] })
    expect(r.count).toBe(1)
    expect(r.effectiveBets).toBeUndefined()
    expect(r.read).toMatch(/Overlap is a property of a basket/)
  })

  it('prompts rather than blanks when nothing is selected', () => {
    expect(overlapRead({ matrix, symbols: [] }).headline).toBe('Nothing selected')
    expect(overlapRead({ matrix, symbols: null }).headline).toBe('Nothing selected')
  })

  it('names the symbols it could not measure instead of dropping them silently', () => {
    const r = overlapRead({ matrix, symbols: ['TIED1', 'TIED2', 'NOPE'] })
    expect(r.missing).toEqual(['NOPE'])
    expect(r.read).toMatch(/Not measured: NOPE/)
    expect(r.count).toBe(2)
  })

  it('de-duplicates a symbol listed twice rather than counting it as two bets', () => {
    const r = overlapRead({ matrix, symbols: ['LONE1', 'LONE1', 'LONE2'] })
    expect(r.count).toBe(2)
  })

  it('has nothing to say without a matrix', () => {
    expect(overlapRead({ matrix: null, symbols: ['A'] })).toBeNull()
    expect(overlapRead({ matrix: { symbols: [] }, symbols: ['A'] })).toBeNull()
  })

  // The standing rule: measurement, never a portfolio instruction.
  it('never tells anyone what to hold', () => {
    for (const syms of [['TIED1', 'TIED2', 'TIED3'], ['LONE1', 'LONE2'], ['TIED1', 'LONE1']]) {
      const r = overlapRead({ matrix, symbols: syms })
      const text = `${r.headline} ${r.read} ${r.caveat}`
      expect(text).not.toMatch(/\b(you should|we recommend|buy|sell|drop|diversify into|instead hold)\b/i)
    }
  })

  it('warns that correlations rise exactly when they matter', () => {
    const r = overlapRead({ matrix, symbols: ['TIED1', 'LONE1'] })
    expect(r.caveat).toMatch(/tend to fall together/)
  })
})
