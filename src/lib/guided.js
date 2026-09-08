// Which of the measurements this particular person actually needs.
//
// The numbers do not change. Which ones lead does.
//
// Showing all of them at once is what the front page did, and it meant the
// person buying $500 of a coin with cash read a paragraph about 2x liquidation
// that does not apply to them, while the person about to put 10x on it got the
// wipeout number as one of three equal panels. Both of those are the wrong
// emphasis for the reader in front of it, and the wrong emphasis is how a page
// full of correct numbers ends up useless.
//
// So two questions decide the ordering: whether they are borrowing, and how
// long they mean to hold. Nothing is deleted — everything not promoted stays
// one click behind a control that is always visible. Demoting a true number is
// an editorial judgement; hiding one is a different thing, and this does the
// first only.

import { WAITING_COSTS } from './plainRisk.js'

export const LEVERAGE_ANSWERS = [
  { key: 'cash', label: 'No, paying cash', leverage: 1 },
  { key: 'small', label: 'Yes, 2–3x', leverage: 3 },
  { key: 'large', label: 'Yes, more than that', leverage: 10 },
]

export const HORIZON_ANSWERS = [
  { key: 'days', label: 'A few days', sessions: 5 },
  { key: 'weeks', label: 'Weeks', sessions: 25 },
  { key: 'months', label: 'Months or longer', sessions: 120 },
]

export const answerFor = (list, key) => list.find((a) => a.key === key) ?? null

// The ordering, and why each item is where it is.
//
// Leverage decides whether the wipeout number is the whole story or a footnote.
// Horizon decides whether recovery time matters: someone holding for months has
// time for a drawdown to resolve and needs to know the dip is survivable;
// someone holding days does not get that time, and for them how deep it goes is
// the question and how long it takes to come back is nearly the whole risk.
export function guide({ leverage, horizon, risks }) {
  const lev = answerFor(LEVERAGE_ANSWERS, leverage)
  const hor = answerFor(HORIZON_ANSWERS, horizon)
  if (!lev || !hor || !risks?.length) return null

  const by = Object.fromEntries(risks.map((r) => [r.key, r]))
  const order = []
  const reasons = {}

  const borrowing = lev.leverage > 1

  if (borrowing && by.size) {
    order.push('size')
    reasons.size =
      lev.key === 'large'
        ? 'You said you are borrowing heavily, which makes this the only number that matters until it is settled.'
        : 'You said you are borrowing, so this is the number that decides whether the position survives at all.'
  }

  // Depth comes next for anyone, but it is the lead for a cash buyer: without
  // borrowing there is no wipeout level, and how far down it goes is what
  // actually decides whether they sell at the bottom.
  if (by.drawdown) {
    order.push('drawdown')
    reasons.drawdown = borrowing
      ? 'How far it typically moves against you — worth comparing against the wipeout level above.'
      : 'Paying cash means nothing can force you out, so the real risk is selling because it got uncomfortable. This is how uncomfortable.'
  }

  if (by.recovery) {
    order.push('recovery')
    const timing =
      hor.key === 'months'
        ? 'You said months, so a dip has time to resolve — this is how often it does not.'
        : hor.key === 'days'
        ? 'You said a few days, which is less time than this usually takes to come back from a fall.'
        : 'Weeks is around the time this usually takes to recover, so it is close either way.'
    reasons.recovery = borrowing ? `${timing} ${WAITING_COSTS}` : timing
  }

  if (by.liquidity) {
    order.push('liquidity')
    reasons.liquidity = 'Worth knowing before you size it: getting out is not free here.'
  }

  const promoted = order.map((key) => ({ ...by[key], why: reasons[key] }))
  const rest = risks.filter((r) => !order.includes(r.key))

  return {
    leverage: lev,
    horizon: hor,
    // The lead item, sized bigger than the others on the page.
    lead: promoted[0] ?? null,
    supporting: promoted.slice(1),
    // Never empty by construction today, but the page must not assume it: if
    // an instrument is missing a read, that read simply is not there.
    rest,
    // Stated on the page, because a filtered view that does not say it is
    // filtered is just a shorter page pretending to be the whole one.
    note:
      borrowing
        ? `Ordered for someone borrowing to buy and holding ${hor.label.toLowerCase()}.`
        : `Ordered for someone paying cash and holding ${hor.label.toLowerCase()}.`,
  }
}
