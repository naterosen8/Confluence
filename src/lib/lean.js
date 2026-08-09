// How the confluence score is labelled.
//
// The old labels were "Strong Bullish / Bullish / Neutral / Bearish / Strong
// Bearish". Two things were wrong with that vocabulary, and the site's own
// self-check is what made them indefensible:
//
//   1. "Bullish" is a claim about what price will do next. The measured
//      relationship between this score and the following sessions is about
//      -0.06 — statistically detectable and far too small to act on. The
//      label was asserting a forecast the data does not support.
//   2. "Neutral" reads as "nothing happening", when a score of zero actually
//      means the indicators are in active disagreement. That is a different
//      and more interesting state than quiet.
//
// The replacement describes what is actually being measured: how much the
// indicator readings agree with each other, and which way they currently
// point. "Readings aligned up" is a statement about the indicators. "Strong
// Bullish" was a statement about the future.
//
// `key` is the stable identifier — stored in the track record and used for
// colours — so wording can change later without invalidating logged history.
export const LEAN_BANDS = [
  {
    key: 'aligned-up',
    min: 3,
    label: 'Readings aligned up',
    short: 'Aligned ↑',
    direction: 'up',
    blurb: 'Nearly every tracked indicator is currently reading positive. They largely measure the same recent price action, so agreement is easier to come by than it looks.',
  },
  {
    key: 'leaning-up',
    min: 1,
    label: 'Readings lean up',
    short: 'Leaning ↑',
    direction: 'up',
    blurb: 'More indicators are reading positive than negative, but not all of them.',
  },
  {
    key: 'split',
    min: 0,
    label: 'Readings split',
    short: 'Split',
    direction: 'none',
    blurb: 'The indicators disagree with each other in roughly equal measure. This is a state of conflict, not of quiet.',
  },
  {
    key: 'leaning-down',
    min: -2,
    label: 'Readings lean down',
    short: 'Leaning ↓',
    direction: 'down',
    blurb: 'More indicators are reading negative than positive, but not all of them.',
  },
  {
    key: 'aligned-down',
    min: -Infinity,
    label: 'Readings aligned down',
    short: 'Aligned ↓',
    direction: 'down',
    blurb: 'Nearly every tracked indicator is currently reading negative. They largely measure the same recent price action, so agreement is easier to come by than it looks.',
  },
]

export function leanFor(score) {
  return LEAN_BANDS.find((b) => score >= b.min) ?? LEAN_BANDS[LEAN_BANDS.length - 1]
}

// Track-record entries logged before the rename carry the old wording. They
// are real history and must keep resolving, so they are mapped rather than
// rewritten — editing a published accuracy log to match new labels would be
// exactly the kind of retroactive tidying this record exists to rule out.
const LEGACY_LABELS = {
  'Strong Bullish': 'aligned-up',
  Bullish: 'leaning-up',
  Neutral: 'split',
  Bearish: 'leaning-down',
  'Strong Bearish': 'aligned-down',
}

export function leanByKey(keyOrLegacyLabel) {
  const key = LEGACY_LABELS[keyOrLegacyLabel] ?? keyOrLegacyLabel
  return LEAN_BANDS.find((b) => b.key === key) ?? null
}

// Direction of a logged entry, for scoring the track record. Works for both
// the current keys and the pre-rename labels.
export function leanDirection(keyOrLegacyLabel) {
  return leanByKey(keyOrLegacyLabel)?.direction ?? 'none'
}

// Colours are deliberately softer than the old badge palette. The previous
// green/red was as saturated as a buy/sell light, which did the same
// overclaiming the wording did. These tint enough to be scannable without
// reading as an instruction.
export const LEAN_COLORS = {
  'aligned-up': '#5cbf8a',
  'leaning-up': '#7fae97',
  split: '#9aa3b0',
  'leaning-down': '#c98f80',
  'aligned-down': '#e0715a',
}
