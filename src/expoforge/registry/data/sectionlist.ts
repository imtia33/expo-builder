/*
 * sectionlist · Phase 2 lists — grouped rows with per-section headers.
 *
 * The data source is sections: [{ header, items: […] }] (nested array
 * editor). The item template (children role 'item') repeats per row; the
 * section-header design (a child with role 'header') renders per section —
 * bind its text to {section.header} so each group shows its own title from
 * the data.
 */
import type { RegistryEntry } from '../types'

const ITEM_FIELDS = [
  { key: 'title', label: 'Title', type: 'string', placeholder: 'Row title' },
  { key: 'subtitle', label: 'Subtitle', type: 'string', placeholder: 'Optional second line' },
  { key: 'image', label: 'Image URL', type: 'string', placeholder: 'https://… (bind with {item.image})' }
] as const

export const SECTIONLIST_ENTRY: RegistryEntry = {
  id: 'sectionlist',
  name: 'Section List',
  icon: 'ph:list-numbers',
  category: 'layout',
  description:
    'Rows grouped into sections, each with its own header. Design the item template and the section header once; the data source drives both.',
  children: 'any',
  insert: { width: 320, height: 440 },
  props: [
    {
      key: 'sections',
      label: 'Sections',
      type: 'array',
      item: [
        { key: 'header', label: 'Section header', type: 'string', placeholder: 'Group title (bind with {section.header})' },
        { key: 'items', label: 'Rows', type: 'array', item: [...ITEM_FIELDS], minItems: 0 }
      ],
      minItems: 0,
      default: [
        { header: 'Section 1', items: [{ title: 'Item 1' }, { title: 'Item 2' }] },
        { header: 'Section 2', items: [{ title: 'Item 3' }] }
      ],
      section: 'Content',
      description: 'One entry per group: a header plus its rows. Section headers bind with {section.header}; rows bind with {item.title} etc.'
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
  codegen: { import: "import { SectionList } from 'react-native'", component: 'SectionList', emitter: 'sectionlist' },
  previewNote:
    'Section headers and rows repeat from the data source (bindings resolve per row / per section). Item-template and header roots should stay in-flow — the list owns their placement.'
}
