/*
 * flatlist · Phase 2 lists — the repeating list. Phase 4 (P0-3): the data
 * source switches between the static array (rows edited in the array editor)
 * and a REAL API endpoint (fetched for real — canvas and generated code).
 *
 * "Design ONE item, repeat with dynamic data": the list's direct children
 * are the ITEM TEMPLATE (role 'item'; other roles: header / footer /
 * separator / empty / loading / error — node.listRole). Text content /
 * Image source inside the template bind to the row (`{item.title}`,
 * `{item.address.city}`); the error-role design may bind `{error}` to the
 * real request error. lib/lists/bindings + lib/lists/api-source are the one
 * resolver pair the preview and the code generator both consume.
 *
 * The API fields are builder config, never FlatList attributes — the emitter
 * strips them (API_PROP_KEYS) and emits the fetch lifecycle instead.
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
      key: 'dataSourceKind',
      label: 'Source',
      type: 'enum',
      options: [
        { value: 'static', label: 'Static rows' },
        { value: 'api', label: 'API endpoint' }
      ],
      default: 'static',
      section: 'Data source',
      description: 'Static rows live in this project. An API endpoint is fetched for real — on the canvas by your browser, in the app by fetch() on device.'
    },
    {
      key: 'apiUrl',
      label: 'Endpoint',
      type: 'string',
      placeholder: 'https://api.example.com/items',
      section: 'Data source',
      visibleWhen: { key: 'dataSourceKind', equals: 'api' },
      description: 'Fetched for real. The canvas runs the request from your browser, so the endpoint must allow cross-origin requests (CORS); the generated app has no such limit on device.'
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
      label: 'Rows at',
      type: 'string',
      placeholder: 'data.results (empty = the response is the array)',
      section: 'Data source',
      visibleWhen: { key: 'dataSourceKind', equals: 'api' },
      description: 'Dotted path to the rows array inside the JSON response, e.g. data.results. Leave empty when the response body itself is the array.'
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
      description: 'On device, the pull gesture re-runs the request (FlatList refreshing + onRefresh). The web canvas has no pull gesture — use Reload above.'
    },
    {
      key: 'data',
      label: 'Rows',
      type: 'array',
      item: [...ITEM_FIELDS],
      minItems: 0,
      default: [{ title: 'Item 1' }, { title: 'Item 2' }, { title: 'Item 3' }],
      section: 'Data source',
      visibleWhen: { key: 'dataSourceKind', equals: 'static' },
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
    'The item template repeats once per data row (bindings resolve per row; an unresolved binding shows its {item.…} text). API sources fetch for real — design your loading and error states as child layers with the List role set to Loading state / Error state, and bind {error} inside the error design. Item-template roots should stay in-flow (Style > Layout > In flow) — rows come from the list layout, not absolute placement.'
}
