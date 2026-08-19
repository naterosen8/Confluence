import { describe, it, expect } from 'vitest'
import { isMissingTable, isDenied, describeSupabaseError, SETUP_NEEDED } from './supabaseHealth.js'

describe('isMissingTable', () => {
  it('recognises the codes PostgREST uses for an unknown relation', () => {
    for (const code of ['42P01', 'PGRST205', 'PGRST106']) expect(isMissingTable({ code })).toBe(true)
  })

  it('recognises the message when there is no code', () => {
    expect(isMissingTable({ message: "Could not find the table 'public.feedback' in the schema cache" })).toBe(true)
    expect(isMissingTable({ message: 'relation "public.trades" does not exist' })).toBe(true)
  })

  it('does not mistake a policy refusal for a missing table', () => {
    expect(isMissingTable({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false)
  })

  it('has nothing to say about no error', () => {
    expect(isMissingTable(null)).toBe(false)
    expect(isMissingTable(undefined)).toBe(false)
  })
})

describe('isDenied', () => {
  it('recognises a policy refusal', () => {
    expect(isDenied({ code: '42501' })).toBe(true)
    expect(isDenied({ message: 'new row violates row-level security policy for table "feedback"' })).toBe(true)
  })

  it('does not claim an ordinary failure was a refusal', () => {
    expect(isDenied({ code: '42P01', message: 'does not exist' })).toBe(false)
  })
})

describe('describeSupabaseError', () => {
  // The distinction the module exists for: a deployment nobody has finished
  // setting up is not a crash, and saying so is the only actionable message.
  it('names an unrun migration as configuration, not breakage', () => {
    expect(describeSupabaseError({ code: '42P01' })).toBe(SETUP_NEEDED)
    expect(SETUP_NEEDED).toMatch(/supabase\/schema\.sql/)
    expect(SETUP_NEEDED).toMatch(/nothing you write would be saved/i)
  })

  it('explains a refusal without accusing the person of anything', () => {
    const text = describeSupabaseError({ code: '42501' })
    expect(text).toMatch(/rate limit|session has expired/)
    expect(text).not.toMatch(/not allowed|forbidden/i)
  })

  it('separates a connection failure from bad input', () => {
    const text = describeSupabaseError(new TypeError('Failed to fetch'), { action: 'open that trade' })
    expect(text).toMatch(/connection problem/)
    expect(text).toMatch(/open that trade/)
  })

  it('falls back to the message rather than swallowing an unknown failure', () => {
    expect(describeSupabaseError({ message: 'something else entirely' })).toBe('something else entirely')
  })

  it('has nothing to say about no error', () => {
    expect(describeSupabaseError(null)).toBeNull()
  })
})
