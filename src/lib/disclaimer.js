// The gate shown before anyone reaches the site, and the record that they
// passed it.
//
// This exists because of what is on the other side of it: a screener whose own
// measurements find no predictive edge, sitting next to a simulator that goes
// to 50x. Someone who lands on a ticker page and reads "aligned up" without
// context is being invited to a conclusion the data does not support. The
// terms below are the ones the site can actually stand behind, and they are
// the same ones repeated throughout it — this is where they are unavoidable.
//
// Versioned on purpose. If the terms change materially the version goes up and
// everyone is asked again, because consent to a different set of terms is not
// consent to these ones. Bumping it for a typo would be noise; bumping it for
// a new claim is the point.
// Version 2: the site gained a position-size calculator and a basket overlap
// read. Turning a measurement into a share count is a new kind of output, so
// the terms name it and everyone is asked again — consent to a site that only
// described instruments is not consent to one that does arithmetic on your
// account size.
export const DISCLAIMER_VERSION = 2

const KEY = 'confluence.disclaimer'

// The specific things a person is agreeing they understand. Deliberately
// concrete rather than legalese: a wall of boilerplate is scrolled past, and a
// list someone actually reads is the only version that does anything.
export const DISCLAIMER_POINTS = [
  {
    key: 'not-advice',
    text: 'Nothing here is financial advice. The site never recommends a direction, a size or an instrument, and it has nothing to sell.',
  },
  {
    key: 'no-edge',
    text: 'Its own measurements find no predictive edge. Base rates here do not separate from what each instrument does anyway, and the published track record is consistent with the readings carrying no information at all.',
  },
  {
    key: 'lagging',
    text: 'Every indicator shown is lagging by construction, computed from prices everyone else can already see.',
  },
  {
    key: 'stale',
    text: 'Prices sync once each weekday evening and can be hours or days old. The data comes from a third party and has contained outright errors — a report of one is welcome.',
  },
  {
    key: 'simulated',
    text: 'Simulated trades involve no money and no broker. They are optimistic: no funding, no spread, no slippage, and a real venue closes a leveraged position before its equity reaches zero.',
  },
  {
    key: 'past',
    text: 'The risk figures — survivable size, stop distance, drawdown, recovery time, what a session absorbs, how much of a basket is one bet — describe what has already happened. They are not a bound on what happens next, and they are not safety limits.',
  },
  {
    key: 'sizing',
    text: 'The position-size panel is arithmetic on numbers you type in. It does not propose an account size, a risk budget, a direction or a size, and a figure it returns is not a suggestion to take that position.',
  },
  {
    key: 'yours',
    text: 'Any decision you make with what you read here is yours, and so is any loss.',
  },
]

// Storage throws rather than returning null in Safari private mode and
// wherever site data is blocked. A gate that crashes the app is worse than one
// that asks twice, so every failure path here ends in "show it again".
export function readAcceptance() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return typeof parsed?.version === 'number' ? parsed : null
  } catch {
    return null
  }
}

export function writeAcceptance(now = new Date()) {
  const record = { version: DISCLAIMER_VERSION, at: now.toISOString() }
  try {
    localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    /* Not persistable here; the visit continues and they are asked again next
       time, which is the safe direction to fail in. */
  }
  return record
}

export function clearAcceptance() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}

// Accepting version 1 is not accepting version 2. Anything older than the
// current terms is treated as not accepted.
export function hasAccepted(record = readAcceptance()) {
  return Boolean(record && record.version >= DISCLAIMER_VERSION)
}
