import { COLUMNS } from './screenerView.js'

// The screener, as a file.
//
// Everything here is measured, committed and checkable, and until now the only
// way to get any of it out was to read it off a table. That is fine for
// looking and useless for working: anyone doing this seriously already has a
// spreadsheet, a notebook or a risk system, and a number that cannot leave the
// page cannot be checked against anything they already trust — which is
// exactly what a site claiming its own figures are checkable should want.
//
// One rule, and it is the same rule the sorting follows: export what is on the
// screen. The same rows, in the same order, with the same columns, at the same
// precision. An export that quietly includes rows a filter removed, or a
// column that was switched off, is a file that disagrees with the page it came
// from — and the disagreement is discovered later, in someone else's model.

// RFC 4180. Anything carrying a comma, a quote or a newline is quoted and its
// quotes doubled — company names contain commas ("Alphabet, Class A" in some
// feeds) and a naive join silently shifts every column after them by one.
export function csvCell(value) {
  if (value == null) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

// Raw values, not formatted ones.
//
// The table renders "68%" and "$220.3M" because those are readable. A
// spreadsheet cannot add them up. Every numeric column exports the number and
// the header carries the unit, which is the only arrangement where the file is
// both readable and usable.
const VALUE = {
  rsi: (r) => r.rsi,
  macd: (r) => (r.macd == null ? '' : r.macd === 'above' ? 'above' : 'below'),
  setup: (r) => r.setup?.name ?? '',
  flags: (r) => (r.flags?.length ? r.flags.join('; ') : ''),
  edge: (r) => r.stat?.winRate ?? '',
  safeLeverage: (r) => r.risk?.safeLeverage ?? '',
  stopAtr: (r) => r.risk?.stopAtr ?? '',
  drawdown: (r) => r.risk?.medianDrawdownPct ?? '',
  recovery: (r) => r.risk?.recoverySessions ?? '',
  liquidity: (r) => (r.liquidity?.reported ? r.liquidity.absorbableQuiet : ''),
  corrSpy: (r) => r.corrSpy ?? '',
}

// The unit belongs in the header, because a bare "68" in a column called "Edge"
// is a number whose meaning has to be guessed once the file leaves this site.
const HEADER = {
  rsi: 'RSI(14)',
  macd: 'MACD vs signal',
  setup: 'Setup',
  flags: 'Flags',
  edge: 'Win rate (%)',
  safeLeverage: 'Max survivable leverage (x)',
  stopAtr: 'Keeper stop (ATR)',
  drawdown: 'Median adverse excursion (%)',
  recovery: 'Median recovery (sessions)',
  liquidity: 'Absorbs, quiet session ($)',
  corrSpy: 'Correlation vs SPY',
}

// The spine, always exported. Sample size travels with the win rate because a
// rate without its N is the single most misread number on the site, and a
// column that arrives in a spreadsheet without it will be averaged.
const SPINE = [
  { header: 'Symbol', get: (r) => r.symbol },
  { header: 'Name', get: (r) => r.name },
  { header: 'Kind', get: (r) => r.kind },
  { header: 'Price', get: (r) => r.price },
]

export function screenerCsv(rows, columnKeys) {
  const chosen = COLUMNS.filter((c) => columnKeys.includes(c.key))
  const header = [
    ...SPINE.map((c) => c.header),
    ...chosen.flatMap((c) => (c.key === 'edge' ? [HEADER.edge, 'Win rate sample (N)'] : [HEADER[c.key] ?? c.label])),
    'Confluence',
  ]
  const body = rows.map((r) => [
    ...SPINE.map((c) => c.get(r)),
    ...chosen.flatMap((c) => (c.key === 'edge' ? [VALUE.edge(r), r.stat?.sampleSize ?? ''] : [VALUE[c.key]?.(r) ?? ''])),
    r.verdict ?? '',
  ])
  return toCsv([header, ...body])
}

// The date the numbers describe, not the date they were downloaded — the file
// outlives the session and its name is the only thing travelling with it.
export function csvFileName(generatedAt, { filtered } = {}) {
  const day = generatedAt ? new Date(generatedAt).toISOString().slice(0, 10) : 'unsynced'
  return `confluence-screener-${day}${filtered ? '-filtered' : ''}.csv`
}

// A Blob and an object URL rather than a data: URI: a data: URI of a hundred
// rows is a very long string in the address bar, and Safari has historically
// refused to download from one at all.
export function downloadCsv(text, filename, doc = document) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = doc.createElement('a')
  a.href = url
  a.download = filename
  doc.body.appendChild(a)
  a.click()
  doc.body.removeChild(a)
  // Revoked on the next turn of the loop: revoking synchronously races the
  // download in some browsers and cancels it.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
