import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Static checks over the components themselves.
//
// These exist because of a specific failure that got all the way to a browser:
// a `useState` setter was renamed from `setMultiple` to `setChosen`, one call
// site was missed, and nothing caught it. The build does not resolve
// identifiers inside JSX handlers, and no unit test renders that component, so
// the first sign of trouble was `setMultiple is not defined` thrown at the
// moment someone changed a dropdown.
//
// A full scope analysis would be the general answer and is far more machinery
// than this is worth. These are deliberately narrow: they catch the shapes
// that actually break, on a codebase where every component is a plain function
// with hooks at the top.

const SRC = path.join(process.cwd(), 'src')

function jsxFiles(dir = SRC, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) jsxFiles(full, out)
    else if (e.name.endsWith('.jsx')) out.push(full)
  }
  return out
}

const files = jsxFiles().map((file) => ({ file: path.relative(SRC, file), source: fs.readFileSync(file, 'utf8') }))

// Platform functions that happen to fit the setter shape and are nobody's to
// declare.
const GLOBALS = new Set(['setTimeout', 'setInterval', 'setImmediate'])

describe('every component file is self-consistent', () => {
  it('found components to check', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  // The exact bug: a setter called but never declared, because a rename
  // missed a call site.
  it('calls no setter it does not declare or import', () => {
    const offenders = []
    for (const { file, source } of files) {
      const declared = new Set()
      // const [x, setX] = useState(...)
      for (const m of source.matchAll(/\[\s*\w+\s*,\s*(set[A-Z]\w*)\s*\]/g)) declared.add(m[1])
      // Locally defined, or destructured from a hook or props.
      for (const m of source.matchAll(/(?:function|const)\s+(set[A-Z]\w*)\b/g)) declared.add(m[1])
      for (const m of source.matchAll(/\{([^{}]*)\}\s*=\s*\w+/g)) {
        for (const part of m[1].split(',')) {
          const name = part.split(':').pop().trim()
          if (/^set[A-Z]\w*$/.test(name)) declared.add(name)
        }
      }
      // Imports, and props named in the component signature.
      for (const m of source.matchAll(/import\s+\{([^}]*)\}/g)) {
        for (const part of m[1].split(',')) {
          const name = part.split(' as ').pop().trim()
          if (/^set[A-Z]\w*$/.test(name)) declared.add(name)
        }
      }
      for (const m of source.matchAll(/function\s+\w+\s*\(\s*\{([^}]*)\}/g)) {
        for (const part of m[1].split(',')) {
          const name = part.split(/[:=]/)[0].trim()
          if (/^set[A-Z]\w*$/.test(name)) declared.add(name)
        }
      }

      for (const m of source.matchAll(/(?<![.\w])(set[A-Z]\w*)\s*\(/g)) {
        // Anything reached through an object — `props.setX`, `watchlist.setX` —
        // is not this file's to declare.
        if (!GLOBALS.has(m[1]) && !declared.has(m[1])) offenders.push(`${file}: ${m[1]}`)
      }
    }
    expect([...new Set(offenders)]).toEqual([])
  })

  // A setter that nothing calls is usually the other half of the same rename.
  it('declares no useState setter it never uses', () => {
    const offenders = []
    for (const { file, source } of files) {
      for (const m of source.matchAll(/\[\s*\w+\s*,\s*(set[A-Z]\w*)\s*\]/g)) {
        const uses = [...source.matchAll(new RegExp(`\\b${m[1]}\\b`, 'g'))].length
        // One occurrence is the declaration itself.
        if (uses < 2) offenders.push(`${file}: ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  // Every component that renders a route must actually be routed, and every
  // route must point at something that exists — a lazy import resolves at
  // navigation time, so a typo here is a blank page rather than a build error.
  it('lazily imports only pages that exist', () => {
    const app = files.find((f) => f.file === 'App.jsx').source
    const missing = []
    for (const m of app.matchAll(/import\('\.\/pages\/(\w+)'\)/g)) {
      if (!fs.existsSync(path.join(SRC, 'pages', `${m[1]}.jsx`))) missing.push(m[1])
    }
    expect(missing).toEqual([])
    // Every lazily-loaded page is reachable from a route.
    for (const m of app.matchAll(/const (\w+) = lazy\(/g)) {
      expect(app, `${m[1]} is loaded but never routed`).toMatch(new RegExp(`element=\\{<${m[1]} `))
    }
  })
})
