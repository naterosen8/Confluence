import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The anon key is designed to be public — Supabase's security model is
// row-level security policies in Postgres, not secrecy of this key. Safe to
// ship in the client bundle, unlike the Twelve Data key situation.
export const HAS_SUPABASE = Boolean(url && anonKey)
export const supabase = HAS_SUPABASE ? createClient(url, anonKey) : null
