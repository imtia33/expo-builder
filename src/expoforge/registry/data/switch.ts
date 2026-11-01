/*
 * switch · docs/04 §3.5 (line 677) — RN core Switch. Fixed system size 51×31
 * (iOS UISwitch metrics); colors are PROPS on Switch, not styles.
 *
 * Deviation from doc 04: RN's `trackColor` prop is an OBJECT
 * ({ false, true }) — the flat PropField schema cannot express that, so the
 * registry splits it into `trackColorTrue` / `trackColorFalse`. The preview
 * composes trackColor={{ true, false }}; codegen must do the same mapping.
 * `ios_backgroundColor` is kept (device-only, no web equivalent).
 */
import type { RegistryEntry } from '../types'

export const SWITCH_ENTRY: RegistryEntry = {
  id: 'switch',
  name: 'Switch',
  icon: 'ph:toggle-right',
  category: 'input',
  description: 'The native toggle (UISwitch / Material). Fixed 51×31 — colors are props, not styles.',
  children: 'none',
  insert: { width: 51, height: 31 },
  props: [
    { key: 'value', label: 'On', type: 'boolean', default: false, section: 'Content' },
    { key: 'disabled', label: 'Disabled', type: 'boolean', default: false, section: 'Behavior' },
    { key: 'trackColorTrue', label: 'Track · on', type: 'color', section: 'Appearance' },
    { key: 'trackColorFalse', label: 'Track · off', type: 'color', section: 'Appearance' },
    { key: 'thumbColor', label: 'Thumb', type: 'color', section: 'Appearance' },
    { key: 'ios_backgroundColor', label: 'iOS background', type: 'color', section: 'Appearance' }
  ],
  styleSections: ['layout', 'spacing'],
  codegen: { import: "import { Switch } from 'react-native'", component: 'Switch' },
  previewNote:
    'trackColorTrue/trackColorFalse compile to RN trackColor={{ true, false }}. ios_backgroundColor is device-only. Web canvas toggle is visually divergent from both natives.'
}
