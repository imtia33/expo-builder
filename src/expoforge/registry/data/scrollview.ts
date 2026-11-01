/*
 * scrollview · docs/04 §3.1 (line 250) — RN core ScrollView.
 *
 * v3 rework: adds the two most useful real scroll behaviors — pagingEnabled
 * (carousel-style snapping) and keyboardDismissMode. The separate
 * showsHorizontal/VerticalScrollIndicator props are deliberately NOT exposed:
 * codegen fans the flat `showsScrollIndicator` key out to both, and a second
 * pair of keys would emit conflicting values.
 *
 * Deviations from doc 04:
 *  - `contentContainerStyle` (inline style object) has no flat PropField type;
 *    v1 keeps it out of the inspector (children style their own layout).
 *  - `refreshEnabled` / `refreshing` (RefreshControl wiring) and the
 *    keyboard-aware flavor are deferred with the flow system.
 *  - `snapToInterval` / `snapToOffsets` are omitted — they interact with
 *    pagingEnabled and belong with a guided carousel recipe.
 */
import type { RegistryEntry } from '../types'

export const SCROLLVIEW_ENTRY: RegistryEntry = {
  id: 'scrollview',
  name: 'Scroll View',
  icon: 'ph:mouse-scroll',
  category: 'layout',
  description: 'A scrolling container. Give it a bounded size — children scroll inside.',
  children: 'any',
  insert: { width: 300, height: 220 },
  props: [
    { key: 'horizontal', label: 'Horizontal', type: 'boolean', default: false, section: 'Behavior' },
    { key: 'showsScrollIndicator', label: 'Show indicator', type: 'boolean', default: true, section: 'Behavior' },
    { key: 'scrollEnabled', label: 'Scroll enabled', type: 'boolean', default: true, section: 'Behavior' },
    { key: 'bounces', label: 'Bounces (iOS)', type: 'boolean', default: true, section: 'Behavior' },
    {
      key: 'overScrollMode',
      label: 'Overscroll (Android)',
      type: 'enum',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'always', label: 'Always' },
        { value: 'never', label: 'Never' }
      ],
      default: 'auto',
      section: 'Behavior'
    },
    {
      key: 'keyboardShouldPersistTaps',
      label: 'Keyboard taps',
      type: 'enum',
      options: [
        { value: 'never', label: 'Never' },
        { value: 'always', label: 'Always' },
        { value: 'handled', label: 'Handled' }
      ],
      default: 'never',
      section: 'Behavior',
      description: 'Whether taps pass through to children while the keyboard is open.'
    },
    {
      key: 'pagingEnabled',
      label: 'Paging',
      type: 'boolean',
      default: false,
      section: 'Behavior',
      description: 'Snaps scrolling to full-view-sized pages (carousels, onboarding).'
    },
    {
      key: 'keyboardDismissMode',
      label: 'Keyboard dismiss',
      type: 'enum',
      options: [
        { value: 'none', label: 'Never' },
        { value: 'on-drag', label: 'On drag' },
        { value: 'interactive', label: 'Interactive (iOS)' }
      ],
      default: 'none',
      section: 'Behavior',
      description: 'Dismisses the keyboard while dragging. Interactive (the keyboard follows the drag) is iOS-only. Applies on device; not shown in the canvas preview.'
    }
  ],
  styleSections: ['layout', 'appearance', 'effects'],
  codegen: { import: "import { ScrollView } from 'react-native'", component: 'ScrollView' },
  previewNote:
    'Native scrolling on canvas. bounces / overScrollMode / keyboardShouldPersistTaps / keyboardDismissMode are device-only (no-ops on web).'
}
