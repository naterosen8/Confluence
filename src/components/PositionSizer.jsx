import { useMemo, useState } from 'react'
import { positionSize, sizingRead } from '../lib/positionSize'
import { useSizingPrefs } from '../lib/sizingPrefs'
import { STOP_ATR_MULTIPLES } from '../lib/riskRead'
import { compactMoney, price as fmtPrice } from '../lib/format'
import Explain from '../components/Explain'

// The step between measurement and a position.
//
// Every figure on the risk page is stated per unit — 1.5 ATR, 4.2%, 5x —
// because those are the units that let eighty-nine instruments be compared.
// Nobody trades in ATRs. Turning them into a share count needs two numbers
// this site does not have and must not assume: the size of the account, and
// how much of it the person is willing to lose being wrong once.
//
// Both are typed in and both stay in this browser. What comes back is the
// multiplication, plus the three separately-measured ceilings the answer runs
// into — which is the part that could not be done on a napkin, because those
// ceilings come from this instrument's own history.

const numberOrNull = (raw) => {
  const n = Number(String(raw).replace(/[,$\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

export default function PositionSizer({ symbol, price, atr, stop, safeLeverage, liquidity }) {
  const prefs = useSizingPrefs()
  const [equityDraft, setEquityDraft] = useState(prefs.equity == null ? '' : String(prefs.equity))
  const [riskDraft, setRiskDraft] = useState(prefs.riskPct == null ? '' : String(prefs.riskPct))
  // Starts at the multiple the record on this page settled on, and can be
  // moved — someone who has decided on a wider stop should see what that costs
  // in size rather than being told they are holding it wrong.
  const [multiple, setMultiple] = useState(stop?.keeper?.mult ?? 2)

  const equity = numberOrNull(equityDraft)
  const riskPct = numberOrNull(riskDraft)
  const absorbable = liquidity?.reported ? liquidity.absorbableQuiet : null

  const result = useMemo(
    () => positionSize({ equity, riskPct, price, atr, atrMultiple: multiple, safeLeverage, absorbable }),
    [equity, riskPct, price, atr, multiple, safeLeverage, absorbable]
  )
  const read = useMemo(() => sizingRead(result, { symbol, atrMultiple: multiple }), [result, symbol, multiple])

  const commit = () => prefs.update({ equity, riskPct })

  if (!price || !atr) {
    return (
      <p className="muted small">
        No current price or ATR for {symbol}, so there is nothing to size against.
      </p>
    )
  }

  return (
    <div className="sizer">
      <p className="muted small">
        Both numbers are yours. This site does not suggest a risk budget, a direction, or a size — it multiplies what
        you enter by what it has measured, and names the ceilings the answer runs into. Nothing here is sent anywhere;
        it is stored in this browser so you do not retype it on the next ticker.
      </p>

      <div className="sizer-inputs">
        <label>
          <span className="muted small">Account size</span>
          <input
            inputMode="decimal"
            value={equityDraft}
            placeholder="e.g. 100000"
            onChange={(e) => setEquityDraft(e.target.value)}
            onBlur={commit}
          />
        </label>
        <label>
          <span className="muted small">Willing to lose on this idea</span>
          <span className="sizer-suffix">
            <input
              inputMode="decimal"
              value={riskDraft}
              placeholder="e.g. 1"
              onChange={(e) => setRiskDraft(e.target.value)}
              onBlur={commit}
            />
            <span>%</span>
          </span>
        </label>
        <label>
          <span className="muted small">
            <Explain term="stopRead">Stop distance</Explain>
          </span>
          <select value={multiple} onChange={(e) => setMultiple(Number(e.target.value))}>
            {STOP_ATR_MULTIPLES.map((m) => (
              <option key={m} value={m}>
                {m} ATR{stop?.keeper?.mult === m ? ' — measured' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(prefs.equity != null || prefs.riskPct != null) && (
        <p className="muted small">
          Remembered on this device.{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              prefs.forget()
              setEquityDraft('')
              setRiskDraft('')
            }}
          >
            Forget these numbers
          </button>
        </p>
      )}

      {!result ? (
        <p className="muted small">Enter an account size and how much of it you are willing to lose to see the arithmetic.</p>
      ) : result.impossible ? (
        <div className="callout">{read}</div>
      ) : (
        <>
          <div className="sizer-grid">
            <div className="stat">
              <span className="muted small">
                <Explain term="positionSizing">Shares</Explain>
              </span>
              <span className="stat-value">
                {result.shares < 10 ? result.shares.toFixed(2) : Math.floor(result.shares).toLocaleString()}
              </span>
              <span className="stat-note">at {fmtPrice(result.price)}</span>
            </div>
            <div className="stat">
              <span className="muted small">Position</span>
              <span className="stat-value">{compactMoney(result.notional)}</span>
              <span className="stat-note">
                {result.leverage > 1
                  ? `${result.leverage.toFixed(2)}x the account`
                  : `${(result.leverage * 100).toFixed(0)}% of the account`}
              </span>
            </div>
            <div className="stat">
              <span className="muted small">Stop sits</span>
              <span className="stat-value">{fmtPrice(result.stop.dollars)}</span>
              <span className="stat-note">away — {result.stop.pct.toFixed(1)}% of price</span>
            </div>
            <div className="stat">
              <span className="muted small">If it fires</span>
              <span className="stat-value">{compactMoney(result.riskDollars)}</span>
              <span className="stat-note">gone, before slippage</span>
            </div>
          </div>

          <p className="sizer-read">{read}</p>

          <table className="score-table sizer-caps">
            <thead>
              <tr>
                <th>
                  <Explain term="sizeCeiling">Ceiling</Explain>
                </th>
                <th className="num">Caps the position at</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.caps.map((c) => {
                const over = result.notional > c.dollars
                return (
                  <tr key={c.key}>
                    <td>{c.label}</td>
                    <td className="num">{compactMoney(c.dollars)}</td>
                    <td className={over ? 'result-miss' : 'result-hit'}>
                      {over ? (c.key === result.binding?.key ? 'binding' : 'exceeded') : 'clear'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!absorbable && (
            <p className="muted small">
              No liquidity ceiling for {symbol}: the feed reports no volume for this instrument, so what a session
              absorbs is unknown rather than unlimited.
            </p>
          )}
        </>
      )}
    </div>
  )
}
