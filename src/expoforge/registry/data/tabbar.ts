/*
 * Tab bar navigator-part metadata — drives the inspector when the tab bar is
 * selected on the canvas (Selection { kind: 'nav', part: 'tabbar' }).
 *
 * This is the §4.3 "implementation switching" target: the SAME logical
 * component (the group's tab bar) with two real implementations —
 *  - native: Expo Router `<Tabs screenOptions={…}>` (platform renders the bar)
 *  - custom: a generated `components/<X>TabBar.tsx` wired via `<Tabs tabBar={…}>`
 *
 * Prop keys map 1:1 onto TabsNavConfig (native) and CustomTabBarConfig (custom)
 * fields — the store's setTabBarImpl preserves every shared key on switch.
 * The right panel renders these schemas; codegen emits the matching layout.
 */
import type { ComponentImplementation } from '../types'

export const TAB_BAR_PART_ID = 'tabbar'
export const STACK_HEADER_PART_ID = 'header'

export const TAB_BAR_IMPLEMENTATIONS: ComponentImplementation[] = [
  {
    id: 'native',
    label: 'Native tab bar',
    kind: 'native',
    description: 'Expo Router <Tabs> screenOptions — the platform renders and animates the bar. Fewer knobs, zero extra code.',
    props: [
      {
        key: 'position',
        label: 'Position',
        type: 'enum',
        options: [
          { value: 'bottom', label: 'Bottom' },
          { value: 'top', label: 'Top' }
        ],
        default: 'bottom',
        control: 'segmented',
        section: 'Tab bar'
      },
      { key: 'showLabels', label: 'Show labels', type: 'boolean', default: true, section: 'Tab bar' },
      { key: 'barHeight', label: 'Bar height', type: 'number', default: 52, min: 32, max: 120, step: 1, unit: 'dp', section: 'Tab bar' },
      { key: 'iconSize', label: 'Icon size', type: 'number', default: 24, min: 12, max: 48, step: 1, unit: 'dp', section: 'Tab bar' },
      { key: 'labelSize', label: 'Label size', type: 'number', default: 10, min: 7, max: 20, step: 1, unit: 'dp', section: 'Tab bar' },
      {
        key: 'labelWeight',
        label: 'Label weight',
        type: 'enum',
        options: [
          { value: '400', label: 'Regular' },
          { value: '500', label: 'Medium' },
          { value: '600', label: 'Semibold' },
          { value: '700', label: 'Bold' }
        ],
        default: '500',
        section: 'Tab bar'
      },
      { key: 'activeColor', label: 'Active tint', type: 'color', default: '#007AFF', section: 'Tab colors' },
      { key: 'inactiveColor', label: 'Inactive tint', type: 'color', default: '#8E8E93', section: 'Tab colors' },
      { key: 'barBackground', label: 'Bar background', type: 'color', default: '#F8F8F8', section: 'Tab colors' },
      { key: 'showTopBorder', label: 'Hairline border', type: 'boolean', default: true, section: 'Tab colors' },
      { key: 'borderTopWidth', label: 'Border width', type: 'number', default: 1, min: 0, max: 8, step: 1, unit: 'dp', section: 'Tab colors' },
      { key: 'borderTopColor', label: 'Border color', type: 'color', default: '#C6C6C8', section: 'Tab colors' }
    ],
    codegen: { import: "import { Tabs } from 'expo-router'", component: 'Tabs' }
  },
  {
    id: 'custom',
    label: 'Custom tab bar',
    kind: 'custom',
    description: 'Generates components/<Group>TabBar.tsx — full visual control with a spring-animated active state, wired through <Tabs tabBar={…}>.',
    props: [
      { key: 'barHeight', label: 'Bar height', type: 'number', default: 56, min: 40, max: 140, step: 1, unit: 'dp', section: 'Tab bar' },
      { key: 'iconSize', label: 'Icon size', type: 'number', default: 24, min: 12, max: 48, step: 1, unit: 'dp', section: 'Tab bar' },
      { key: 'showLabels', label: 'Show labels', type: 'boolean', default: true, section: 'Tab bar' },
      { key: 'labelSize', label: 'Label size', type: 'number', default: 10, min: 7, max: 20, step: 1, unit: 'dp', section: 'Tab bar' },
      {
        key: 'labelWeight',
        label: 'Label weight',
        type: 'enum',
        options: [
          { value: '400', label: 'Regular' },
          { value: '500', label: 'Medium' },
          { value: '600', label: 'Semibold' },
          { value: '700', label: 'Bold' }
        ],
        default: '500',
        section: 'Tab bar'
      },
      { key: 'activeColor', label: 'Active tint', type: 'color', default: '#007AFF', section: 'Tab colors' },
      { key: 'inactiveColor', label: 'Inactive tint', type: 'color', default: '#8E8E93', section: 'Tab colors' },
      { key: 'barBackground', label: 'Bar background', type: 'color', default: '#F8F8F8', section: 'Tab colors' },
      { key: 'showTopBorder', label: 'Hairline border', type: 'boolean', default: true, section: 'Tab colors' },
      { key: 'borderTopWidth', label: 'Border width', type: 'number', default: 1, min: 0, max: 8, step: 1, unit: 'dp', section: 'Tab colors' },
      { key: 'borderTopColor', label: 'Border color', type: 'color', default: '#C6C6C8', section: 'Tab colors' },
      {
        key: 'animation',
        label: 'Active transition',
        type: 'enum',
        options: [
          { value: 'spring', label: 'Spring' },
          { value: 'fade', label: 'Fade' },
          { value: 'none', label: 'None' }
        ],
        default: 'spring',
        section: 'Animation'
      },
      { key: 'springDamping', label: 'Spring damping', type: 'number', default: 12, min: 4, max: 30, step: 0.5, section: 'Animation', description: 'How quickly the spring settles. Lower = bouncier.' },
      { key: 'springStiffness', label: 'Spring stiffness', type: 'number', default: 170, min: 40, max: 500, step: 5, section: 'Animation' }
    ],
    codegen: { import: "import { Tabs } from 'expo-router'", component: 'Tabs', emitter: 'tabs-custom' }
  }
]

/** Props shared by both implementations — preserved verbatim on switch. */
export const TAB_BAR_SHARED_KEYS = [
  'showLabels',
  'activeColor',
  'inactiveColor',
  'barBackground',
  'barHeight',
  'labelSize',
  'labelWeight',
  'iconSize',
  'showTopBorder',
  'borderTopColor',
  'borderTopWidth'
] as const
