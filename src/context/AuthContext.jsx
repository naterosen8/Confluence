import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, HAS_SUPABASE } from '../lib/supabaseClient'

const AuthContext = createContext({ user: null, loading: false, signInWithEmail: async () => {}, signOut: async () => {} })

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

  async function signInWithEmail(email) {
    if (!HAS_SUPABASE) throw new Error('Simulated trades are not configured yet.')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) throw error
  }

  async function signOut() {
    if (!HAS_SUPABASE) return
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithEmail, signOut }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
