/*
 * Shortcut display formatting for the builder shell.
 * The platform test mirrors tinykeys' own `$mod` resolution (Meta on Apple platforms,
 * Control everywhere else), so the printed labels always match the keys that fire.
 */

const MAC_PATTERN = /Mac|iPod|iPhone|iPad/

/** tinykeys' platform test: whether `$mod` is the Command key or the Control key. */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return MAC_PATTERN.test(navigator.platform)
}

const MAC_SYMBOLS: Record<string, string> = {
  $mod: '⌘',
  Meta: '⌘',
  Control: '⌃',
  Shift: '⇧',
  Alt: '⌥',
  Backspace: '⌫',
  Enter: '↵',
  Escape: 'Esc',
  Tab: '⇥'
}

/** Physical-key (KeyboardEvent.code) names rendered as the glyphs they type. */
const CODE_DISPLAY: Record<string, string> = {
  Backslash: '\\',
  Quote: "'",
  Comma: ',',
  Minus: '-',
  Equal: '=',
  Period: '.',
  Slash: '/',
  BracketLeft: '[',
  BracketRight: ']',
  Digit0: '0',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9'
}

/**
 * Formats a `"$mod+Shift+Z"`-style combo for display: `⌘⇧Z` on Apple platforms,
 * `Ctrl+Shift+Z` everywhere else. Bare labels ("0–9") pass through untouched.
 */
export function formatShortcut(combo: string): string {
  const parts = combo.split('+')
  if (isMacPlatform()) {
    return parts.map((part) => MAC_SYMBOLS[part] ?? CODE_DISPLAY[part] ?? part).join('')
  }
  return parts
    .map((part) => (part === '$mod' ? 'Ctrl' : (CODE_DISPLAY[part] ?? part)))
    .join('+')
}
