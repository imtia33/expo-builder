/*
 * button · docs/04 §3.5 (line 637) — Pressable flavor (default). ExpoForge
 * composite: codegen emitter 'button' renders <Pressable><Text>{title}</Text></Pressable>.
 *
 * v3 rework: the registry now also carries the two Pressable behavior props the
 * emitter already understands — hitSlop (number → hitSlop={n}) and
 * android_ripple (color string → android_ripple={{ color }}). The remaining
 * doc-04 flavor props (pressedOpacity, pressedScale, role) stay emitter-side
 * concerns for now.
 *
 * Variant presets are shared with the live preview — see
 * src/expoforge/preview/renderer.tsx BUTTON_VARIANT_BASE:
 *   primary   box #111827 / label #FFFFFF   secondary box #F3F4F6 / label #111827
 *   ghost     transparent / label #111827 — all with radius 8, centered label.
 * Node style always wins over the preset.
 */
import type { RegistryEntry } from '../types'

export const BUTTON_ENTRY: RegistryEntry = {
  id: 'button',
  name: 'Button',
  icon: 'ph:cursor-click',
  category: 'input',
  description: 'A pressable button: Pressable + centered label, fully styleable with inline styles.',
  children: 'none',
  insert: { width: 140, height: 48 },
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
  styleSections: ['layout', 'spacing', 'appearance', 'typography', 'effects'],
  codegen: { import: "import { Pressable } from 'react-native'", component: 'Pressable', emitter: 'button' },
  previewNote:
    'Composite: Pressable + inner Text. Typography style keys apply to the label. Variant presets live in preview/renderer.tsx BUTTON_VARIANT_BASE; node style overrides them.'
}
