import fs from 'node:fs'
import path from 'node:path'

// Reads the committed per-symbol bar files the way the sync and the browser
// both do. Tests assert against the data the site actually ships, not a
// fixture that can drift from it.
export function readCommittedBars() {
  const dir = path.resolve(new URL('../../public/bars', import.meta.url).pathname)
  const out = {}
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    if (parsed?.symbol && Array.isArray(parsed.bars)) out[parsed.symbol] = parsed.bars
  }
  return out
}
