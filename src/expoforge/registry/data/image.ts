/*
 * image · docs/04 §3.3 (line 439) — THE implementation-variant exemplar.
 *
 * One logical component, two real implementations (v3 "implementation
 * switching", see types.ts ComponentImplementation):
 *  - 'expo-image'      the default: cached, animated, blurhash placeholders.
 *  - 'react-native'    core Image — zero extra dependencies.
 *
 * The entry-level `props` array is intentionally EMPTY: the variants carry the
 * full prop surface, and effectiveProps(entry, node.impl) resolves the schema
 * for the inspector. Entry-level `codegen` remains the expo-image default —
 * it is the fallback for consumers that do not consult node.impl.
 *
 * The PREVIEW renders react-native-web's Image either way: contentFit→resizeMode,
 * tint→tintColor style; blurhash placeholder + crossfade transition render on
 * device only. The RN variant's fadeDuration (Android) is device-only.
 */
import type { ComponentImplementation, RegistryEntry } from '../types'

export const IMAGE_IMPLEMENTATIONS: ComponentImplementation[] = [
  {
    id: 'expo-image',
    label: 'Expo Image',
    kind: 'native',
    description: 'expo-image — cached, animated, blurhash placeholders.',
    props: [
      { key: 'source', label: 'Source URI', type: 'string', placeholder: 'https://…', section: 'Content' },
      { key: 'placeholder', label: 'Placeholder (blurhash)', type: 'string', section: 'Content' },
      {
        key: 'contentFit',
        label: 'Content fit',
        type: 'enum',
        options: [
          { value: 'cover', label: 'Cover' },
          { value: 'contain', label: 'Contain' },
          { value: 'fill', label: 'Fill' },
          { value: 'center', label: 'Center' },
          { value: 'none', label: 'None' }
        ],
        default: 'cover',
        section: 'Content'
      },
      { key: 'transition', label: 'Transition (ms)', type: 'number', default: 300, min: 0, step: 50, section: 'Content' },
      { key: 'tint', label: 'Tint', type: 'color', section: 'Appearance' }
    ],
    codegen: { import: "import { Image } from 'expo-image'", component: 'Image' }
  },
  {
    id: 'react-native',
    label: 'React Native Image',
    kind: 'native',
    description: 'Core Image — zero extra dependencies.',
    props: [
      { key: 'source', label: 'Source URI', type: 'string', placeholder: 'https://…', section: 'Content' },
      {
        key: 'resizeMode',
        label: 'Resize mode',
        type: 'enum',
        options: [
          { value: 'cover', label: 'Cover' },
          { value: 'contain', label: 'Contain' },
          { value: 'stretch', label: 'Stretch' },
          { value: 'center', label: 'Center' },
          { value: 'repeat', label: 'Repeat' }
        ],
        default: 'cover',
        section: 'Content',
        description: 'How the image scales inside its frame — the core-Image equivalent of contentFit.'
      },
      {
        key: 'fadeDuration',
        label: 'Fade duration (ms)',
        type: 'number',
        default: 300,
        min: 0,
        max: 5000,
        step: 50,
        section: 'Content',
        platform: ['android'],
        description: 'Android-only fade-in when the image finishes loading. Applies on device; not shown in the canvas preview.'
      },
      { key: 'tintColor', label: 'Tint', type: 'color', section: 'Appearance' }
    ],
    codegen: { import: "import { Image } from 'react-native'", component: 'Image' }
  }
]

export const IMAGE_ENTRY: RegistryEntry = {
  id: 'image',
  name: 'Image',
  icon: 'ph:image',
  category: 'media',
  description: 'expo-image with content fit, tint and crossfade transitions. Set a remote URI.',
  children: 'none',
  insert: { width: 200, height: 150 },
  props: [],
  implementations: IMAGE_IMPLEMENTATIONS,
  styleSections: ['layout', 'spacing', 'appearance', 'effects'],
  codegen: { import: "import { Image } from 'expo-image'", component: 'Image' },
  previewNote:
    'Canvas renders react-native-web Image (contentFit→resizeMode, tint→tintColor). Blurhash placeholders + crossfades render on device only; an empty source shows a gray placeholder box.'
}
