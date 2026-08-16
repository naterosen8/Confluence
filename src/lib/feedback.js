import { supabase } from './supabaseClient.js'

// Sending feedback about the site.
//
// The report this exists for is "this number is wrong". Everything else a
// visitor might say is welcome, but a site whose entire claim is that its
// figures are real and checkable depends on being told when one of them is
// not — and that report is the one most likely to be dead on arrival, because
// the snapshot rolls every weekday. "The price-to-book on this page looks
// off" cannot be investigated a week later against data that has since
// changed. So the route and the snapshot timestamp ride along automatically.
//
// Validation lives here as a pure function rather than in the form, so the
// rules can be tested without a browser or a network, and so the database's
// CHECK constraints and the UI cannot drift apart — the bounds below are the
// same ones in supabase/schema.sql.

export const MESSAGE_MIN = 4
export const MESSAGE_MAX = 2000
export const CONTACT_MAX = 200

// Ordered by how useful the report is to act on, not alphabetically. The
// first one is the point of the whole feature.
export const FEEDBACK_KINDS = [
  {
    key: 'wrong-number',
    label: 'A number looks wrong',
    hint: 'The most useful thing you can send. Say which figure and what you expected — the page and data date come along automatically.',
  },
  {
    key: 'bug',
    label: 'Something is broken',
    hint: 'A page that will not load, a control that does nothing, a layout that overlaps.',
  },
  {
    key: 'confusing',
    label: "I can't tell what this means",
    hint: 'If a label or a reading needed a second look, that is a defect in the writing, not in you.',
  },
  { key: 'suggestion', label: 'Suggestion', hint: 'Something missing, or something that would make this more useful.' },
  { key: 'other', label: 'Something else', hint: '' },
]

const KIND_KEYS = new Set(FEEDBACK_KINDS.map((k) => k.key))

// Returns { ok, errors: { field: message } }. Trimmed values come back on the
// result so the caller submits exactly what was validated rather than
// re-deriving it and possibly differing.
export function validateFeedback({ kind, message, contact }) {
  const errors = {}
  const trimmedMessage = (message ?? '').trim()
  const trimmedContact = (contact ?? '').trim()

  if (!KIND_KEYS.has(kind)) errors.kind = 'Pick what kind of feedback this is.'

  if (trimmedMessage.length === 0) errors.message = 'Say what you noticed.'
  else if (trimmedMessage.length < MESSAGE_MIN)
    errors.message = `A few more words would help — ${MESSAGE_MIN} characters minimum.`
  else if (trimmedMessage.length > MESSAGE_MAX)
    errors.message = `That is ${trimmedMessage.length} characters; the limit is ${MESSAGE_MAX}.`

  if (trimmedContact.length > CONTACT_MAX) errors.contact = `Keep this under ${CONTACT_MAX} characters.`

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    values: { kind, message: trimmedMessage, contact: trimmedContact || null },
  }
}

export async function submitFeedback({ userId, kind, message, contact, page, snapshotAt }) {
  const check = validateFeedback({ kind, message, contact })
  // Belt and braces: the form blocks this path, but a validated-then-mutated
  // payload should not reach the database on the strength of the UI alone.
  if (!check.ok) throw new Error(Object.values(check.errors)[0])

  const { data, error } = await supabase
    .from('feedback')
    .insert({
      user_id: userId,
      kind: check.values.kind,
      message: check.values.message,
      contact: check.values.contact,
      page: page ?? null,
      snapshot_at: snapshotAt ?? null,
    })
    .select()
    .single()

  if (error) {
    // The rate limit is enforced by the insert policy, so it surfaces as a
    // generic RLS violation. Saying "you are not allowed to do that" to
    // someone who just wrote a paragraph is the wrong message when what
    // actually happened is that they sent several in an hour.
    if (error.code === '42501' || /row-level security/i.test(error.message ?? '')) {
      throw new Error(
        'That is several reports in the last hour — the limit is 10. Nothing is wrong with what you wrote; try again a little later.'
      )
    }
    throw error
  }
  return data
}

export async function listMyFeedback(userId) {
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
