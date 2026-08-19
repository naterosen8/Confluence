import { describe, it, expect } from 'vitest'
import { shortcutFor, isTyping, moveCursor, SHORTCUTS } from './shortcuts.js'

const ev = (key, over = {}) => ({ key, target: { tagName: 'BODY' }, ...over })
const inInput = (key) => ev(key, { target: { tagName: 'INPUT' } })

describe('isTyping', () => {
  it('recognises the fields a keystroke belongs to', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) expect(isTyping({ tagName })).toBe(true)
    expect(isTyping({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('does not claim ordinary elements', () => {
    expect(isTyping({ tagName: 'BODY' })).toBe(false)
    expect(isTyping({ tagName: 'BUTTON' })).toBe(false)
    expect(isTyping(null)).toBe(false)
  })
})

describe('shortcutFor', () => {
  it('maps the navigation keys', () => {
    expect(shortcutFor(ev('j'))).toBe('next')
    expect(shortcutFor(ev('ArrowDown'))).toBe('next')
    expect(shortcutFor(ev('k'))).toBe('prev')
    expect(shortcutFor(ev('ArrowUp'))).toBe('prev')
    expect(shortcutFor(ev('Enter'))).toBe('open')
    expect(shortcutFor(ev('s'))).toBe('star')
    expect(shortcutFor(ev('/'))).toBe('search')
    expect(shortcutFor(ev('?'))).toBe('help')
  })

  it('distinguishes g from G rather than lowercasing the world', () => {
    expect(shortcutFor(ev('g'))).toBe('top')
    expect(shortcutFor(ev('G'))).toBe('bottom')
  })

  // The rule the module exists for: a filter box that eats the "j" out of
  // "JPM" and jumps the cursor is worse than no shortcuts at all.
  it('fires nothing while someone is typing', () => {
    for (const key of ['j', 'k', 's', '/', 'g', 'G', '?', 'Enter']) expect(shortcutFor(inInput(key))).toBeNull()
  })

  it('still lets Escape out of a field, because that is how you leave one', () => {
    expect(shortcutFor(inInput('Escape'))).toBe('blur')
    expect(shortcutFor(ev('Escape'))).toBe('clear')
  })

  it('leaves modified keystrokes to the browser', () => {
    expect(shortcutFor(ev('j', { metaKey: true }))).toBeNull()
    expect(shortcutFor(ev('s', { ctrlKey: true }))).toBeNull()
    expect(shortcutFor(ev('ArrowDown', { altKey: true }))).toBeNull()
  })

  it('ignores keys it has no use for', () => {
    expect(shortcutFor(ev('q'))).toBeNull()
    expect(shortcutFor(ev('F5'))).toBeNull()
  })

  it('every documented shortcut resolves to its action', () => {
    for (const s of SHORTCUTS) {
      for (const key of s.keys) {
        // Escape's meaning depends on context and is asserted separately.
        if (key === 'Escape') continue
        expect(shortcutFor(ev(key))).toBe(s.action)
      }
    }
  })
})

describe('moveCursor', () => {
  it('starts at the top going down and at the bottom going up', () => {
    expect(moveCursor(null, 'next', 5)).toBe(0)
    expect(moveCursor(null, 'prev', 5)).toBe(4)
  })

  it('steps one row at a time', () => {
    expect(moveCursor(2, 'next', 5)).toBe(3)
    expect(moveCursor(2, 'prev', 5)).toBe(1)
  })

  // Clamped, not wrapped: in eighty-nine rows a silent jump to the other end
  // is indistinguishable from not having moved.
  it('stops at the ends rather than wrapping', () => {
    expect(moveCursor(4, 'next', 5)).toBe(4)
    expect(moveCursor(0, 'prev', 5)).toBe(0)
  })

  it('jumps to either end', () => {
    expect(moveCursor(3, 'top', 5)).toBe(0)
    expect(moveCursor(3, 'bottom', 5)).toBe(4)
  })

  it('has nowhere to go in an empty table', () => {
    for (const action of ['next', 'prev', 'top', 'bottom']) expect(moveCursor(null, action, 0)).toBeNull()
  })

  it('leaves the cursor alone for actions that are not movement', () => {
    expect(moveCursor(2, 'star', 5)).toBe(2)
    expect(moveCursor(2, 'open', 5)).toBe(2)
  })
})
