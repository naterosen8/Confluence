// Keyboard control for the screener.
//
// Eighty-nine rows is past the point where a mouse is the right instrument.
// The actual working loop on a screener is: narrow it, walk the survivors, open
// the ones worth reading, star the ones worth keeping — and every step of that
// currently requires finding a small target with a pointer. Anyone who screens
// for a living does this with their hands on the keyboard.
//
// Kept as a pure mapping from event to intent so the rules can be tested
// without a browser, and so the one rule that actually matters is stated in
// one place rather than checked ad hoc at four call sites: a shortcut must
// never fire while someone is typing. A screener whose filter box eats the "j"
// out of "JPM" and jumps the cursor instead is worse than one with no
// shortcuts at all.

export const SHORTCUTS = [
  { keys: ['/'], action: 'search', label: 'Focus the filter box' },
  { keys: ['j', 'ArrowDown'], action: 'next', label: 'Next row' },
  { keys: ['k', 'ArrowUp'], action: 'prev', label: 'Previous row' },
  { keys: ['Enter'], action: 'open', label: 'Open the highlighted ticker' },
  { keys: ['s'], action: 'star', label: 'Star or unstar it' },
  { keys: ['g'], action: 'top', label: 'Jump to the first row' },
  { keys: ['G'], action: 'bottom', label: 'Jump to the last row' },
  { keys: ['Escape'], action: 'clear', label: 'Drop the highlight, or leave the filter box' },
  { keys: ['?'], action: 'help', label: 'Show this list' },
]

// Any field that accepts text, plus anything explicitly made editable. Checked
// against the event's own target rather than document.activeElement so the
// answer describes the keystroke that happened, not whatever has focus by the
// time it is handled.
export function isTyping(target) {
  if (!target) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable === true
}

export function shortcutFor(event) {
  // A modifier means the keystroke belongs to the browser or the operating
  // system. Cmd-K, Ctrl-F and Alt-Left are not ours to take.
  if (event.metaKey || event.ctrlKey || event.altKey) return null

  const typing = isTyping(event.target)
  if (typing) {
    // Escape is the one key that has to work inside the filter box, because it
    // is how someone gets back out of it.
    return event.key === 'Escape' ? 'blur' : null
  }

  for (const s of SHORTCUTS) if (s.keys.includes(event.key)) return s.action
  return null
}

// Where the cursor lands, given where it was and what was pressed.
//
// Returns an index into the visible rows, clamped rather than wrapped: wrapping
// from the last row to the first in a list of eighty-nine is disorienting, and
// there is no way to tell it apart from having not moved.
export function moveCursor(current, action, count) {
  if (!count) return null
  switch (action) {
    case 'next':
      return current == null ? 0 : Math.min(count - 1, current + 1)
    case 'prev':
      return current == null ? count - 1 : Math.max(0, current - 1)
    case 'top':
      return 0
    case 'bottom':
      return count - 1
    default:
      return current
  }
}
