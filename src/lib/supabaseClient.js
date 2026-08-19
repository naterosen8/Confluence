const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The anon key is designed to be public — Supabase's security model is
// row-level security policies in Postgres, not secrecy of this key. Safe to
// ship in the client bundle, unlike the Twelve Data key situation.
export const HAS_SUPABASE = Boolean(url && anonKey)

// Loaded on demand, not at boot.
//
// The client is roughly 350 KB of the bundle — bigger than every page on this
// site put together — and it serves two optional features that most visits
// never touch: the trade simulator and the feedback form. Importing it at the
// top level meant the screener could not paint until an auth library that
// visit was never going to use had been downloaded and parsed.
//
// `HAS_SUPABASE` stays a plain synchronous check of the environment, so every
// "not configured on this deployment" branch still resolves during render
// without waiting on anything.
let clientPromise = null

export function getSupabase() {
  if (!HAS_SUPABASE) return Promise.resolve(null)
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) => createClient(url, anonKey))
      // A failed chunk fetch must not poison the module for the rest of the
      // session: clear the cache so the next attempt actually retries.
      .catch((err) => {
        clientPromise = null
        throw err
      })
  }
  return clientPromise
}
