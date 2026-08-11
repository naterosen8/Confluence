// Which glossary entry defines each confluence layer, and which concepts each
// layer's generated reason lines draw on.
//
// This lives in lib rather than beside the component so the glossary test can
// import it. The reason sentences are generated strings, so a "?" cannot be
// attached to each one individually — these are offered as chips under the
// layer instead, which means a typo here would silently drop an explainer
// exactly the way a typo in a term= prop would. The test checks both.
export const LAYER_TERM = {
  technical: 'technicalLayer',
  fundamental: 'fundamentalLayer',
  macro: 'macroLayer',
}

export const LAYER_INPUTS = {
  technical: [
    ['breakout', 'Breakout'],
    ['volumeConfirmation', 'Volume confirmation'],
    ['supportResistance', 'Swing levels'],
    ['divergence', 'Unconfirmed high/low'],
  ],
  fundamental: [
    ['earningsYoY', 'Year-over-year trend'],
    ['netCash', 'Net cash'],
    ['marketCap', 'Market cap'],
  ],
  macro: [
    ['macroLayer', 'Rates proxy (TLT)'],
    ['macroLayer', 'Credit proxy (HYG)'],
  ],
}
