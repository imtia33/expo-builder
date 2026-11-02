/*
 * button · docs/04 §3.5 — THE implementation-variant showcase for Phase 2
 * ("Button implementation choice at insertion").
 *
 * One logical button, four real implementations, all wired to the SAME
 * interaction semantics (onPress stays code-controlled — no duplicate event
 * engines; the flow system will own wiring later):
 *
 *   pressable          (default) Pressable composite: box + centered label.
 *   touchableopacity   TouchableOpacity — dims on press (activeOpacity).
 *   touchablehighlight TouchableHighlight — underlayColor shows while pressed.
 *   rnbutton           core RN <Button> — the system-styled look. RNW renders
 *                      it on the canvas; on device it is the platform button.
 *
 * Entry-level props are intentionally EMPTY (the image pattern): each variant
 * carries its own surface, so switching never leaks irrelevant props (an RN
 * Button has no variant/hitSlop/typography). setNodeImpl keeps the keys that
 * exist in BOTH variants (title, disabled), so switching mid-design is safe.
 *
 * Variant presets (primary/secondary/ghost) are shared by the preview and the
 * code emitter (BUTTON_VARIANT_BASE in both files); node style always wins.
 * The RN-Button variant ignores them — it renders the platform style.
 */
import type { ComponentImplementation, RegistryEntry } from '../types'

export const BUTTON_IMPLEMENTATIONS: ComponentImplementation[] = [
  {
    id: 'pressable',
    label: 'Pressable',
    kind: 'native',
    description: 'Pressable + centered label. The default composite — fully styleable, ripple on Android.',
    props: [
      { key: 'title', label: 'Title', type: 'text', default: 'Button', section: 'Content' },
      {
        key: 'variant',
        label: 'Variant',
        type: 'enum',
        options: [
          { value: 'primary', label: 'Primary' },
          { value: 'secondary', label: 'Secondary' },
          { value: 'ghost', label: 'Ghost' }
        ],
        default: 'primary',
        section: 'Content'
      },
      { key: 'disabled', label: 'Disabled', type: 'boolean', default: false, section: 'Behavior' },
      {
        key: 'hitSlop',
        label: 'Hit slop',
        type: 'number',
        default: 0,
        min: 0,
        max: 60,
        step: 1,
        unit: 'dp',
        section: 'Behavior',
        description: 'Extends the touch target beyond the visual bounds — great for small buttons.'
      },
      {
        key: 'android_ripple',
        label: 'Ripple color (Android)',
        type: 'color',
        platform: ['android'],
        section: 'Behavior',
        description: 'Material ripple on press — emitted as android_ripple={{ color }}. Applies on device; not shown in the canvas preview.'
      }
    ],
    codegen: { import: "import { Pressable } from 'react-native'", component: 'Pressable' }
  },
  {
    id: 'touchableopacity',
    label: 'TouchableOpacity',
    kind: 'native',
    description: 'TouchableOpacity — the label area dims while pressed (activeOpacity). Same composite look as Pressable.',
    props: [
      { key: 'title', label: 'Title', type: 'text', default: 'Button', section: 'Content' },
      {
        key: 'variant',
        label: 'Variant',
        type: 'enum',
        options: [
          { value: 'primary', label: 'Primary' },
          { value: 'secondary', label: 'Secondary' },
          { value: 'ghost', label: 'Ghost' }
        ],
        default: 'primary',
        section: 'Content'
      },
      { key: 'disabled', label: 'Disabled', type: 'boolean', default: false, section: 'Behavior' },
      {
        key: 'activeOpacity',
        label: 'Active opacity',
        type: 'number',
        default: 0.2,
        min: 0,
        max: 1,
        step: 0.05,
        section: 'Behavior',
        description: 'How much the button dims while pressed. React Native documents 0.2 as the default.'
      },
      {
        key: 'hitSlop',
        label: 'Hit slop',
        type: 'number',
        default: 0,
        min: 0,
        max: 60,
        step: 1,
        unit: 'dp',
        section: 'Behavior',
        description: 'Extends the touch target beyond the visual bounds.'
      }
    ],
    codegen: { import: "import { TouchableOpacity } from 'react-native'", component: 'TouchableOpacity' }
  },
  {
    id: 'touchablehighlight',
    label: 'TouchableHighlight',
    kind: 'native',
    description: 'TouchableHighlight — the underlay color shows behind the label while pressed. Great for list rows and cards.',
    props: [
      { key: 'title', label: 'Title', type: 'text', default: 'Button', section: 'Content' },
      {
        key: 'variant',
        label: 'Variant',
        type: 'enum',
        options: [
          { value: 'primary', label: 'Primary' },
          { value: 'secondary', label: 'Secondary' },
          { value: 'ghost', label: 'Ghost' }
        ],
        default: 'primary',
        section: 'Content'
      },
      { key: 'disabled', label: 'Disabled', type: 'boolean', default: false, section: 'Behavior' },
      {
        key: 'activeOpacity',
        label: 'Active opacity',
        type: 'number',
        default: 0.2,
        min: 0,
        max: 1,
        step: 0.05,
        section: 'Behavior',
        description: 'Opacity while pressed, before the underlay takes over. React Native documents 0.2 as the default.'
      },
      {
        key: 'underlayColor',
        label: 'Underlay color',
        type: 'color',
        default: '#000000',
        section: 'Behavior',
        description: 'Shown behind the children while pressed. React Native documents black as the default.'
      },
      {
        key: 'hitSlop',
        label: 'Hit slop',
        type: 'number',
        default: 0,
        min: 0,
        max: 60,
        step: 1,
        unit: 'dp',
        section: 'Behavior',
        description: 'Extends the touch target beyond the visual bounds.'
      }
    ],
    codegen: { import: "import { TouchableHighlight } from 'react-native'", component: 'TouchableHighlight' }
  },
  {
    id: 'rnbutton',
    label: 'RN Button',
    kind: 'native',
    description:
      "Core React Native <Button> — the platform-styled button. No custom typography or box styling (it renders the OS look); `color` tints it. Generated code includes a placeholder onPress you wire to your logic — RN's types require it.",
    props: [
      { key: 'title', label: 'Title', type: 'text', default: 'Button', section: 'Content' },
      {
        key: 'color',
        label: 'Color',
        type: 'color',
        section: 'Content',
        description: "Tints the button. Unset = the platform default (iOS blue / Android's theme color)."
      },
      { key: 'disabled', label: 'Disabled', type: 'boolean', default: false, section: 'Behavior' }
    ],
    codegen: { import: "import { Button } from 'react-native'", component: 'Button' }
  }
]

export const BUTTON_ENTRY: RegistryEntry = {
  id: 'button',
  name: 'Button',
  icon: 'ph:cursor-click',
  category: 'input',
  description: 'A pressable button. Choose the implementation at insertion (or later): Pressable, TouchableOpacity, TouchableHighlight, or the core RN Button.',
  children: 'none',
  insert: { width: 140, height: 48 },
  props: [],
  implementations: BUTTON_IMPLEMENTATIONS,
  styleSections: ['layout', 'spacing', 'appearance', 'typography', 'effects'],
  codegen: { import: "import { Pressable } from 'react-native'", component: 'Pressable', emitter: 'button' },
  previewNote:
    'Composite on canvas: the active implementation renders its real react-native-web component. Typography style keys apply to the label (RN Button renders the platform look instead).'
}
