/*
 * flatlist · Phase 2 lists — the repeating list with a static data source.
 *
 * "Design ONE item, repeat with dynamic data": the list's direct children
 * are the ITEM TEMPLATE (role 'item'; other roles: header / footer /
 * separator / empty — node.listRole). The data source is a static array
 * (props.data, edited with the array editor) — the same TravelMate-style
 * local array every reference app ships; API data binding is the data module
 * (Phase 4, per the capability matrix).
 *
 * Text content / Image source inside the template may bind to the row:
 * `{item.title}`, `{item.image}` — resolved per row in the preview and
 * emitted as real expressions by the code generator (lib/lists/bindings is
 * the one resolver both consume).
 */
import type { RegistryEntry } from '../types'

/** The array-editor item schema shared by data sources (title/subtitle/image). */
const ITEM_FIELDS = [
  { key: 'title', label: 'Title', type: 'string', placeholder: 'Row title' },
  { key: 'subtitle', label: 'Subtitle', type: 'string', placeholder: 'Optional second line' },
  { key: 'image', label: 'Image URL', type: 'string', placeholder: 'https://… (bind with {item.image})' }
] as const

export const FLATLIST_ENTRY: RegistryEntry = {
  id: 'flatlist',
  name: 'Flat List',
  icon: 'ph:list-dashes',
  category: 'layout',
  description:
    'A repeating list. Design the item template once (its children) — every row of the data source renders it. Horizontal and grid forms included.',
  children: 'any',
  insert: { width: 320, height: 420 },
  props: [
    {
      key: 'data',
      label: 'Data source',
      type: 'array',
      item: [...ITEM_FIELDS],
      minItems: 0,
      default: [{ title: 'Item 1' }, { title: 'Item 2' }, { title: 'Item 3' }],
      section: 'Content',
      description: 'The static rows every item template renders. Bind inside the template with {item.title}, {item.subtitle}, {item.image}.'
    },
    {
      key: 'horizontal',
      label: 'Horizontal',
      type: 'boolean',
      default: false,
      section: 'Layout',
      description: 'Scrolls left-to-right instead of top-to-bottom (carousels, chips rows).'
    },
    {
      key: 'numColumns',
      label: 'Columns',
      type: 'number',
      default: 1,
      min: 1,
      max: 4,
      step: 1,
      section: 'Layout',
      visibleWhen: { key: 'horizontal', equals: false },
      description: 'Grid layout (numColumns). Only meaningful vertically — React Native ignores it for horizontal lists.'
    },
    {
      key: 'itemSpacing',
      label: 'Item spacing',
      type: 'number',
      default: 0,
      min: 0,
      max: 64,
      step: 2,
      unit: 'dp',
      section: 'Layout',
      description: 'Gap between items (contentContainerStyle gap).'
    },
    {
      key: 'showsScrollIndicator',
      label: 'Show indicator',
      type: 'boolean',
      default: true,
      section: 'Behavior'
    }
  ],
  styleSections: ['layout', 'appearance', 'effects'],
  codegen: { import: "import { FlatList } from 'react-native'", component: 'FlatList', emitter: 'flatlist' },
  previewNote:
    'The item template repeats once per data row (bindings resolve per row; an unresolved binding shows its {item.…} text). Item-template roots should stay in-flow (Style > Layout > In flow) — rows come from the list layout, not absolute placement.'
}
