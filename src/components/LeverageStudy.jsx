import { useMemo, useState } from 'react'
import { leverageStudy } from '../lib/leverageStudy'
import { marketImpactEstimate } from '../lib/pnl'
import { FORWARD_DAYS } from '../lib/backtest'

function pct(v, digits = 1) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`
}

function dollars(v) {
  const sign = v >= 0 ? '+' : '−'
  return `${sign}$${Math.abs(v).toFixed(0)}`
}

function ScenarioRow({ label, study, capital }) {
  if (!study.sampleSize) {
    return (
      <tr>
        <td>{label}</td>
        <td colSpan={7} className="muted small">
          No occurrences with a full {FORWARD_DAYS}-session window yet.
        </td>
      </tr>
    )
  }
  return (
    <tr>
      <td>{label}</td>
      <td>{study.sampleSize}</td>
      <td className={study.liquidatedPct > 0 ? 'pnl-negative' : 'muted'}>
        {study.liquidatedPct.toFixed(0)}%
      </td>
      <td>{study.winRate.toFixed(0)}%</td>
      <td className={study.avgReturnPct >= 0 ? 'pnl-positive' : 'pnl-negative'}>{pct(study.avgReturnPct)}</td>
      <td className={study.medianReturnPct >= 0 ? 'pnl-positive' : 'pnl-negative'}>{pct(study.medianReturnPct)}</td>
      <td className="muted small">
        {pct(study.bestPct, 0)} / {pct(study.worstPct, 0)}
      </td>
      <td className={study.avgDollars >= 0 ? 'pnl-positive' : 'pnl-negative'}>
        {dollars(study.avgDollars)} on ${capital.toFixed(0)}
      </td>
    </tr>
  )
}

// Replays the app's own past signals as leveraged positions. This is a
// backward-looking study of already-published verdicts, not a suggestion
// about any current trade — the direction of each hypothetical position comes
// from what the confluence score said on that historical day, so nothing here
// is chosen with hindsight.
export default function LeverageStudy({ bars, currentScore }) {
  const [capital, setCapital] = useState('1000')
  const [leverage, setLeverage] = useState('10')

  const capitalNum = Math.max(1, parseFloat(capital) || 0)
  const leverageNum = Math.min(50, Math.max(1, parseFloat(leverage) || 1))

  const likeToday = useMemo(
    () =>
      currentScore == null || currentScore === 0
        ? { sampleSize: 0 }
        : leverageStudy({ bars, capital: capitalNum, leverage: leverageNum, matchesScore: (s) => s === currentScore }),
    [bars, capitalNum, leverageNum, currentScore]
  )

  const allSignals = useMemo(
    () => leverageStudy({ bars, capital: capitalNum, leverage: leverageNum, matchesScore: (s) => s !== 0 }),
    [bars, capitalNum, leverageNum]
  )

  const headline = allSignals.sampleSize ? allSignals : null

  // Every figure above assumes the position fills at the printed price. That
  // assumption degrades as size grows, and leverage multiplies the size that
  // actually reaches the market — so it is checked against notional, not stake.
  const impact = useMemo(
    () => marketImpactEstimate({ bars, notional: capitalNum * leverageNum }),
    [bars, capitalNum, leverageNum]
  )
  const breakEvenMove = (100 / leverageNum).toFixed(1)

  return (
    <div className="leverage-study">
      <p className="muted small">
        Every past day this ticker’s indicator readings leaned one way rather than splitting, replayed as a hypothetical position held{' '}
        {FORWARD_DAYS} sessions — long when the readings leaned up, short when they leaned down, taken from what the score
        actually said that day. Every occurrence is included; none are filtered to the ones that worked.
      </p>

      <div className="simulate-row">
        <label className="simulate-field">
          <span className="muted small">Hypothetical stake ($)</span>
          <input type="number" min="1" step="100" value={capital} onChange={(e) => setCapital(e.target.value)} />
        </label>
        <label className="simulate-field">
          <span className="muted small">Leverage (1–50x)</span>
          <input type="number" min="1" max="50" step="1" value={leverage} onChange={(e) => setLeverage(e.target.value)} />
        </label>
      </div>

      {headline && (
        <div className="callout callout-highlight">
          {leverageNum === 1 ? (
            <>
              At <strong>1x</strong> there is no borrowing, so there is nothing to liquidate — the position simply
              tracks the underlying move. Raise the leverage to see how much of that changes.
            </>
          ) : (
            <>
              At <strong>{leverageNum}x</strong>, a <strong>{breakEvenMove}%</strong> move against the position wipes
              out the entire stake.{' '}
              {headline.liquidatedCount > 0 ? (
                <>
                  Across {headline.sampleSize} past signals that happened{' '}
                  <strong>
                    {headline.liquidatedCount} time{headline.liquidatedCount === 1 ? '' : 's'} (
                    {headline.liquidatedPct.toFixed(0)}%)
                  </strong>{' '}
                  — a total loss of the ${capitalNum.toFixed(0)} stake, in some cases where the direction later proved
                  right anyway.
                </>
              ) : (
                <>
                  None of the {headline.sampleSize} past signals moved that far against the position within{' '}
                  {FORWARD_DAYS} sessions — but that is this ticker's recent history, not a guarantee about the next
                  one.
                </>
              )}
            </>
          )}
        </div>
      )}

      <div className="score-table-wrap">
        <table className="score-table">
          <thead>
            <tr>
              <th>Signals replayed</th>
              <th>N</th>
              <th>Wiped out</th>
              <th>Win %</th>
              <th>Avg</th>
              <th>Median</th>
              <th>Best / worst</th>
              <th>Avg outcome</th>
            </tr>
          </thead>
          <tbody>
            <ScenarioRow
              label={currentScore ? `Setups like today (score ${currentScore > 0 ? '+' : ''}${currentScore})` : 'Setups like today'}
              study={likeToday}
              capital={capitalNum}
            />
            <ScenarioRow label="Every day the readings leaned" study={allSignals} capital={capitalNum} />
          </tbody>
        </table>
      </div>

      <p className="muted small">
        Liquidation is checked against each session's intraday low (long) or high (short), not its close — a leveraged
        position dies the moment price touches the level, so scoring on closes alone would count wipeouts as survivors.
        The model is still optimistic: real venues liquidate earlier, at a maintenance margin above zero equity, and
        charge funding and spread on top. It also assumes every signal was taken mechanically, with no slippage and no
        judgement applied.
      </p>
      {impact && impact.material && (
        <div className="callout impact-note">
          A ${capitalNum.toFixed(0)} stake at {leverageNum}x puts{' '}
          <strong>${(impact.notional / 1000).toFixed(0)}k</strong> into the market — about{' '}
          <strong>{impact.participationPct.toFixed(1)}%</strong> of this ticker's median daily dollar volume.
          {impact.severe
            ? ' At that size the printed price is not a price you could actually transact at: the order moves the market against itself while it fills, so the entry, the exit and the equity marked against them are all worse than modelled.'
            : ' At that size, a rough square-root impact model puts the give-up at roughly ' +
              impact.impactPct.toFixed(2) +
              '% per side — small, but no longer nothing, and every figure above ignores it.'}
        </div>
      )}

      <p className="muted small">
        Deliberately not shown: a compounded "stake it every time" equity curve. These windows overlap in time, so
        chaining them implies a strategy nobody ran and turns a modest edge into an exponential-looking chart.
      </p>
    </div>
  )
}
