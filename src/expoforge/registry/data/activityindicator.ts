/*
 * activityindicator · docs/04 §3.6 (line 768) — RN core ActivityIndicator.
 * `color` is a PROP (not a style) on this component; the registry default
 * (#8E8E93, iOS system gray) keeps preview and codegen consistent.
 */
import type { RegistryEntry } from '../types'

export const ACTIVITYINDICATOR_ENTRY: RegistryEntry = {
  id: 'activityindicator',
  name: 'Activity Indicator',
  icon: 'ph:spinner-gap',
  category: 'feedback',
  description: 'The native spinner. Color is a prop, not a style.',
  children: 'none',
  insert: { width: 40, height: 40 },
  props: [
    { key: 'animating', label: 'Animating', type: 'boolean', default: true, section: 'Behavior' },
    {
      key: 'size',
      label: 'Size',
      type: 'enum',
      options: [
        { value: 'small', label: 'Small' },
        { value: 'large', label: 'Large' }
      ],
      default: 'small',
      section: 'Appearance'
    },
    { key: 'color', label: 'Color', type: 'color', default: '#8E8E93', section: 'Appearance' },
    {
      key: 'hidesWhenStopped',
      label: 'Hide when stopped (iOS)',
      type: 'boolean',
      default: true,
      section: 'Behavior',
      description: 'Removes the spinner from the hierarchy when animating is false (iOS device only).'
    }
  ],
  styleSections: ['layout', 'spacing'],
  codegen: { import: "import { ActivityIndicator } from 'react-native'", component: 'ActivityIndicator' },
  previewNote: 'Rendered live by react-native-web (CSS spinner).'
}
