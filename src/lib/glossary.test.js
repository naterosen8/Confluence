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
