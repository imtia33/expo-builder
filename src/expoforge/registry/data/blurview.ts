/*
 * blurview · docs/04 §3.2 (line 379) — expo-blur.
 *
 * Deviation from doc 04: the doc's category is "Overlay", which the registry
 * schema has no enum member for — blurview lands in 'layout' (it is a
 * container that overlays content). The Android BlurTargetView wiring is
 * codegen-side (emitter 'blurview' auto-wires the nearest ancestor content
 * container).
 *
 * v3 rework: adds `experimentalBlurMethod` (SDK 52+) — the opt-in real blur
 * path for Android, gated to android and marked advanced.
 *
 * Preview platform variants (docs/04 line 379):
 *  - iOS canvas: CSS backdrop-filter blur + translucent tint — the same
 *    approach expo-blur's own web implementation uses.
 *  - Android canvas: plain semi-transparent View — the documented fallback
 *    for devices below API 31 (experimentalBlurMethod is device-only).
 */
import type { RegistryEntry } from '../types'

export const BLURVIEW_ENTRY: RegistryEntry = {
  id: 'blurview',
  name: 'Blur View',
  icon: 'ph:drop-half-bottom',
  category: 'layout',
  description: 'expo-blur frosted glass. iOS: true blur; Android: semi-transparent fallback.',
  children: 'any',
  insert: { width: 240, height: 140 },
  props: [
    { key: 'intensity', label: 'Intensity', type: 'number', default: 50, min: 0, max: 100, step: 1, section: 'Content' },
    {
      key: 'tint',
      label: 'Tint',
      type: 'enum',
      options: [
        { value: 'system', label: 'System' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' }
      ],
      default: 'system',
      section: 'Content'
    },
    {
      key: 'experimentalBlurMethod',
      label: 'Blur method (Android)',
      type: 'enum',
      options: [
        { value: 'none', label: 'None (fallback)' },
        { value: 'dime', label: 'Dime' }
      ],
      default: 'none',
      platform: ['android'],
      advanced: true,
      section: 'Content',
      description: 'Android-only blur method for expo-blur (SDK 52+). Applies on device; not shown in the canvas preview.'
    }
  ],
  styleSections: ['layout', 'appearance'],
  codegen: { import: "import { BlurView } from 'expo-blur'", component: 'BlurView', emitter: 'blurview' },
  previewNote:
    'iOS canvas: CSS backdrop-filter blur + translucent tint (expo-blur web approach). Android canvas: semi-transparent fallback view (pre-API-31 device behavior).'
}
