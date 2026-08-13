// The ticker page as a book rather than one ten-section scroll.
//
// The ordering principle is the one the whole app already runs on: BASIS, the
// kind of claim a number makes. Live reading, already happened, from filings,
// what-if. Grouping by that rather than by topic means each page answers one
// question and answers it in one voice — and a reader who flips through picks
// up the distinction between "this is what the indicators say now" and "this
// is what happened afterwards" without being lectured about it, because the
// page break is the lecture.
//
// It also fixes a specific confusion the single scroll created. The badge, the
// base rates and the leverage replay sat within a screen of each other and
// look alike — three panels of percentages — while making completely
// different claims. Two of them describe the past and one describes now.
//
// Order within that: what the evidence says, then what it has been worth, then
// what the company is worth, then what a position would have done. Reading
// straight through goes from the strongest claim to the weakest.
export const TICKER_CHAPTERS = [
  {
    key: 'layers',
    label: 'Layers',
    basis: 'current',
    blurb:
      'Technical, fundamental and macro evidence read side by side. This is the confluence the site is named for, and the only page where the three can be seen disagreeing.',
  },
  {
    key: 'signals',
    label: 'Signals',
    basis: 'current',
    blurb:
      'The individual indicator readings behind the score, and the volatility, volume and structure around them. All of it describes the last synced session, not what comes next.',
  },
  {
    key: 'record',
    label: 'Record',
    basis: 'measured',
    blurb:
      'What actually happened after setups like this one, across the tracked history. Settled outcomes — these are the numbers that get to contradict the badge.',
  },
  {
    key: 'balance-sheet',
    label: 'Balance sheet',
    basis: 'accounting',
    blurb:
      "What the company's own filings say it is worth, against what the market is paying. Updated four times a year, so it moves on a different clock from everything else here.",
  },
  {
    key: 'what-if',
    label: 'What-if',
    basis: 'hypothetical',
    blurb:
      'Positions nobody took, replayed against real prices, plus a simulator for one of your own. Nothing here is a suggestion — you pick the direction and the size.',
  },
  {
    key: 'share',
    label: 'Share',
    blurb: 'A card and caption built from what is on these pages right now, with the disclaimer baked in.',
  },
]

// An unrecognised chapter falls back to the first rather than dead-ending.
// Unlike an unknown ticker — which would have meant rendering invented
// analysis, and correctly returns NotFound — a mistyped chapter still shows
// genuine, correctly labelled data for the right symbol.
export function chapterFor(key, chapters = TICKER_CHAPTERS) {
  return chapters.find((c) => c.key === key) ?? chapters[0]
}

export function chapterNeighbours(key, chapters = TICKER_CHAPTERS) {
  const i = chapters.findIndex((c) => c.key === chapterFor(key, chapters).key)
  return { index: i, prev: chapters[i - 1] ?? null, next: chapters[i + 1] ?? null }
}
