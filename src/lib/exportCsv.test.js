import { describe, it, expect } from 'vitest'
import { csvCell, toCsv, screenerCsv, csvFileName } from './exportCsv.js'
import { DEFAULT_COLUMNS } from './screenerView.js'

const row = (over = {}) => ({
  symbol: 'AAA',
  name: 'Alpha',
  kind: 'stock',
  price: 123.45,
  rsi: 61.2,
  macd: 'above',
  setup: { key: 'pullback', name: 'Pullback' },
  flags: ['volatility squeeze', '1.6x volume'],
  verdict: 'lean-up',
  stat: { winRate: 58.3, sampleSize: 141 },
  risk: { safeLeverage: 5, stopAtr: 1.5, medianDrawdownPct: -3.2, recoverySessions: 4 },
  liquidity: { reported: true, absorbableQuiet: 220268993 },
  corrSpy: 0.677,
  ...over,
})

describe('csvCell', () => {
  it('leaves plain values alone', () => {
    expect(csvCell('AAA')).toBe('AAA')
    expect(csvCell(12.5)).toBe('12.5')
  })

  // The failure that silently shifts every later column by one.
  it('quotes and escapes anything that would break the column count', () => {
    expect(csvCell('Alphabet, Class A')).toBe('"Alphabet, Class A"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('writes a missing value as empty, not as "null"', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })
})

describe('toCsv', () => {
  it('joins with CRLF, as the format specifies', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d')
  })
})

describe('screenerCsv', () => {
  it('exports the spine plus the chosen columns, in column order', () => {
    const csv = screenerCsv([row()], DEFAULT_COLUMNS)
    const [header] = csv.split('\r\n')
    expect(header).toBe(
      'Symbol,Name,Kind,Price,RSI(14),MACD vs signal,Setup,Flags,Win rate (%),Win rate sample (N),Max survivable leverage (x),Confluence'
    )
  })

  // A rate without its N is the most misread number here, and a spreadsheet
  // will average it without asking.
  it('always sends the sample size alongside the win rate', () => {
    const csv = screenerCsv([row()], ['edge'])
    expect(csv.split('\r\n')[0]).toContain('Win rate sample (N)')
    expect(csv.split('\r\n')[1]).toContain('58.3,141')
  })

  it('exports raw numbers rather than the formatted text on screen', () => {
    const csv = screenerCsv([row()], ['liquidity', 'corrSpy', 'drawdown'])
    const body = csv.split('\r\n')[1]
    expect(body).toContain('220268993')
    expect(body).toContain('0.677')
    expect(body).toContain('-3.2')
    expect(body).not.toMatch(/220\.3M|%/)
  })

  it('names the unit in the header so a bare number keeps its meaning', () => {
    const header = screenerCsv([row()], ['liquidity', 'safeLeverage', 'recovery']).split('\r\n')[0]
    expect(header).toContain('Absorbs, quiet session ($)')
    expect(header).toContain('Max survivable leverage (x)')
    expect(header).toContain('Median recovery (sessions)')
  })

  it('quotes a header that carries a comma', () => {
    const header = screenerCsv([row()], ['liquidity']).split('\r\n')[0]
    expect(header).toContain('"Absorbs, quiet session ($)"')
  })

  it('leaves an unreported measurement empty rather than writing a zero', () => {
    const csv = screenerCsv([row({ liquidity: { reported: false }, corrSpy: null, risk: null })], [
      'liquidity',
      'corrSpy',
      'safeLeverage',
    ])
    expect(csv.split('\r\n')[1]).toBe('AAA,Alpha,stock,123.45,,,,lean-up')
  })

  it('joins multi-valued cells with something that is not the delimiter', () => {
    const body = screenerCsv([row()], ['flags']).split('\r\n')[1]
    expect(body).toContain('volatility squeeze; 1.6x volume')
  })

  // The rule the module exists to keep: same rows, same order, same columns.
  it('exports exactly the rows it is given, in the order given', () => {
    const csv = screenerCsv([row({ symbol: 'ZZZ' }), row({ symbol: 'AAA' })], [])
    const lines = csv.split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toMatch(/^ZZZ,/)
    expect(lines[2]).toMatch(/^AAA,/)
  })

  it('still carries the spine when every optional column is off', () => {
    expect(screenerCsv([row()], []).split('\r\n')[0]).toBe('Symbol,Name,Kind,Price,Confluence')
  })
})

describe('csvFileName', () => {
  it('names the file for the date the data describes', () => {
    expect(csvFileName('2026-08-17T22:09:20.117Z')).toBe('confluence-screener-2026-08-17.csv')
  })

  it('marks a filtered export as filtered, so the file cannot be mistaken for the whole board', () => {
    expect(csvFileName('2026-08-17T22:09:20.117Z', { filtered: true })).toBe(
      'confluence-screener-2026-08-17-filtered.csv'
    )
  })

  it('says so rather than inventing a date when nothing has synced', () => {
    expect(csvFileName(null)).toBe('confluence-screener-unsynced.csv')
  })
})
