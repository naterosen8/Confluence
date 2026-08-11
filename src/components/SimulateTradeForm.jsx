import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useEnsureSession } from '../context/AuthContext'
import { HAS_SUPABASE } from '../lib/supabaseClient'
import { createTrade } from '../lib/trades'
import Explain from './Explain'

export default function SimulateTradeForm({ symbol, currentPrice }) {
  const { user, loading, error: setupError } = useEnsureSession()
  const [direction, setDirection] = useState('long')
  const [capital, setCapital] = useState('1000')
  const [leverage, setLeverage] = useState('1')
  const [submitStatus, setSubmitStatus] = useState(null)

  if (!HAS_SUPABASE) {
    return <p className="muted small">Simulated trades aren't set up yet.</p>
  }

  if (setupError) {
    return <p className="muted small">Error: {setupError}</p>
  }

  if (loading || !user) {
    return <p className="muted small">Setting up…</p>
  }

  async function handleOpenTrade(e) {
    e.preventDefault()
    setSubmitStatus('saving')
    try {
      await createTrade({
        userId: user.id,
        symbol,
        direction,
        capital: parseFloat(capital),
        leverage: parseFloat(leverage),
        entryPrice: currentPrice,
      })
      setSubmitStatus('saved')
    } catch (err) {
      setSubmitStatus(err.message || 'Something went wrong')
    }
  }

  return (
    <form className="simulate-form" onSubmit={handleOpenTrade}>
      <p className="muted small">
        <Explain term="simulatedTrade">
          You choose the direction and size — this only records your own hypothetical idea and tracks the outcome. It
          is not a recommendation.
        </Explain>
      </p>
      <div className="simulate-field">
        <span className="muted small">
          <Explain term="longShort">Direction</Explain>
        </span>
        <div className="direction-toggle">
          <button
            type="button"
            className={direction === 'long' ? 'direction-active-long' : ''}
            onClick={() => setDirection('long')}
          >
            Long
          </button>
          <button
            type="button"
            className={direction === 'short' ? 'direction-active-short' : ''}
            onClick={() => setDirection('short')}
          >
            Short
          </button>
        </div>
      </div>
      {/* Explicit htmlFor rather than a wrapping <label>: the "?" is a button,
          and a button nested inside a label both forwards its click to the
          input and gets absorbed into that input's accessible name. */}
      <div className="simulate-row">
        <div className="simulate-field">
          <label className="muted small" htmlFor="sim-capital">
            Hypothetical capital ($)
          </label>
          <input
            id="sim-capital"
            type="number"
            min="1"
            step="1"
            required
            value={capital}
            onChange={(e) => setCapital(e.target.value)}
          />
        </div>
        <div className="simulate-field">
          <span className="muted small">
            <label htmlFor="sim-leverage">Leverage (1–50x)</label>
            <Explain term="leverage" />
          </span>
          <input
            id="sim-leverage"
            type="number"
            min="1"
            max="50"
            step="1"
            required
            value={leverage}
            onChange={(e) => setLeverage(e.target.value)}
          />
        </div>
      </div>
      <button type="submit" className="button-primary" disabled={submitStatus === 'saving'}>
        {submitStatus === 'saving' ? 'Opening…' : `Open simulated ${direction} at $${currentPrice.toFixed(2)}`}
      </button>
      {submitStatus === 'saved' && (
        <p className="muted small">
          Saved. Track it on <Link to="/my-trades">My trades</Link>.
        </p>
      )}
      {submitStatus && submitStatus !== 'saving' && submitStatus !== 'saved' && (
        <p className="muted small">Error: {submitStatus}</p>
      )}
    </form>
  )
}
