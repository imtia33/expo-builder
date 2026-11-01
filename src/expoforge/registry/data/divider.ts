/*
 * divider · docs/04 §3.1 (line 360) — ExpoForge composite. Codegen emitter
 * 'divider' emits a hairline plain View:
 *   horizontal: <View style={{ width: length, height: thickness, backgroundColor: color }} />
 *   vertical:   <View style={{ width: thickness, height: length, backgroundColor: color }} />
 * The preview applies the same prop-derived base style; node style overrides.
 */
import type { RegistryEntry } from '../types'

export const DIVIDER_ENTRY: RegistryEntry = {
  id: 'divider',
  name: 'Divider',
  icon: 'ph:minus',
  category: 'layout',
  description: 'A hairline rule (composite — emits a plain View, no dependency).',
  children: 'none',
  insert: { width: 280, height: 2 },
  props: [
    {
      key: 'axis',
      label: 'Axis',
      type: 'enum',
      options: [
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'vertical', label: 'Vertical' }
      ],
      default: 'horizontal',
      section: 'Content'
    },
    { key: 'length', label: 'Length', type: 'string', default: '100%', section: 'Content' },
    { key: 'thickness', label: 'Thickness', type: 'number', default: 1, min: 1, step: 1, section: 'Content' },
    { key: 'color', label: 'Color', type: 'color', default: '#E5E7EB', section: 'Appearance' }
  ],
  styleSections: ['layout', 'spacing', 'appearance'],
  codegen: { import: "import { View } from 'react-native'", component: 'View', emitter: 'divider' },
  previewNote: 'Composite: axis/length/thickness/color compile to width/height/backgroundColor on a plain View; node style overrides.'
}
