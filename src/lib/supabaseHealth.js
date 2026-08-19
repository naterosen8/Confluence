import { getSupabase, HAS_SUPABASE } from './supabaseClient.js'

// Telling "not set up yet" apart from "broken".
//
// Both optional features here — the simulator and the feedback form — need a
// table that a person has to create by running supabase/schema.sql by hand.
// Until that happens the deployment is in a state the app had no word for:
// the credentials are present, the client connects, auth works, and every
// query fails. What a visitor saw was the raw PostgREST string, which reads as
// a crash and tells them nothing they can act on — and in the feedback form's
// case they saw it *after* writing a paragraph, which is the worst possible
// moment to discover the message has nowhere to go.
//
// So a missing table is treated as a configuration state rather than an
// error: named, explained, and detected before anyone types anything.

// PostgREST reports an unknown relation two different ways depending on
// version — 42P01 straight from Postgres when the request reaches it, and its
// own PGRST205 when the schema cache never had the table to begin with.
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST106'])

export function isMissingTable(error) {
  if (!error) return false
  if (MISSING_TABLE_CODES.has(error.code)) return true
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`
  return /could not find the table|does not exist|schema cache/i.test(text)
}

// Denied by a row-level security policy. Distinct from a missing table: the
// table exists and the request was refused, which usually means a policy is
// doing exactly its job.
export function isDenied(error) {
  if (!error) return false
  return error.code === '42501' || /row-level security|permission denied/i.test(error.message ?? '')
}

export const SETUP_NEEDED =
  'This deployment has database credentials but the table this feature needs has not been created yet — supabase/schema.sql has to be run once in the Supabase SQL editor. Nothing you do here can fix that from the browser, and nothing you write would be saved, so the form is switched off rather than left to fail on submit.'

// One sentence a visitor can act on, or at least understand.
export function describeSupabaseError(error, { action = 'save that' } = {}) {
  if (!error) return null
  if (isMissingTable(error)) return SETUP_NEEDED
  if (isDenied(error)) {
    return `The database refused that write. Either a rate limit applied, or this browser's anonymous session has expired — reloading the page mints a new one.`
  }
  // Network failures arrive as a TypeError from fetch with no code at all.
  if (error.name === 'TypeError' || /failed to fetch|networkerror/i.test(error.message ?? '')) {
    return `Could not reach the database to ${action}. That is a connection problem rather than something wrong with what you entered.`
  }
  return error.message || `Could not ${action}.`
}

// Whether a table is actually there, asked once before offering a form that
// depends on it.
//
// `head` with a count and no rows: the cheapest question PostgREST answers,
// and one that row-level security cannot turn into a false negative — a policy
// that permits nothing returns an empty result, not a missing table.
export async function probeTable(name) {
  if (!HAS_SUPABASE) return 'unconfigured'
  try {
    const supabase = await getSupabase()
    if (!supabase) return 'unconfigured'
    const { error } = await supabase.from(name).select('*', { head: true, count: 'exact' }).limit(0)
    if (!error) return 'ok'
    if (isMissingTable(error)) return 'missing'
    // Denied still means the table is there, which is all this is asking.
    if (isDenied(error)) return 'ok'
    return 'error'
  } catch {
    return 'error'
  }
}
