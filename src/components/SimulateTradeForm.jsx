import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { HAS_SUPABASE } from '../lib/supabaseClient'
import { createTrade } from '../lib/trades'

export default function SimulateTradeForm({ symbol, currentPrice }) {
  const { user, loading, ensureSession } = useAuth()
  const [settingUp, setSettingUp] = useState(false)
  const [setupError, setSetupError] = useState(null)
  const [direction, setDirection] = useState('long')
  const [capital, setCapital] = useState('1000')
  const [leverage, setLeverage] = useState('1')
  const [submitStatus, setSubmitStatus] = useState(null)

  useEffect(() => {
    if (!HAS_SUPABASE || loading || user) return
    setSettingUp(true)
    ensureSession()
      .catch((err) => setSetupError(err.message || 'Could not start a session'))
      .finally(() => setSettingUp(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user])

  if (!HAS_SUPABASE) {
    return <p className="muted small">Simulated trades aren't set up yet.</p>
  }

  if (loading || settingUp) {
    return <p className="muted small">Setting up…</p>
  }

  if (setupError) {
    return <p className="muted small">Error: {setupError}</p>
  }

  if (!user) {
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
        You choose the direction and size — this only records your own hypothetical idea and tracks the outcome. It
        is not a recommendation.
      </p>
      <div className="simulate-row">
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
      <div className="simulate-row">
        <label className="simulate-field">
          <span className="muted small">Hypothetical capital ($)</span>
          <input type="number" min="1" step="1" required value={capital} onChange={(e) => setCapital(e.target.value)} />
        </label>
        <label className="simulate-field">
          <span className="muted small">Leverage (1–50x)</span>
          <input
            type="number"
            min="1"
            max="50"
            step="1"
            required
            value={leverage}
            onChange={(e) => setLeverage(e.target.value)}
          />
        </label>
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
