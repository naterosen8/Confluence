import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function EmailSignIn({ prompt }) {
  const { signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('sending')
    try {
      await signInWithEmail(email)
      setStatus('sent')
    } catch (err) {
      setStatus(err.message || 'Something went wrong')
    }
  }

  return (
    <form className="simulate-form" onSubmit={handleSubmit}>
      <p className="muted small">{prompt || 'Sign in to continue — no password, just a magic link by email.'}</p>
      <div className="simulate-row">
        <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="button-primary" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send magic link'}
        </button>
      </div>
      {status === 'sent' && <p className="muted small">Check your email for a sign-in link.</p>}
      {status && status !== 'sending' && status !== 'sent' && <p className="muted small">Error: {status}</p>}
    </form>
  )
}
