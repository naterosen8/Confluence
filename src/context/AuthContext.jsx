import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, HAS_SUPABASE } from '../lib/supabaseClient'

const AuthContext = createContext({ user: null, loading: false, ensureSession: async () => null })

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(HAS_SUPABASE)

  useEffect(() => {
    if (!HAS_SUPABASE) return
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.subscription.unsubscribe()
  }, [])

  // Silently creates (or resumes) an anonymous identity — no email, no
  // password, no visible sign-in step. It's still a real, private account:
  // the database's row-level security doesn't care whether the account has
  // an email attached, only that auth.uid() matches. The tradeoff, and it's
  // a real one, is that this identity lives in this browser only — there's
  // no credential to sign back in with from another device.
  async function ensureSession() {
    if (!HAS_SUPABASE) throw new Error('Simulated trades are not configured yet.')
    const { data } = await supabase.auth.getSession()
    if (data.session) return data.session
    const { data: signInData, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    return signInData.session
  }

  return <AuthContext.Provider value={{ user, loading, ensureSession }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
