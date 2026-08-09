// One definition per concept, used by both the inline "?" explainers and the
// methodology page. Kept in a single file on purpose: two copies of a
// definition drift, and a caveat that appears on the methodology page but not
// next to the number it applies to is a caveat nobody reads.
//
// Every entry carries `isNot`. That field is the point of this file. Most
// misreadings here are not people failing to learn a definition, they are
// people applying a reasonable but wrong default meaning — "score" reads as
// confidence, "win rate" reads as profitability, "N" reads as independent
// trials. Stating the wrong meaning explicitly is the only thing that
// displaces it.

// What kind of claim a number makes. The app shows all four, and they were
// previously indistinguishable from one another in the UI.
export const BASIS = {
  current: {
    label: 'Live reading',
    blurb: 'What the indicators say as of the last daily sync. A description of now, not a forecast.',
  },
  measured: {
    label: 'Already happened',
    blurb: 'Computed from real past prices. These outcomes are settled — they are history, not prediction.',
  },
  hypothetical: {
    label: 'What-if',
    blurb: 'A position nobody actually took, replayed against real past prices to show what it would have done.',
  },
  accounting: {
    label: 'From filings',
    blurb: "Taken from the company's own reported financial statements, which can be up to a quarter stale.",
  },
}

export const GLOSSARY = {
  confluenceScore: {
    term: 'Confluence score',
    basis: 'current',
    what: 'How many of the tracked indicators currently point bullish, minus how many point bearish.',
    how: 'Each of five checks contributes ±1 (RSI at an extreme, MACD vs its signal line, 50-day vs 200-day average, price vs its 50-day average, weekly trend). An RSI divergence adds ±2. The result usually lands between −6 and +6.',
    isNot:
      'Not a probability, a confidence level, or a price target. +4 does not mean "80% likely" or "4 out of 5" — the scale is arbitrary and the indicators overlap heavily, so four agreeing signals are not four independent opinions.',
  },
  verdict: {
    term: 'Agreement badge',
    basis: 'current',
    what: 'How much the tracked indicators currently agree with each other, and which way they point: aligned at ±3 or beyond, leaning at ±1 to ±2, split at 0. The numbers beside it are the raw tally of positive and negative readings.',
    how: 'A band over the confluence score, shown with the underlying vote count so the difference between 5-0 and 4-1 stays visible.',
    isNot:
      'Not a forecast, and no longer worded as one. It used to read "Strong Bullish" and similar, which asserted a direction the site\'s own measurement does not support — the relationship between this score and what follows is close enough to zero to be useless. "Split" also does not mean quiet: it means the indicators are actively disagreeing.',
  },
  winRate: {
    term: 'Win rate',
    basis: 'measured',
    what: 'The share of past occurrences where the price was higher 5 sessions later (for a bullish setup) or lower (for a bearish one).',
    how: 'Every qualifying past day is found in the tracked history, and the close 5 sessions later is compared to the close on the day itself.',
    isNot:
      'Not a measure of profitability. A 55% win rate paired with a negative average return is a losing proposition — many small gains and a few large losses. Always read it next to the average return, never alone.',
  },
  avgReturn: {
    term: 'Average return',
    basis: 'measured',
    what: 'The mean price change over the 5 sessions following each past occurrence of a setup.',
    how: 'Close-to-close, unweighted, across every occurrence found in the tracked history.',
    isNot:
      'Not what you would have earned. It ignores fees, spread, slippage and taxes, assumes every signal was taken mechanically, and a mean is easily dragged by one outlier — which is why best and worst are shown alongside it.',
  },
  sampleSize: {
    term: 'Sample size (N)',
    basis: 'measured',
    what: 'How many past occurrences of this setup were found in the roughly one year of price history the app keeps.',
    how: 'A count of qualifying days. Any day without a full 5-session forward window is excluded rather than half-measured.',
    isNot:
      'Not N independent trials. Occurrences close together in time share overlapping forward windows — a signal yesterday and one today cover almost the same five days — so the true number of independent episodes is far smaller than the count suggests. Treat anything under about 15 as a hint, not a statistic.',
  },
  confidenceInterval: {
    term: '95% range (confidence interval)',
    basis: 'measured',
    what: 'The band of true win rates consistent with the handful of occurrences observed.',
    how: 'Wilson score interval at 95%, chosen over the textbook formula because that one misbehaves badly at small samples and rates near 0 or 100%.',
    isNot:
      'Not a range of expected outcomes for the next trade. It describes uncertainty about the historical rate itself. If the band spans 50%, the sample cannot distinguish this setup from a coin flip — however far the headline percentage sits from 50.',
  },
  independentSample: {
    term: 'Independent occurrences',
    basis: 'measured',
    what: 'How many of the counted occurrences are genuinely separate episodes rather than overlapping ones.',
    how: 'Walks the occurrences in order and counts only those beginning after the previous one\'s forward window has closed.',
    isNot:
      'Not a correction that makes the statistics valid. It is a floor on how much independent evidence exists, and it is usually far below the raw N.',
  },
  regime: {
    term: 'Market regime',
    basis: 'measured',
    what: "Whether the broad market was trending up, trending down, or chopping sideways, judged from SPY's own 50-day and 200-day averages.",
    how: 'Up when SPY is above its 50-day and the 50-day is above the 200-day; down for the mirror case; choppy otherwise. Crypto bars, which trade on weekends, are matched to the most recent prior SPY trading day.',
    isNot:
      'Not a market forecast, and a crude three-way split rather than a full description of market conditions.',
  },
  regimeMatched: {
    term: 'Regime-matched sample',
    basis: 'measured',
    what: "The same base rate, but restricted to past days when the broad market was in the same regime as today's.",
    how: 'Filters the occurrences by regime before summarizing them.',
    isNot:
      'Not automatically the better number. It is more relevant but much smaller, and a small relevant sample can mislead more than a large loose one. The app prefers it only when it has at least 8 occurrences.',
  },
  edge: {
    term: 'Edge (leaderboard ranking)',
    basis: 'measured',
    what: 'How far a setup\'s historical win rate sits from a coin flip, scaled by how much evidence supports it.',
    how: 'Win rate minus 50, multiplied by the square root of the sample size. Used only to order the dashboard cards.',
    isNot:
      'Not an expected return, and not a ranking of which ticker to buy. It measures strength of historical evidence, in either direction — a strongly bearish record ranks just as highly as a bullish one.',
  },
  rsi: {
    term: 'RSI (14)',
    basis: 'current',
    what: 'A 0–100 gauge of how one-sided recent price changes have been, over 14 sessions.',
    how: "Wilder's formula: average gain divided by average loss, smoothed. Below 30 is conventionally called oversold, above 70 overbought.",
    isNot:
      'Not a reversal signal. In a strong trend RSI can sit above 70 or below 30 for weeks while price keeps going, and "oversold" does not mean "cheap".',
  },
  macd: {
    term: 'MACD',
    basis: 'current',
    what: 'Whether short-term momentum is accelerating relative to medium-term momentum.',
    how: 'The 12-day exponential average minus the 26-day, compared against a 9-day average of itself. Above that signal line counts bullish, below counts bearish.',
    isNot:
      'Not a leading indicator. It is built entirely from past averages and turns after price does, so a crossover confirms a move that has already begun.',
  },
  trend: {
    term: '50-day / 200-day trend',
    basis: 'current',
    what: 'Whether the intermediate trend is up, judged by the 50-day average against the 200-day, and by price against the 50-day.',
    how: 'Two separate ±1 checks in the score: the averages against each other, and price against the 50-day.',
    isNot:
      'Not independent of the other checks. Trend, MACD and price-vs-average all measure closely related things, so they tend to agree with each other and inflate the score together.',
  },
  weeklyTrend: {
    term: 'Weekly trend',
    basis: 'current',
    what: 'Whether price sits above its 10-week average, resampled from the same daily bars.',
    how: 'Daily bars are grouped into Monday-to-Friday weeks and the last 10 weekly closes are averaged.',
    isNot:
      'Not a second opinion from a different data source. It is the same price series viewed at a coarser interval.',
  },
  divergence: {
    term: 'RSI divergence',
    basis: 'current',
    what: 'Price making a new high or low that RSI does not confirm — often read as momentum fading beneath the surface.',
    how: 'Compares the two most recent swing highs (or lows) within the last 60 sessions against RSI at those points. Worth ±2 in the score, the largest single contribution.',
    isNot:
      'Not present in the backtest tables. Recomputing swing structure for every historical day is expensive, so the score used in those tables excludes divergence — which is why the badge and the table can disagree by a tier.',
  },
  atrPercentile: {
    term: 'Volatility percentile (ATR)',
    basis: 'current',
    what: "Where today's average daily range sits within this ticker's own recent range history, from 0 to 100.",
    how: '14-day average true range, ranked against its last 100 readings.',
    isNot:
      'Not a direction signal. A low reading says moves have been small lately, which often precedes a larger one — it says nothing about which way.',
  },
  bollingerSqueeze: {
    term: 'Bollinger squeeze',
    basis: 'current',
    what: 'Whether the Bollinger bands have narrowed unusually far, meaning price has been unusually calm.',
    how: 'Band width ranked against its last 100 readings; below the 20th percentile counts as a squeeze.',
    isNot: 'Not a prediction that a breakout is coming, and no indication of which direction one would take.',
  },
  relativeVolume: {
    term: 'Relative volume',
    basis: 'current',
    what: "Today's volume against the average of the previous 20 sessions.",
    how: 'Latest volume divided by that 20-session mean.',
    isNot:
      'Not a measure of buying pressure. Every share bought was also sold; high volume means conviction on both sides, not one.',
  },
  supportResistance: {
    term: 'Support and resistance',
    basis: 'current',
    what: 'Recent price levels the market has already reacted to — a swing low below the current price, a swing high above it.',
    how: 'Local extremes: a bar whose high or low is the most extreme within three bars either side, taken from the last 150 sessions.',
    isNot:
      'Not a floor or a ceiling. These are levels price has turned at before, which is a reason to watch them, not a reason to expect them to hold.',
  },
  trackRecord: {
    term: 'Track record',
    basis: 'measured',
    what: 'Every day the app showed a ticker’s readings leaning one way rather than splitting, logged as it happened and scored 5 sessions later.',
    how: 'Written automatically by the daily job to a committed file. Nothing is removed after the fact, and misses are included.',
    isNot:
      'Not a performance record of a strategy. Calls overlap, are unweighted and unsized, and a "hit" only means price moved the way the verdict leaned — by any amount, however small.',
  },
  leverage: {
    term: 'Leverage',
    basis: 'hypothetical',
    what: 'Borrowing to hold a position larger than the stake, multiplying both the gain and the loss.',
    how: 'A position at Nx moves N times as much as the underlying. At Nx, a move of 1/N against it destroys the entire stake.',
    isNot:
      'Not a way to increase expected return. It scales the outcome in both directions while adding a floor at total loss, which is why higher leverage lowers the average outcome even when the direction is unchanged.',
  },
  wipedOut: {
    term: 'Wiped out (liquidation)',
    basis: 'hypothetical',
    what: 'The share of replayed positions where price moved far enough against the position to destroy the whole stake before the window closed.',
    how: "Checked against each session's intraday low for a long, or high for a short — a leveraged position dies the moment price touches the level, not at the close.",
    isNot:
      'Not a worst case. Real venues liquidate earlier, at a maintenance margin above zero equity, and charge funding and spread on top, so the real rate would be at least this high.',
  },
  marketCap: {
    term: 'Market cap',
    basis: 'accounting',
    what: 'What the market is currently paying for the whole company.',
    how: 'Current share price multiplied by shares outstanding from the latest SEC filing.',
    isNot:
      'Not the cost to buy the company. It ignores debt, and buying every share would move the price well above the last trade.',
  },
  bookEquity: {
    term: 'Book equity',
    basis: 'accounting',
    what: "What the company's own balance sheet says the shareholders' stake is worth: total assets minus total liabilities.",
    how: 'Taken from the most recent 10-Q or 10-K filed with the SEC.',
    isNot:
      'Not an appraisal or a liquidation value. Assets are carried at historical cost less depreciation, and internally-developed software, brands, patents and research are largely absent.',
  },
  priceToBook: {
    term: 'Price / book',
    basis: 'accounting',
    what: 'How many times the accounting equity the market is paying.',
    how: 'Market cap divided by book equity.',
    isNot:
      'Not a measure of how overpriced something is. For asset-light businesses most of the value is legitimately off the balance sheet, so a high multiple is normal; and a low one is as often the market correctly anticipating write-downs as it is a bargain. The ratio is far more informative for banks, insurers and holding companies.',
  },
  netCash: {
    term: 'Net cash',
    basis: 'accounting',
    what: 'Cash and short-term investments minus all debt.',
    how: 'Summed from the relevant line items in the latest filing.',
    isNot:
      'Not money available to shareholders. It may be committed to operations, held overseas, or needed as a regulatory buffer.',
  },
  enterpriseValue: {
    term: 'Enterprise value',
    basis: 'accounting',
    what: 'What the operating business alone is being priced at, setting the cash pile aside.',
    how: 'Market cap minus net cash.',
    isNot: 'Not a price anyone would pay in practice; it is a comparison device for businesses with different cash and debt loads.',
  },
  ncav: {
    term: 'Net current asset value',
    basis: 'accounting',
    what: "Graham's deep-value yardstick: current assets minus every liability, valuing all long-term assets at zero.",
    how: 'Current assets less total liabilities, from the latest filing.',
    isNot:
      'Not a floor on the share price. Companies trading below it usually are so because the market expects those assets to be consumed by losses.',
  },
}

export function glossaryByBasis() {
  const groups = {}
  for (const [key, entry] of Object.entries(GLOSSARY)) {
    ;(groups[entry.basis] ||= []).push({ key, ...entry })
  }
  return groups
}
