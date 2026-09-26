import { useMemo, useState } from 'react'
import { yearsAvailable, recentStack, everyStart, stackRead } from '../lib/stackReplay'

const WIDTH = 640
const HEIGHT = 220

// Value against what had gone in, on one shared scale. The dashed line is the
// money put in; the filled area is what it was worth. Where the fill dips
// under the line is the part the one-sentence version never shows.
function StackChart({ series }) {
  const top = Math.max(...series.map((s) => Math.max(s.value, s.invested))) || 1
  const x = (i) => (i / (series.length - 1)) * WIDTH
  const y = (v) => HEIGHT - (v / top) * (HEIGHT - 8)
  const valueLine = series.map((s, i) => `${x(i).toFixed(1)},${y(s.value).toFixed(1)}`).join(' ')
  const investedLine = series.map((s, i) => `${x(i).toFixed(1)},${y(s.invested).toFixed(1)}`).join(' ')
  return (
    <svg
      className="stack-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Value against amount put in, ${series[0].date} to ${series.at(-1).date}`}
    >
      <polygon className="stack-chart-fill" points={`0,${HEIGHT} ${valueLine} ${WIDTH},${HEIGHT}`} />
      <polyline className="stack-chart-value" points={valueLine} />
      <polyline className="stack-chart-invested" points={investedLine} />
    </svg>
  )
}

// A fixed amount every week, replayed. The reader picks the amount and the
// window; the default window is the longest the history covers, chosen
// because it uses all of it and not because of how it came out.
export default function StackReplay({ symbol, bars }) {
  const maxYears = yearsAvailable(bars)
  const [years, setYears] = useState(maxYears)
  const [amount, setAmount] = useState('5')
  const amountNum = Math.max(0, parseFloat(amount) || 0)

  const recent = useMemo(() => recentStack({ bars, amount: amountNum, years }), [bars, amountNum, years])
  // The spread is in percent, which does not depend on the amount, so it is
  // not recomputed on every keystroke.
  const spread = useMemo(() => everyStart({ bars, amount: 1, years }), [bars, years])
  const read = stackRead({ symbol, years, amount: amountNum, recent, spread })

  if (maxYears < 1) {
    return <p className="muted small">Less than a year of history is synced for {symbol}, so there is no window to replay.</p>
  }

  return (
    <div className="stack-replay">
      <p className="stack-sentence">
        <label htmlFor="stack-years">Over the last</label>{' '}
        <select id="stack-years" value={years} onChange={(e) => setYears(Number(e.target.value))}>
          {Array.from({ length: maxYears }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>{' '}
        <label htmlFor="stack-amount">year{years === 1 ? '' : 's'}, putting</label>{' '}
        <span className="stack-money">
          $
          <input
            id="stack-amount"
            type="number"
            min="1"
            step="1"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </span>{' '}
        into {symbol} every week{read ? <> <strong>{read.result}</strong></> : '.'}
      </p>

      {read ? (
        <>
          <StackChart series={recent.series} />
          <p className="muted small stack-legend">
            <span className="stack-key stack-key-value" /> worth at each close{' '}
            <span className="stack-key stack-key-invested" /> put in so far · {recent.start} to {recent.end},{' '}
            {recent.fills} weekly amounts
          </p>
          <p>{read.path}</p>
          {read.doors && (
<p className="muted">{read.doors}</p>
          )}
        </>
      ) : (
        <p className="muted small">Enter an amount above zero.</p>
      )}
    </div>
  )
}
