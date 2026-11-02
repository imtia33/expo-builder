/*
 * sectionlist · Phase 2 lists — grouped rows with per-section headers.
 *
 * Phase 4 (P0-3): the data source switches between static sections (the
 * nested array editor) and a REAL API endpoint. API sections accept both
 * common shapes per entry: header text from `header` or `title`, rows from
 * `data` or `items` — no other guessing (documented in the field).
 *
 * The item template (children role 'item') repeats per row; the
 * section-header design (role 'header') renders per section — bind its text
 * to {section.header}. The error-role design may bind {error}.
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
      key: 'dataSourceKind',
      label: 'Source',
      type: 'enum',
      options: [
        { value: 'static', label: 'Static sections' },
        { value: 'api', label: 'API endpoint' }
      ],
      default: 'static',
      section: 'Data source',
      description: 'Static sections live in this project. An API endpoint is fetched for real — on the canvas by your browser, in the app by fetch() on device.'
    },
    {
      key: 'apiUrl',
      label: 'Endpoint',
      type: 'string',
      placeholder: 'https://api.example.com/groups',
      section: 'Data source',
      visibleWhen: { key: 'dataSourceKind', equals: 'api' },
      description: 'Fetched for real. The canvas runs the request from your browser (the endpoint must allow CORS); the generated app has no such limit on device.'
    },
    {
      key: 'apiMethod',
      label: 'Method',
      type: 'enum',
      control: 'segmented',
      options: [
        { value: 'GET', label: 'GET' },
        { value: 'POST', label: 'POST' }
      ],
      default: 'GET',
      section: 'Data source',
      visibleWhen: { key: 'dataSourceKind', equals: 'api' }
    },
    {
      key: 'apiCollectionPath',
      label: 'Sections at',
      type: 'string',
      placeholder: 'data.groups (empty = the response is the array)',
      section: 'Data source',
      visibleWhen: { key: 'dataSourceKind', equals: 'api' },
      description: 'Dotted path to the sections array. Each section takes its header from `header` (or `title`) and its rows from `data` (or `items`).'
    },
    {
      key: 'apiHeaders',
      label: 'Headers',
      type: 'string',
      control: 'textarea',
      placeholder: 'Authorization: Bearer …',
      section: 'Data source',
      visibleWhen: { key: 'dataSourceKind', equals: 'api' },
      description: 'One per line, `Key: Value`.'
    },
    {
      key: 'apiBody',
      label: 'Body',
      type: 'string',
      control: 'textarea',
      placeholder: '{ "query": "…" }',
      section: 'Data source',
      visibleWhen: { key: 'dataSourceKind', equals: 'api' },
      description: 'Request body, sent with POST requests.'
    },
    {
      key: 'refreshEnabled',
      label: 'Pull to refresh',
      type: 'boolean',
      default: false,
      section: 'Data source',
      visibleWhen: { key: 'dataSourceKind', equals: 'api' },
      description: 'On device, the pull gesture re-runs the request (SectionList refreshing + onRefresh). The web canvas has no pull gesture — use Reload above.'
    },
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
      section: 'Data source',
      visibleWhen: { key: 'dataSourceKind', equals: 'static' },
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
    'Section headers and rows repeat from the data source (bindings resolve per row / per section). API sources fetch for real — design loading/error states as child layers with the List role set to Loading state / Error state ({error} binds inside the error design). Item-template and header roots should stay in-flow — the list owns their placement.'
}
