import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getSupabase, HAS_SUPABASE } from '../lib/supabaseClient'

const AuthContext = createContext({ user: null, loading: false, ensureSession: async () => null })

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(HAS_SUPABASE)

  useEffect(() => {
    if (!HAS_SUPABASE) return
    let unsubscribe = null
    let cancelled = false
    getSupabase()
      .then(async (supabase) => {
        const { data } = await supabase.auth.getSession()
        if (cancelled) return
        setUser(data.session?.user ?? null)
        setLoading(false)
        const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
          setUser(session?.user ?? null)
        })
        // Unmounted while the client was still downloading: tear the listener
        // down as soon as it exists rather than leaking it.
        if (cancelled) subscription.subscription.unsubscribe()
        else unsubscribe = () => subscription.subscription.unsubscribe()
      })
      .catch(() => {
        // The auth chunk did not arrive. Stop reporting "loading" forever —
        // the surfaces that need a session say so themselves.
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  // Silently creates (or resumes) an anonymous identity — no email, no
  // password, no visible sign-in step. It's still a real, private account:
  // the database's row-level security doesn't care whether the account has
  // an email attached, only that auth.uid() matches. The tradeoff, and it's
  // a real one, is that this identity lives in this browser only — there's
  // no credential to sign back in with from another device.
  const ensureSession = useCallback(async () => {
    if (!HAS_SUPABASE) throw new Error('Simulated trades are not configured yet.')
    const supabase = await getSupabase()
    const { data } = await supabase.auth.getSession()
    if (data.session) return data.session
    const { data: signInData, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    return signInData.session
  }, [])

  return <AuthContext.Provider value={{ user, loading, ensureSession }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

// Components that need a session just call this instead of each
// duplicating "call ensureSession once loading settles and there's no
// user yet." Deliberately lazy — only components that actually render this
// hook trigger account creation, so visitors who never touch the simulator
// never get an anonymous account.
export function useEnsureSession() {
  const { user, loading, ensureSession } = useAuth()
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!HAS_SUPABASE || loading || user) return
    ensureSession().catch((err) => setError(err.message || 'Could not start a session'))
  }, [loading, user, ensureSession])

  return { user, loading, error }
}
