// One place for the formats that appear on more than one page.
//
// There were four separate pct() helpers — in TickerDetail, TrackRecord,
// MyTrades and LeverageStudy — with three different precision defaults and
// two different null behaviours. The same quantity therefore rendered as
// "+1.4%" on one page and "+1.40%" on another, and one of the four crashed on
// a null instead of printing a dash. Currency had the same problem: two
// spellings of a negative amount, "−$123" in one file and "-123.45" in
// another, because one used a real minus sign and the other inherited a
// hyphen from toFixed().
//
// Precision is a deliberate choice, not a per-file accident: two decimals
// everywhere, and a caller that genuinely needs less says so at the call site.

const MINUS = '−' // real minus sign, not a hyphen — aligns with digits

// Signed percentage. Null renders as a dash rather than "NaN%" — a missing
// number and a zero are different claims.
export function pct(v, digits = 2) {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v >= 0 ? '+' : MINUS}${Math.abs(v).toFixed(digits)}%`
}

// Unsigned percentage, for rates that are never negative (win rates, shares
// of a total) where a leading "+" would be noise.
export function rate(v, digits = 0) {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v.toFixed(digits)}%`
}

// A price. Always two decimals: prices line up in tables and a trailing zero
// carries information about precision.
export function price(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  return `$${v.toFixed(2)}`
}

// A signed cash amount, for profit and loss.
export function signedMoney(v, digits = 2) {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v >= 0 ? '+' : MINUS}$${Math.abs(v).toFixed(digits)}`
}

// Large balance-sheet figures, abbreviated. Kept unsigned-positive with an
// explicit minus so a negative equity reads unambiguously.
export function compactMoney(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  const sign = v < 0 ? MINUS : ''
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  // Grouped below a million, where the abbreviation stops doing the work.
  // "$565371" and "$100000" appear side by side in the position sizer and
  // differ by a factor of five and a half, which is not something anyone
  // should have to count digits to see.
  return `${sign}$${group(abs)}`
}

// Thousands separators, locale-aware. Used wherever a raw amount is shown at
// full precision rather than abbreviated.
export function group(v, digits = 0) {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function money(v, digits = 0) {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v < 0 ? MINUS : ''}$${group(Math.abs(v), digits)}`
}

export function shareCount(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : `${(n / 1e6).toFixed(0)}M`
}
