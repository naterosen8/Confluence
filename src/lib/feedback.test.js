import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  validateFeedback,
  FEEDBACK_KINDS,
  MESSAGE_MIN,
  MESSAGE_MAX,
  CONTACT_MAX,
  resolveKind,
  DEFAULT_KIND,
} from './feedback.js'

describe('validateFeedback', () => {
  const ok = { kind: 'wrong-number', message: 'UNH price-to-book looks about 3x too high.', contact: '' }

  it('accepts a specific report', () => {
    const r = validateFeedback(ok)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual({})
  })

  it('returns trimmed values so the caller submits what was checked', () => {
    const r = validateFeedback({ ...ok, message: '  spacing everywhere  ', contact: '  me@example.com ' })
    expect(r.values.message).toBe('spacing everywhere')
    expect(r.values.contact).toBe('me@example.com')
  })

  it('treats a blank contact as absent rather than empty string', () => {
    // The column is nullable; writing '' instead of null would make "did they
    // want a reply" unanswerable with a plain IS NULL.
    expect(validateFeedback({ ...ok, contact: '   ' }).values.contact).toBeNull()
  })

  it('rejects an empty or whitespace-only message', () => {
    expect(validateFeedback({ ...ok, message: '' }).errors.message).toBeTruthy()
    expect(validateFeedback({ ...ok, message: '     ' }).errors.message).toBeTruthy()
  })

  it('counts length after trimming, not before', () => {
    // '   ab   ' is 8 raw characters and 2 real ones. Validating the raw
    // string would let a message through that the database then rejects.
    const r = validateFeedback({ ...ok, message: '   ab   ' })
    expect(r.ok).toBe(false)
    expect(r.errors.message).toContain(String(MESSAGE_MIN))
  })

  it('enforces the message ceiling', () => {
    expect(validateFeedback({ ...ok, message: 'x'.repeat(MESSAGE_MAX) }).ok).toBe(true)
    expect(validateFeedback({ ...ok, message: 'x'.repeat(MESSAGE_MAX + 1) }).ok).toBe(false)
  })

  it('enforces the contact ceiling', () => {
    expect(validateFeedback({ ...ok, contact: 'x'.repeat(CONTACT_MAX) }).ok).toBe(true)
    expect(validateFeedback({ ...ok, contact: 'x'.repeat(CONTACT_MAX + 1) }).errors.contact).toBeTruthy()
  })

  it('rejects a kind outside the offered list', () => {
    expect(validateFeedback({ ...ok, kind: 'urgent' }).errors.kind).toBeTruthy()
    expect(validateFeedback({ ...ok, kind: undefined }).errors.kind).toBeTruthy()
  })

  it('accepts every kind the form actually offers', () => {
    for (const k of FEEDBACK_KINDS) {
      expect(validateFeedback({ ...ok, kind: k.key }).ok, k.key).toBe(true)
    }
  })
})

// The form's rules and the database's CHECK constraints are two copies of the
// same decision. If they drift, the failure lands on whoever typed a message
// the UI accepted and Postgres refused — after they wrote it.
describe('client rules match the database constraints', () => {
  const sql = fs.readFileSync('supabase/schema.sql', 'utf8')

  it('offers exactly the kinds the kind constraint allows', () => {
    const allowed = sql
      .match(/kind text not null check \(kind in \(([^)]*)\)\)/)[1]
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
    expect(new Set(allowed)).toEqual(new Set(FEEDBACK_KINDS.map((k) => k.key)))
  })

  it('uses the same message bounds', () => {
    const [, lo, hi] = sql.match(/char_length\(message\) between (\d+) and (\d+)/)
    expect(Number(lo)).toBe(MESSAGE_MIN)
    expect(Number(hi)).toBe(MESSAGE_MAX)
  })

  it('uses the same contact ceiling', () => {
    const [, max] = sql.match(/char_length\(contact\) <= (\d+)/)
    expect(Number(max)).toBe(CONTACT_MAX)
  })

  it('keeps feedback insert-only and private per user', () => {
    // Deliberate: no update or delete policy. A report is a record of what a
    // page said at a moment, and one that can be rewritten is not one.
    expect(sql).toMatch(/create policy "Users can send their own feedback"\s+on feedback for insert/)
    expect(sql).toMatch(/create policy "Users can view their own feedback"\s+on feedback for select/)
    expect(sql).not.toMatch(/on feedback for update/)
    expect(sql).not.toMatch(/on feedback for delete/)
  })

  it('counts the rate limit outside RLS to avoid policy recursion', () => {
    // A policy that selects from the table it guards recurses through its own
    // RLS. Security definer is what makes this rate limit work at all.
    expect(sql).toMatch(/create or replace function feedback_recent_count[\s\S]*?security definer/)
    expect(sql).toMatch(/feedback_recent_count\(auth\.uid\(\)\) < 10/)
  })
})

describe('resolveKind', () => {
  // Router history state is not trusted input: entries persist across reloads,
  // survive hand-editing, and outlive the code that wrote them. An
  // unrecognised category must not reach the form, or the database rejects it
  // only at submit time — after someone has written their paragraph.
  it('accepts every offered kind', () => {
    for (const k of FEEDBACK_KINDS) expect(resolveKind(k.key)).toBe(k.key)
  })

  it('falls back for anything else', () => {
    for (const bad of ['urgent', '', null, undefined, 0, {}, 'WRONG-NUMBER']) {
      expect(resolveKind(bad)).toBe(DEFAULT_KIND)
    }
  })

  it('falls back to a kind that is actually offered', () => {
    expect(FEEDBACK_KINDS.map((k) => k.key)).toContain(DEFAULT_KIND)
  })
})
