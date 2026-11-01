/*
 * Iconify (Phosphor set) → phosphor-react-native component mapping.
 *
 * Tab icons in the model are stored as Iconify names from the Phosphor set
 * ('ph:house' — see docs/04 §3.7 and the store's DEFAULT_TAB_ICONS). Generated
 * code uses the real Phosphor React Native package 'phosphor-react-native'
 * (verified on npm: latest 3.0.6, exports one PascalCase component per icon;
 * the '@phosphor-icons/react-native' scoped name does NOT exist on the
 * registry). Component names are the PascalCase of the Phosphor icon name
 * (`import { House } from 'phosphor-react-native'`). The alias table below
 * carries the handful of iconify names whose Phosphor component differs from
 * plain kebab→Pascal (home → House; Phosphor v2 renamed the icon).
 *
 * Dependency note: phosphor-react-native peers on react-native-svg — exported
 * projects must include both.
 */

const PHOSPHOR_ALIASES: Record<string, string> = {
  home: 'House', // Phosphor v2 renamed home → house; iconify lists both
}

/**
 * Map an Iconify name from the Phosphor set to the exported component name of
 * phosphor-react-native. Returns '' when nothing sensible can be derived (the
 * caller then skips the tabBarIcon).
 *
 *   iconifyToPhosphorReact('ph:house')            → 'House'
 *   iconifyToPhosphorReact('ph:gear-six')         → 'GearSix'
 *   iconifyToPhosphorReact('ph:calendar-blank')   → 'CalendarBlank'
 *   iconifyToPhosphorReact('ph:home')             → 'House' (alias)
 *   iconifyToPhosphorReact('ph:some-future-icon') → 'SomeFutureIcon' (mechanical)
 */
export function iconifyToPhosphorReact(name: string): string {
  const raw = name.trim().replace(/^ph:/, '')
  if (!raw) return ''
  const alias = PHOSPHOR_ALIASES[raw]
  if (alias) return alias
  return raw
    .split('-')
    .filter((seg) => seg.length > 0)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('')
}
