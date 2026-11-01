/*
 * Seed registry entries — the pattern every additional entry follows
 * (full set lands in ./data, see docs/04-component-registry.md §3).
 *
 * These two double as the EXEMPLARS for the v3 introspection schema:
 *  - View  → enum / boolean / string props + an Android-only platform-gated prop
 *  - Text  → text-children prop + real typography behavior props + a callback
 *            prop (shown as code-controlled in the inspector, never faked)
 */
import type { RegistryEntry } from './types'

export const VIEW_ENTRY: RegistryEntry = {
  id: 'view',
  name: 'View',
  icon: 'ph:square',
  category: 'layout',
  description: 'The core layout container. Children can be placed, moved and resized freely.',
  children: 'any',
  insert: { width: 160, height: 120 },
  props: [
    {
      key: 'pointerEvents',
      label: 'Pointer events',
      type: 'enum',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'box-none', label: 'Box none' },
        { value: 'box-only', label: 'Box only' },
        { value: 'none', label: 'None' }
      ],
      default: 'auto',
      section: 'Behavior',
      description: 'Whether the container and its children can receive touches.'
    },
    {
      key: 'accessible',
      label: 'Accessible',
      type: 'boolean',
      default: false,
      section: 'Accessibility',
      description: 'Groups children into a single accessibility element.'
    },
    {
      key: 'accessibilityLabel',
      label: 'Accessibility label',
      type: 'string',
      placeholder: 'Read by screen readers',
      section: 'Accessibility'
    },
    {
      key: 'collapsable',
      label: 'Collapsable',
      type: 'boolean',
      default: true,
      platform: ['android'],
      advanced: true,
      section: 'Behavior',
      description: 'Android-only optimization hint: the view may be removed from the native hierarchy when unused.'
    }
  ],
  styleSections: ['layout', 'spacing', 'appearance', 'effects'],
  codegen: { import: "import { View } from 'react-native'", component: 'View' },
  previewNote: 'Rendered live by react-native-web.'
}

export const TEXT_ENTRY: RegistryEntry = {
  id: 'text',
  name: 'Text',
  icon: 'ph:text-aa',
  category: 'content',
  description: 'A text label. Height is content-sized by default.',
  children: 'none',
  insert: { width: 220 },
  props: [
    { key: 'content', label: 'Text', type: 'text', default: 'Text', section: 'Content' },
    {
      key: 'numberOfLines',
      label: 'Max lines',
      type: 'number',
      default: 0,
      min: 0,
      step: 1,
      section: 'Behavior',
      description: 'Truncates the text after this many lines (0 = unlimited).'
    },
    {
      key: 'ellipsizeMode',
      label: 'Truncate from',
      type: 'enum',
      options: [
        { value: 'tail', label: 'End (tail)' },
        { value: 'head', label: 'Start (head)' },
        { value: 'middle', label: 'Middle' },
        { value: 'clip', label: 'Clip' }
      ],
      default: 'tail',
      section: 'Behavior',
      description: 'Where the ellipsis appears when the text is truncated.'
    },
    {
      key: 'adjustsFontSizeToFit',
      label: 'Shrink to fit',
      type: 'boolean',
      default: false,
      section: 'Behavior',
      description: 'Scale the font down so the text fits the available width.'
    },
    {
      key: 'allowFontScaling',
      label: 'Follow system font size',
      type: 'boolean',
      default: true,
      section: 'Behavior'
    },
    {
      key: 'onPress',
      label: 'On press',
      type: 'callback',
      section: 'Behavior',
      description: 'Configured in code — wire this to a Flow or handler in the generated project.'
    }
  ],
  styleSections: ['typography', 'layout', 'spacing', 'appearance', 'effects'],
  codegen: { import: "import { Text } from 'react-native'", component: 'Text' },
  previewNote: 'Rendered live by react-native-web.'
}
