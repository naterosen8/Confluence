import { useCallback, useEffect, useState } from 'react'
import { readTheme, writeTheme, resolveTheme, applyTheme, nextTheme, THEME_LABELS } from '../lib/theme'

const GLYPH = { system: '◐', light: '☀', dark: '☾' }

export default function ThemeToggle() {
  const [theme, setTheme] = useState(readTheme)

  useEffect(() => {
    applyTheme(resolveTheme(theme))
  }, [theme])

  // While following the system, the page has to follow it live — a machine
  // that switches at sunset should take the site with it without a reload.
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => applyTheme(resolveTheme('system'))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const cycle = useCallback(() => {
    const next = nextTheme(theme)
    writeTheme(next)
    setTheme(next)
  }, [theme])

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      // The name says the current state and what pressing it does, because
      // the glyph alone tells a screen reader nothing.
      aria-label={`Theme: ${THEME_LABELS[theme]}. Switch to ${THEME_LABELS[nextTheme(theme)]}.`}
      title={`Theme: ${THEME_LABELS[theme]}`}
    >
      <span aria-hidden="true">{GLYPH[theme]}</span>
      <span className="theme-toggle-label">{THEME_LABELS[theme]}</span>
    </button>
  )
}
