/*
 * lineargradient · docs/04 §3.1 (line 324) — expo-linear-gradient.
 * Codegen emitter 'lineargradient' emits:
 *   <LinearGradient colors={[startColor, endColor]} start={…} end={…} />
 * with start/end points derived from `angle` (0° = left→right, 90° = top→bottom,
 * matching CSS linear-gradient() angles).
 *
 * Deviations from doc 04: the expo API takes `colors: color[]`, `locations:
 * number[]` and `start`/`end` {x,y} points — none expressible as flat
 * PropFields, so the registry exposes startColor / endColor / angle and the
 * emitter composes the real API. `dither` (Android) is emitter-side.
 */
import type { RegistryEntry } from '../types'

export const LINEARGRADIENT_ENTRY: RegistryEntry = {
  id: 'lineargradient',
  name: 'Linear Gradient',
  icon: 'ph:gradient',
  category: 'layout',
  description: 'An expo-linear-gradient surface. A container — children render on top.',
  children: 'any',
  insert: { width: 260, height: 160 },
  props: [
    { key: 'startColor', label: 'Start color', type: 'color', default: '#A855F7', section: 'Content' },
    { key: 'endColor', label: 'End color', type: 'color', default: '#EC4899', section: 'Content' },
    { key: 'angle', label: 'Angle (°)', type: 'number', default: 45, min: 0, max: 360, step: 1, section: 'Content' }
  ],
  styleSections: ['layout', 'spacing', 'appearance'],
  codegen: {
    import: "import { LinearGradient } from 'expo-linear-gradient'",
    component: 'LinearGradient',
    emitter: 'lineargradient'
  },
  previewNote:
    'Canvas renders a real CSS linear-gradient via RNW backgroundImage (RN 0.76+ supports the same syntax on the View style). startColor/endColor/angle compile to colors + start/end points on device.'
}
