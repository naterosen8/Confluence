import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadTickerRecord, tickerRecordData } from '../lib/dataProvider'
import { symbolRecord, tickerRecordRead } from '../lib/tickerRecord'
import { leanByKey } from '../lib/lean'
import { pct, price } from '../lib/format'
import PlainRead from './PlainRead'
import Explain from './Explain'

// What this site has said about this instrument, and how each call turned out.
//
// The record chapter already carried a backtest of every day in the ticker's
// history, which is a different and weaker claim: it is what the score would
// have done, reconstructed after the fact. This is what the site actually
// published, on a date, before the outcome was known, written to a committed
// file by a job — the only figures here that are not a reconstruction.
//
// There will usually be about three of them. The point is not the ratio; it is
// that a person reading a verdict badge can immediately see every previous
// verdict on the same ticker and what happened next, without taking anyone's
// word for the aggregate.

export default function TickerRecord({ symbol }) {
  const [data, setData] = useState(() => tickerRecordData())
  const [state, setState] = useState(() => (tickerRecordData() ? 'ready' : 'loading'))

  useEffect(() => {
    let live = true
    loadTickerRecord().then((d) => {
      if (!live) return
      setData(d)
      setState(d ? 'ready' : 'unavailable')
    })
    return () => {
      live = false
    }
  }, [])

  if (state === 'loading') return <p className="muted small">Loading this ticker’s record…</p>
  if (state === 'unavailable') {
    return (
      <p className="muted small">
        The per-ticker record file has not been generated yet. It is written by the daily job alongside the screener
        index; the <Link to="/track-record">aggregate record</Link> and the{' '}
        <a href="/track-record.json">raw log</a> are both available meanwhile.
      </p>
    )
  }

  // A symbol with no entry at all is not an error: the log only gains a row on
  // a session whose readings leaned, so a ticker that has been reading as a
  // split throughout genuinely has no calls.
  const block = data.symbols[symbol] ?? { resolvedCount: 0, pendingCount: 0, voidedCount: 0, hits: 0, rose: 0, calls: [] }
  const record = symbolRecord(block, symbol)
  const read = tickerRecordRead(record)

  return (
    <>
      <PlainRead
        term="trackRecord"
        headline={
          record.resolvedCount
            ? `${record.hits} of ${record.resolvedCount} resolved ${record.resolvedCount === 1 ? 'call' : 'calls'} on ${symbol} went the leaned way`
            : record.pendingCount
            ? `${record.pendingCount} call${record.pendingCount === 1 ? '' : 's'} on ${symbol}, none resolved yet`
            : `No calls published on ${symbol} yet`
        }
        caveat={`Published before the outcome was known and resolved five sessions later against the actual close, hits and misses alike. Everything else in this chapter is a reconstruction of what the score would have done; this is what the site actually said. The complete log is a committed file at /track-record.json.`}
      >
        {read}
      </PlainRead>

      {record.calls.length > 0 && (
        <div className="score-table-wrap">
          <table className="score-table">
            <caption className="visually-hidden">
              Every call this site published on {symbol}, newest first, with how each one resolved.
            </caption>
            <thead>
              <tr>
                <th scope="col">Called</th>
                <th scope="col">
                  <Explain term="verdict">Reading</Explain>
                </th>
                <th scope="col" className="num">
                  Entry
                </th>
                <th scope="col">
                  <Explain term="forwardWindow">Resolved</Explain>
                </th>
                <th scope="col" className="num">
                  Exit
                </th>
                <th scope="col" className="num">
                  Move
                </th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {record.calls.map((c) => (
                <tr key={`${c.date}-${c.resolvedDate}`}>
                  <td>{c.date}</td>
                  <td>{leanByKey(c.verdict)?.short ?? c.verdict}</td>
                  <td className="num">{price(c.price)}</td>
                  <td>{c.resolvedDate}</td>
                  <td className="num">{price(c.exitPrice)}</td>
                  {/* Not coloured by sign, for the same reason the aggregate
                      page is not: on a downward-leaning call a rising price is
                      the failure, so green here beside a red "Miss" would read
                      as a contradiction. Hit and Miss carry the judgement. */}
                  <td className="num">{pct(c.returnPct)}</td>
                  <td className={c.correct ? 'result-hit' : 'result-miss'}>{c.correct ? 'Hit' : 'Miss'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted small">
        {record.truncated > 0 && (
          <>
            {record.truncated} older resolved {record.truncated === 1 ? 'call is' : 'calls are'} not listed — the
            published index keeps the most recent per ticker so it does not grow with the log.{' '}
          </>
        )}
        {record.voidedCount > 0 && (
          <>
            {record.voidedCount} {record.voidedCount === 1 ? 'call was' : 'calls were'} retracted on this ticker and
            are excluded from every figure above; they are listed on the{' '}
            <Link to="/track-record">track record page</Link>.{' '}
          </>
        )}
        Judge the site on <Link to="/track-record">the whole record</Link> rather than on one ticker — a handful of
        calls on any single instrument cannot separate a method from a run of luck in either direction.
      </p>
    </>
  )
}
