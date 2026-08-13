import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { GLOSSARY, BASIS, glossaryByBasis } from './glossary.js'
import { LAYER_TERM, LAYER_INPUTS } from './confluenceLayers.js'

const SRC = path.resolve(new URL('..', import.meta.url).pathname)

function jsxFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...jsxFiles(full))
    else if (entry.name.endsWith('.jsx')) out.push(full)
  }
  return out
}

describe('glossary integrity', () => {
  it('every entry is complete and uses a known basis', () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.term, `${key}.term`).toBeTruthy()
      expect(entry.what, `${key}.what`).toBeTruthy()
      expect(entry.how, `${key}.how`).toBeTruthy()
      // isNot is the whole reason this file exists — an entry without one is a
      // definition that leaves the wrong default meaning in place.
      expect(entry.isNot, `${key}.isNot`).toBeTruthy()
      expect(BASIS[entry.basis], `${key}.basis "${entry.basis}"`).toBeTruthy()
    }
  })

  it('groups every entry under a basis on the methodology page', () => {
    const groups = glossaryByBasis()
    const grouped = Object.values(groups).reduce((n, g) => n + g.length, 0)
    expect(grouped).toBe(Object.keys(GLOSSARY).length)
  })
})

// Explain() renders its children unchanged when the term is unknown, so a typo
// in a term= prop does not throw, does not warn, and does not show — the "?"
// simply never appears. That failure is invisible in review and in the browser,
// which is exactly the kind that survives. This makes it loud instead.
describe('every term referenced in the UI exists', () => {
  const files = jsxFiles(SRC)

  it('finds JSX to scan', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  // The confluence layers pass their terms through a lookup table, so the
  // source scan below cannot see them.
  it('resolves every confluence-layer term', () => {
    for (const [layer, term] of Object.entries(LAYER_TERM)) {
      expect(GLOSSARY[term], `LAYER_TERM.${layer} -> ${term}`).toBeTruthy()
    }
    for (const [layer, inputs] of Object.entries(LAYER_INPUTS)) {
      expect(LAYER_TERM[layer], `LAYER_INPUTS.${layer} has no matching layer`).toBeTruthy()
      for (const [term, label] of inputs) {
        expect(GLOSSARY[term], `LAYER_INPUTS.${layer} -> ${term}`).toBeTruthy()
        expect(label, `LAYER_INPUTS.${layer} chip label`).toBeTruthy()
      }
    }
  })

  it('has no dangling term= reference', () => {
    const missing = []
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8')
      for (const match of source.matchAll(/\bterm="([^"]+)"/g)) {
        if (!GLOSSARY[match[1]]) missing.push(`${path.relative(SRC, file)}: ${match[1]}`)
      }
    }
    expect(missing).toEqual([])
  })
})

// Chapter splits move content between URLs, and a link pointing at the page a
// section *used to* be on still resolves — it just lands somewhere that no
// longer contains what it promised. That is invisible to every other check
// here, so the destinations are pinned.
describe('cross-page links point at the chapter that holds the content', () => {
  const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8')

  it('sends the self-check link to the chapter the self-check lives on', async () => {
    const { METHODOLOGY_CHAPTERS } = await import('./chapters.js')
    const detail = read('pages/TickerDetail.jsx')
    const target = detail.match(/to="(\/methodology[^"]*)">self-check</)?.[1]
    expect(target).toBe('/methodology/evidence')
    expect(METHODOLOGY_CHAPTERS.some((c) => c.key === 'evidence')).toBe(true)
    // And that chapter is the one rendering it.
    const methodology = read('pages/Methodology.jsx')
    const evidence = methodology.split("chapter.key === 'evidence'")[1]?.split('</>)}')[0] ?? ''
    expect(evidence).toContain('<SignalCheck')
  })

  it('routes every chapter key the nav can produce', async () => {
    const { TICKER_CHAPTERS, METHODOLOGY_CHAPTERS } = await import('./chapters.js')
    const app = read('App.jsx')
    expect(app).toContain('/ticker/:symbol/:chapter')
    expect(app).toContain('/methodology/:chapter')
    // Every chapter must actually be rendered by its page, or the tab leads
    // to a blank panel.
    const detail = read('pages/TickerDetail.jsx')
    for (const c of TICKER_CHAPTERS) expect(detail, c.key).toContain(`chapter.key === '${c.key}'`)
    const methodology = read('pages/Methodology.jsx')
    for (const c of METHODOLOGY_CHAPTERS) expect(methodology, c.key).toContain(`chapter.key === '${c.key}'`)
  })

  it('keeps chapter keys URL-safe and unique', async () => {
    const { TICKER_CHAPTERS, METHODOLOGY_CHAPTERS } = await import('./chapters.js')
    for (const set of [TICKER_CHAPTERS, METHODOLOGY_CHAPTERS]) {
      const keys = set.map((c) => c.key)
      expect(new Set(keys).size).toBe(keys.length)
      for (const k of keys) expect(k).toMatch(/^[a-z0-9-]+$/)
      for (const c of set) {
        expect(c.label, `${c.key} label`).toBeTruthy()
        expect(c.blurb, `${c.key} blurb`).toBeTruthy()
      }
    }
  })
})
