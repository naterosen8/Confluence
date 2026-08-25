import { leanByKey } from './lean.js'
import { rate, pct, price as fmtPrice, compactMoney } from './format.js'

// One screen, one voice.
//
// A ticker here is seven chapters, and that is the right shape for checking
// the site and the wrong one for using it. The page someone lands on is
// "Layers" — the most abstract and most heavily caveated thing on the site —
// and the question they actually arrived with ("what is this instrument
// doing") is answered in pieces across six more pages, each piece wrapped in
// its own disclaimer. Six panels that each hedge separately read as evasion.
// One paragraph that states the limits once reads as knowing what it knows.
//
// So this assembles. It computes nothing new: every figure here is produced,
// tested and caveated somewhere else, and the chapters stay underneath as the
// audit trail. What it adds is order and a single voice.
//
// The rule that shapes the whole thing: **the lean is never stated without
// what it has been worth.** A badge saying "leaning up" at the top of a brief
// carries far more weight than the same badge in a table of eighty-nine rows,
// and the site's own measurements say it is worth nothing. Those two facts
// belong in the same sentence, always, or the first one travels alone.

// The direction the readings lean, and — inseparably — what leaning that way
// has actually been worth on this instrument.
//
// Two sources, and they answer different questions. The base rate is what
// happened after setups like this one across the whole tracked history; the
// published record is what this site said out loud about this ticker and how
// it turned out. The first is reconstruction, the second is testimony. Both
// are usually unflattering and both belong here.
export function leanWorth({ signals, stat, record }) {
  const lean = leanByKey(signals?.verdict)
  if (!lean) return null

  const parts = []
  // 'none' is a direction string, not a falsy one — reading it as truthy
  // printed "the readings lean none", which is both wrong and the single most
  // confusing sentence the page could open with.
  if (lean.direction === 'up' || lean.direction === 'down') {
    parts.push(`The readings lean ${lean.direction} — ${signals.bullishPoints} of the checks positive against ${signals.bearishPoints} negative.`)
  } else {
    parts.push('The readings split rather than leaning either way, which is the most common state and the least interesting one.')
  }

  if (stat?.gap != null && stat.sampleSize) {
    const worse = stat.gap < 0
    parts.push(
      `After setups like this one, price went the leaned way ${rate(stat.winRate)} of ${stat.sampleSize} times, against ${rate(stat.drift)} for this ticker generally: a gap of ${stat.gap >= 0 ? '+' : '−'}${Math.abs(stat.gap).toFixed(1)} points.`
    )
    parts.push(
      stat.distinguishable
        ? worse
          ? 'That gap clears the interval on the difference, so it is not the instrument simply doing what it does — this structure has been actively unhelpful here rather than merely uninformative.'
          : 'That gap clears the interval on the difference, which makes it the one reading on this ticker that survives its own test.'
        : 'The interval on that difference includes zero, so it is not distinguishable from the instrument simply doing what it does.'
    )
    if (stat.independentSample && stat.independentSample < stat.sampleSize) {
      parts.push(
        `That ${stat.sampleSize} is closer to ${stat.independentSample} once overlapping forward windows are accounted for.`
      )
    }
  }

  if (record?.resolvedCount) {
    parts.push(
      `Published on this ticker: ${record.hits} of ${record.resolvedCount} resolved ${record.resolvedCount === 1 ? 'call' : 'calls'} went the leaned way, over windows in which price rose ${record.drift.toFixed(0)}% of the time regardless.${record.enough ? '' : ' Too few to be a rate.'}`
    )
  }

  return { lean, text: parts.join(' ') }
}

// Where price is and what shape it is in — the question someone actually
// arrived with, answered before anything is claimed about it.
function whereItStands({ symbol, signals, setup, market, livePrice }) {
  const parts = []
  const p = livePrice ?? signals?.price
  const above50 = signals?.sma50 != null && p > signals.sma50
  const above200 = signals?.sma200 != null && p > signals.sma200

  const position =
    signals?.sma50 == null || signals?.sma200 == null
      ? 'without enough history to place it against its long averages'
      : above50 && above200
      ? 'above both its 50- and 200-day averages'
      : !above50 && !above200
      ? 'below both its 50- and 200-day averages'
      : above200
      ? 'above its 200-day average but under its 50-day'
      : 'above its 50-day average but under its 200-day'

  parts.push(`${symbol} last traded at ${fmtPrice(p)}, ${position}.`)
  if (setup?.name) parts.push(`The structure reads as ${setup.name.toLowerCase()}.`)
  if (signals?.rsi != null) {
    const rsi = signals.rsi
    const where = rsi >= 70 ? ', stretched by the usual convention' : rsi <= 30 ? ', washed out by the usual convention' : ''
    parts.push(`RSI is ${rsi.toFixed(0)}${where}.`)
  }
  if (market?.headline) {
    parts.push(
      `The tape around it: ${market.headline.toLowerCase()}${market.breadth ? `, with ${market.breadth.above} of ${market.breadth.counted} tracked names holding above their own 50-day` : ''}.`
    )
  }
  return parts.join(' ')
}

// What holding it has been like. The part a win rate cannot say.
function whatHoldingItIsLike({ drawdown, recovery, riskRead: risk }) {
  const parts = []
  if (drawdown?.medianAdversePct != null) {
    parts.push(
      `A position held five sessions has typically gone ${Math.abs(drawdown.medianAdversePct).toFixed(1)}% against itself before resolving${drawdown.worstPct != null ? `, and the deepest of the last ${drawdown.entries} entries reached ${Math.abs(drawdown.worstPct).toFixed(1)}%` : ''}.`
    )
  }
  if (recovery?.medianSessions != null) {
    parts.push(
      `Once one closed a full ATR under water it took a median ${recovery.medianSessions} session${recovery.medianSessions === 1 ? '' : 's'} to see entry again${recovery.neverRecoveredPct >= 5 ? `, and ${recovery.neverRecoveredPct.toFixed(0)}% never did inside sixty` : ''}.`
    )
  }
  if (risk?.safeLeverage != null) {
    parts.push(
      `Above ${risk.safeLeverage}x, this instrument's own recent history has already taken a position to zero.`
    )
  }
  return parts.join(' ')
}

// The four or five numbers worth carrying away, each already computed and
// caveated on the chapter it comes from.
function figuresFor({ risk, stop, drawdown, liquidity, atr, corrSpy }) {
  const out = []
  if (risk?.safeLeverage != null) {
    out.push({ key: 'size', term: 'riskRead', label: 'Survived up to', value: `${risk.safeLeverage}x`, note: `over the last ${risk.entries} entries` })
  }
  if (stop?.keeper?.mult != null && atr != null) {
    out.push({
      key: 'stop',
      term: 'stopRead',
      label: 'Stop stops being noise at',
      value: `${stop.keeper.mult} ATR`,
      note: `${fmtPrice(stop.keeper.mult * atr)} from entry`,
    })
  }
  if (drawdown?.medianAdversePct != null) {
    out.push({
      key: 'drawdown',
      term: 'drawdownRead',
      label: 'Typical move against you',
      value: pct(drawdown.medianAdversePct),
      note: 'before the hold resolves',
    })
  }
  if (liquidity && !liquidity.reported) {
    out.push({
      key: 'liquidity',
      term: 'absorbableSize',
      label: 'Quiet session absorbs',
      value: '—',
      note: 'the feed reports no volume for this pair',
    })
  } else if (liquidity?.reported) {
    out.push({
      key: 'liquidity',
      term: 'absorbableSize',
      label: 'Quiet session absorbs',
      value: compactMoney(liquidity.absorbableQuiet),
      note: liquidity.thin ? 'thin — a real position moves it' : 'at the 1%-of-volume ceiling',
    })
  }
  if (corrSpy != null) {
    out.push({
      key: 'corr',
      term: 'correlation',
      label: 'Moves with the index',
      value: corrSpy.toFixed(2),
      note: Math.abs(corrSpy) >= 0.7 ? 'largely the index in a costume' : Math.abs(corrSpy) <= 0.3 ? 'largely its own thing' : 'partly its own thing',
    })
  }
  return out
}

// What else you already hold that is the same trade. Only when there is
// something to say — a link that lands on "nothing to overlap" is noise.
function overlapLine({ symbol, overlap }) {
  if (!overlap || overlap.count < 2) return null
  const block = overlap.groups?.find((g) => g.members.includes(symbol) && g.members.length > 1)
  if (block) {
    const others = block.members.filter((s) => s !== symbol)
    return `In your watchlist, ${symbol} moves as one position with ${others.join(', ')} (mean correlation ${block.meanCorrelation.toFixed(2)}) — sizing them separately spreads the ticket, not the exposure.`
  }
  return `Across your watchlist of ${overlap.count}, ${symbol} did not group with anything at the ${overlap.threshold.toFixed(2)} threshold.`
}

export function brief(input) {
  const { symbol, signals, setup, stat, market, record, risk, stop, drawdown, recovery, liquidity, atr, corrSpy, overlap, livePrice } = input
  if (!signals) return null

  const worth = leanWorth({ signals, stat, record })

  // Deliberately not a verdict. It names the state and, where the record has
  // something to say, what the readings have been worth in the same breath —
  // so the headline can never be quoted as a call.
  const headline = (() => {
    const shape = setup?.name ?? 'No clear structure'
    if (stat?.gap != null && stat.distinguishable && stat.gap < 0) return `${shape} — and here, that has been worse than doing nothing`
    if (stat?.gap != null && stat.distinguishable && stat.gap > 0) return `${shape} — the one reading on this ticker that clears its own test`
    if (stat?.sampleSize) return `${shape} — with no measurable edge behind it`
    return shape
  })()

  return {
    symbol,
    headline,
    lean: worth?.lean ?? null,
    sections: [
      { key: 'stands', title: 'Where it stands', text: whereItStands({ symbol, signals, setup, market, livePrice }) },
      worth ? { key: 'worth', title: 'What the readings have been worth', text: worth.text } : null,
      { key: 'holding', title: 'What holding it has been like', text: whatHoldingItIsLike({ drawdown, recovery, riskRead: risk }) },
      overlapLine({ symbol, overlap }) ? { key: 'overlap', title: 'What else is the same trade', text: overlapLine({ symbol, overlap }) } : null,
    ].filter((s) => s && s.text),
    figures: figuresFor({ risk, stop, drawdown, liquidity, atr, corrSpy }),
    caveat:
      'Assembled from the chapters that follow — every figure here is computed, tested and caveated on one of them, and none of it is new. Nothing on this page says whether to take a position or in which direction: the site measures its own predictive power and does not find any, which is stated above rather than buried.',
  }
}
