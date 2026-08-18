// Light and dark, and the difference between "I chose dark" and "my machine
// is dark".
//
// Those are not the same state and collapsing them is the usual bug: someone
// on a system that switches at sunset wants the site to switch with it, and
// someone who picked light at noon wants it to stay light at midnight. So the
// stored value has three states and the absence of a choice is one of them.

const KEY = 'confluence.theme'

export const THEMES = ['system', 'light', 'dark']

export function readTheme() {
  try {
    const raw = localStorage.getItem(KEY)
    return THEMES.includes(raw) ? raw : 'system'
  } catch {
    // Storage throws in Safari private mode; following the system is the
    // right fallback because it is what the visitor's machine already says.
    return 'system'
  }
}

export function writeTheme(theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    /* preference not persistable; it still applies for this visit */
  }
}

// What to actually paint. `system` resolves against the media query at call
// time rather than being frozen at load, so a machine that flips at sunset
// flips the page with it.
export function resolveTheme(theme = readTheme(), matcher = typeof window !== 'undefined' ? window.matchMedia : null) {
  if (theme === 'light' || theme === 'dark') return theme
  if (!matcher) return 'dark'
  return matcher('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

// Applied to the root element rather than to body, so the background behind
// an over-scroll bounce is right too.
export function applyTheme(resolved, root = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!root) return
  root.setAttribute('data-theme', resolved)
  root.style.colorScheme = resolved
}

// A fixed three-step cycle rather than "toggle to the opposite, then system".
//
// The clever version could not reach explicit dark on a dark machine — from
// system it resolved to dark and jumped to light, and from light it went back
// to system, so the control was a two-state toggle wearing a three-state
// label. Someone on a dark machine could never pin dark and stop the page
// changing under them at sunrise. Predictable beats clever on a control whose
// current state is written on its face.
export function nextTheme(current) {
  const i = THEMES.indexOf(current)
  return THEMES[(i === -1 ? 0 : i + 1) % THEMES.length]
}

export const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' }
