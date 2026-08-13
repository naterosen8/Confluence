import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// The sync scripts run under plain Node, which — unlike Vite — requires an
// explicit file extension on every relative import. Vite resolves both, so a
// missing extension anywhere in a script's transitive graph builds cleanly,
// tests cleanly, and then fails only in CI at the moment the daily job runs.
//
// That has now happened twice: adding `import { leanFor } from './lean'` to
// indicators.js broke the market-data sync, because the script imports
// computeSignals from it. Both times the break was invisible locally.
//
// This walks the real import graph of each script and asserts every relative
// specifier carries an extension.

const ROOT = process.cwd()
const SCRIPTS = ['scripts/sync-market-data.mjs', 'scripts/sync-fundamentals.mjs']
const RELATIVE_IMPORT = /(?:^|\n)\s*import\s+(?:[^'"]*?\s+from\s+)?['"](\.[^'"]*)['"]/g

function collect(entry, seen = new Map()) {
  const abs = path.resolve(ROOT, entry)
  if (seen.has(abs)) return seen
  const src = fs.readFileSync(abs, 'utf8')
  const offenders = []
  const children = []

  for (const m of src.matchAll(RELATIVE_IMPORT)) {
    const spec = m[1]
    if (!/\.(js|mjs|cjs|json)$/.test(spec)) {
      offenders.push(spec)
      continue
    }
    children.push(path.resolve(path.dirname(abs), spec))
  }
  seen.set(abs, offenders)
  for (const c of children) {
    if (fs.existsSync(c)) collect(path.relative(ROOT, c), seen)
  }
  return seen
}

describe('scripts run under plain Node, so their whole import graph needs extensions', () => {
  for (const script of SCRIPTS) {
    it(`${script} and everything it imports use explicit extensions`, () => {
      const graph = collect(script)
      const bad = []
      for (const [file, offenders] of graph) {
        for (const spec of offenders) bad.push(`${path.relative(ROOT, file)} imports "${spec}" (no extension)`)
      }
      if (bad.length) console.log('\nExtensionless relative imports reachable from ' + script + ':\n  ' + bad.join('\n  '))
      expect(bad).toEqual([])
    })

    it(`${script} actually resolves under Node`, async () => {
      // Import the leaf modules the script depends on rather than the script
      // itself, which would execute a network sync on import.
      const graph = collect(script)
      const files = [...graph.keys()].filter((f) => f !== path.resolve(ROOT, script))
      for (const f of files) {
        await expect(import(/* @vite-ignore */ f)).resolves.toBeDefined()
      }
      expect(files.length).toBeGreaterThan(0)
    })
  }
})

// The guard above walks only the sync's transitive imports, which is why
// confluence.js, leverageStudy.js, shareCard.js, trades.js and useMarketData.js
// all carried extensionless imports undetected — none of them was reachable
// from the script. They broke the moment anything new imported them. Every
// module in lib is checked now, whether the sync reaches it today or not.
describe('every lib module is importable by plain Node', () => {
  it('has no extensionless relative import anywhere in src/lib', () => {
    const dir = path.resolve(new URL('.', import.meta.url).pathname)
    const offenders = []
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.js') || file.endsWith('.test.js')) continue
      const source = fs.readFileSync(path.join(dir, file), 'utf8')
      for (const m of source.matchAll(/from '(\.\/[^']+)'/g)) {
        if (!m[1].endsWith('.js')) offenders.push(`${file} imports "${m[1]}"`)
      }
    }
    expect(offenders).toEqual([])
  })
})
