/*
 * Phase 2 — component insertion: implementation-aware registry + codegen,
 * list composition (data sources, roles, bindings), and the insertion
 * plumbing (InsertNodeInput impl/props, setNodeListRole, setNodeImpl).
 *
 * The codegen tests are end-to-end through generateProjectFiles (same style
 * as codegen-paint.test.ts): assertions are exact emitted-source strings.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'

/** PHASE2_DUMP=1 bun run test → also writes the generated file for inspection. */
const DUMP = typeof process !== 'undefined' && process.env.PHASE2_DUMP === '1'

import { resetProjectHistory, useProjectStore } from '@/lib/project/store'
import type { ProjectData, ProjectNode } from '@/lib/project/types'
import { generateProjectFiles } from '@/lib/codegen/files'
import { resolveEntry } from '@/lib/codegen/registry'
import { effectiveProps, getEntry } from '@/expoforge/registry'
import { seedListItemTemplate } from '@/components/builder/canvas/list-insert'
import {
  bindingExpression,
  bindingPreviewValue,
  itemLiteral,
  listItems,
  listSections,
  parseItemBinding
} from '@/lib/lists/bindings'

/* ────────────────────────────────────────────────────────────────────────────
 * Bindings — the one resolver shared by preview + codegen
 * ──────────────────────────────────────────────────────────────────────────── */

describe('list bindings', () => {
  it('parses safe member-chain bindings only', () => {
    expect(parseItemBinding('{item.title}')).toEqual({ root: 'item', path: ['title'] })
    expect(parseItemBinding('{section.header}')).toEqual({ root: 'section', path: ['header'] })
    expect(parseItemBinding('{item.address.city}')).toEqual({ root: 'item', path: ['address', 'city'] })
    // Rejections: anything that is not item|section + plain identifier chain.
    expect(parseItemBinding('{user.name}')).toBeNull()
    expect(parseItemBinding('{item.title} and more')).toBeNull()
    expect(parseItemBinding('Plain text')).toBeNull()
    expect(parseItemBinding('{item.}')).toBeNull()
    expect(parseItemBinding("{item['x']}")).toBeNull()
    expect(parseItemBinding('{item.a.b.c.d.e}')).toBeNull() // > 4 segments
    expect(parseItemBinding(42)).toBeNull()
    expect(parseItemBinding(undefined)).toBeNull()
  })

  it('preview substitution: resolved → value, missing/non-primitive → raw text', () => {
    const row = { title: 'Espresso', meta: { url: 'x' }, tags: ['a'] }
    expect(bindingPreviewValue('{item.title}', row)).toBe('Espresso')
    expect(bindingPreviewValue('{item.meta.url}', row)).toBe('x')
    // Missing field: the raw binding shows — the honest unresolved signal.
    expect(bindingPreviewValue('{item.subtitle}', row)).toBe('{item.subtitle}')
    // Non-primitive field: also raw (never stringifies an object/array).
    expect(bindingPreviewValue('{item.tags}', row)).toBe('{item.tags}')
    // Literals pass through; non-strings stringify.
    expect(bindingPreviewValue('Welcome', row)).toBe('Welcome')
    expect(bindingPreviewValue(undefined, row)).toBe('')
  })

  it('codegen expression: validated member chains only', () => {
    expect(bindingExpression('{item.title}')).toBe('item.title')
    expect(bindingExpression('{section.header}')).toBe('section.header')
    expect(bindingExpression('Hello')).toBeNull()
    expect(bindingExpression('{item.a.b.c.d.e}')).toBeNull()
  })

  it('coerces data sources and emits canonical literals', () => {
    const items = listItems({ data: [{ title: 'A', subtitle: '', image: 'https://x' }, null, 'junk', { title: 'B' }] })
    expect(items).toEqual([{ title: 'A', image: 'https://x' }, { title: 'B' }])
    expect(itemLiteral(items[0])).toEqual({ title: 'A', image: 'https://x' })

    const sections = listSections({
      sections: [{ header: 'One', items: [{ title: 'A' }] }, { header: '', items: [] }, 'junk' ]
    })
    expect(sections).toEqual([{ header: 'One', items: [{ title: 'A' }] }, { items: [] }])
    expect(listItems({})).toEqual([])
    expect(listSections({})).toEqual([])
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * Implementation-aware registry + codegen view
 * ──────────────────────────────────────────────────────────────────────────── */

describe('impl-aware registry', () => {
  it('view: default stays react-native View; safe-area switches package + prop surface', () => {
    const plain = resolveEntry('view')
    expect(plain.component).toBe('View')
    expect(plain.importModule).toBe('react-native')

    const safe = resolveEntry('view', 'safe-area')
    expect(safe.component).toBe('SafeAreaView')
    expect(safe.importModule).toBe('react-native-safe-area-context')
    expect(safe.fields.some((f) => f.key === 'edges' && f.default === 'all')).toBe(true)
    expect(safe.impl).toBe('safe-area')
  })

  it('image: the react-native variant now maps to the core Image import (pre-existing gap)', () => {
    expect(resolveEntry('image').importModule).toBe('expo-image')
    const core = resolveEntry('image', 'react-native')
    expect(core.importModule).toBe('react-native')
    expect(core.component).toBe('Image')
    // the variant's prop surface drives emission (resizeMode, not contentFit)
    expect(core.fields.some((f) => f.key === 'resizeMode')).toBe(true)
    expect(core.fields.some((f) => f.key === 'contentFit')).toBe(false)
  })

  it('button: all four implementations map to their real components', () => {
    expect(resolveEntry('button').component).toBe('Pressable')
    expect(resolveEntry('button', 'touchableopacity').component).toBe('TouchableOpacity')
    expect(resolveEntry('button', 'touchablehighlight').component).toBe('TouchableHighlight')
    expect(resolveEntry('button', 'rnbutton').component).toBe('Button')
    expect(resolveEntry('button', 'rnbutton').importModule).toBe('react-native')
  })

  it('effectiveProps swaps the visible surface with the implementation', () => {
    const entry = resolveEntry('button', 'rnbutton')
    const rnFields = entry.fields.map((f) => f.key)
    expect(rnFields).toContain('title')
    expect(rnFields).toContain('color')
    expect(rnFields).not.toContain('variant')
    expect(rnFields).not.toContain('hitSlop')
  })

  it('effectiveProps on the registry entry (inspector source)', () => {
    const buttonEntry = getEntry('button')!
    const pressable = effectiveProps(buttonEntry, 'pressable').map((f) => f.key)
    const rnbutton = effectiveProps(buttonEntry, 'rnbutton').map((f) => f.key)
    expect(pressable).toContain('variant')
    expect(rnbutton).not.toContain('variant')
    expect(rnbutton).toContain('color')
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * Store insertion plumbing
 * ──────────────────────────────────────────────────────────────────────────── */

function resetStore() {
  resetProjectHistory()
  const empty: ProjectData = { name: 'Phase 2 test', groups: [], screens: [], nodes: {} }
  useProjectStore.setState({
    data: empty,
    ui: { expanded: {}, lastDeviceId: 'iphone-17-pro', platform: 'ios', themeMode: 'light' },
    selection: null,
    activeScreenId: null,
    sim: { on: false, history: {} },
    past: [],
    future: [],
    revision: 0
  })
}

const s = () => useProjectStore.getState()

beforeEach(resetStore)

describe('insertion plumbing', () => {
  it('insertNode carries impl and insert-time props', () => {
    const screenId = s().addScreen({ name: 'Home' })
    const listId = s().insertNode({
      screenId,
      type: 'flatlist',
      props: { horizontal: true },
      rect: { left: 0, top: 0, width: 300, height: 200 }
    })
    const list = s().data.nodes[listId]
    expect(list.type).toBe('flatlist')
    expect(list.props).toEqual({ horizontal: true })

    const viewId = s().insertNode({ screenId, type: 'view', impl: 'safe-area', rect: { left: 0, top: 0, width: 200, height: 100 } })
    expect(s().data.nodes[viewId].impl).toBe('safe-area')
  })

  it('setNodeImpl keeps the keys both implementations share', () => {
    const screenId = s().addScreen({ name: 'Home' })
    const buttonId = s().insertNode({
      screenId,
      type: 'button',
      props: { title: 'Go', variant: 'secondary', disabled: true },
      rect: { left: 0, top: 0, width: 120, height: 44 }
    })
    s().setNodeImpl(buttonId, 'rnbutton')
    const props = s().data.nodes[buttonId].props
    expect(props.title).toBe('Go') // in both surfaces → kept
    expect(props.disabled).toBe(true) // in both → kept
    expect('variant' in props).toBe(false) // rnbutton has no variant → dropped
    expect(s().data.nodes[buttonId].impl).toBe('rnbutton')
  })

  it('setNodeListRole sets, clears, and refuses non-list children', () => {
    const screenId = s().addScreen({ name: 'Home' })
    const listId = s().insertNode({ screenId, type: 'flatlist', rect: { left: 0, top: 0, width: 300, height: 400 } })
    const rowId = s().insertNode({ screenId, type: 'view', parentId: listId, rect: { left: 0, top: 0, width: 200 } })
    const outsideId = s().insertNode({ screenId, type: 'view', rect: { left: 0, top: 0, width: 50 } })

    s().setNodeListRole(rowId, 'header')
    expect(s().data.nodes[rowId].listRole).toBe('header')
    s().setNodeListRole(rowId, 'item')
    expect(s().data.nodes[rowId].listRole).toBeUndefined()

    // Not a list child: no-op.
    s().setNodeListRole(outsideId, 'header')
    expect(s().data.nodes[outsideId].listRole).toBeUndefined()
  })

  it('seedListItemTemplate seeds the card + bound text (and a section header for sectionlist)', () => {
    const screenId = s().addScreen({ name: 'Home' })
    const listId = s().insertNode({ screenId, type: 'flatlist', rect: { left: 0, top: 0, width: 320, height: 420 } })
    seedListItemTemplate(listId)
    const children = Object.values(s().data.nodes).filter((n) => n.parentId === listId)
    expect(children.length).toBe(1) // the card
    const card = children[0]
    expect(card.style.position).toBe('relative')
    expect(card.style.width).toBe('100%')
    const text = Object.values(s().data.nodes).find((n) => n.parentId === card.id) as ProjectNode
    expect(text?.type).toBe('text')
    expect(text?.props.content).toBe('{item.title}')

    // Already has children → no re-seed.
    const before = Object.keys(s().data.nodes).length
    seedListItemTemplate(listId)
    expect(Object.keys(s().data.nodes).length).toBe(before)

    // SectionList: card + header row playing the section-header role.
    const slId = s().insertNode({ screenId, type: 'sectionlist', rect: { left: 0, top: 0, width: 320, height: 440 } })
    seedListItemTemplate(slId)
    const slChildren = Object.values(s().data.nodes).filter((n) => n.parentId === slId)
    expect(slChildren.length).toBe(2)
    const header = slChildren.find((n) => n.listRole === 'header')
    expect(header).toBeDefined()
    const headerText = Object.values(s().data.nodes).find((n) => n.parentId === header!.id) as ProjectNode
    expect(headerText?.props.content).toBe('{section.header}')
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * Codegen end-to-end — exact emitted source
 * ──────────────────────────────────────────────────────────────────────────── */

function listProject(): ProjectData {
  const screen = {
    id: 's1',
    name: 'Lists',
    route: 'lists',
    groupId: null,
    order: 0,
    deviceId: 'iphone-17-pro',
    x: 0,
    y: 0,
    safeArea: { top: false, bottom: false },
    background: '#FFFFFF'
  }
  const node = (partial: Partial<ProjectNode> & Pick<ProjectNode, 'id' | 'type' | 'order'>): ProjectNode => ({
    id: partial.id,
    screenId: 's1',
    parentId: partial.parentId ?? null,
    type: partial.type,
    order: partial.order,
    props: partial.props ?? {},
    style: partial.style ?? { position: 'relative' },
    ...(partial.impl !== undefined ? { impl: partial.impl } : {}),
    ...(partial.listRole !== undefined ? { listRole: partial.listRole } : {})
  })
  return {
    name: 'Phase 2 lists',
    groups: [],
    screens: [screen],
    nodes: {
      // Vertical flatlist with a full role set + bound template.
      fl1: node({ id: 'fl1', type: 'flatlist', order: 0, props: { itemSpacing: 8 }, style: { position: 'relative', width: '100%', flex: 1 } }),
      card: node({ id: 'card', type: 'view', order: 0, parentId: 'fl1', style: { position: 'relative', width: '100%', minHeight: 64, backgroundColor: '#F3F4F6', borderRadius: 8, paddingTop: 12, paddingRight: 12, paddingBottom: 12, paddingLeft: 12 } }),
      boundTitle: node({ id: 'boundTitle', type: 'text', order: 0, parentId: 'card', props: { content: '{item.title}' }, style: { position: 'relative', fontSize: 15 } }),
      boundImage: node({ id: 'boundImage', type: 'image', order: 1, parentId: 'card', props: { source: '{item.image}' }, style: { position: 'relative', width: 40, height: 40, borderRadius: 20 } }),
      hdr: node({ id: 'hdr', type: 'view', order: 1, parentId: 'fl1', listRole: 'header', style: { position: 'relative', width: '100%', paddingTop: 8, paddingBottom: 8 } }),
      hdrText: node({ id: 'hdrText', type: 'text', order: 0, parentId: 'hdr', props: { content: 'Today' }, style: { position: 'relative', fontWeight: '600' } }),
      sep: node({ id: 'sep', type: 'view', order: 2, parentId: 'fl1', listRole: 'separator', style: { position: 'relative', height: 1, width: '100%', backgroundColor: '#E5E7EB' } }),
      ftr: node({ id: 'ftr', type: 'view', order: 3, parentId: 'fl1', listRole: 'footer', style: { position: 'relative', height: 24 } }),
      emptyText: node({ id: 'emptyText', type: 'text', order: 4, parentId: 'fl1', listRole: 'empty', props: { content: 'Nothing yet' }, style: { position: 'relative' } }),
      // Horizontal form: horizontal + spacing; no numColumns emission.
      fl2: node({ id: 'fl2', type: 'flatlist', order: 1, props: { horizontal: true, numColumns: 3 }, style: { position: 'relative', height: 96 } }),
      // Grid form.
      fl3: node({ id: 'fl3', type: 'flatlist', order: 2, props: { numColumns: 2 }, style: { position: 'relative', height: 240 } }),
      // SectionList: seeded-style header (role header) + item template.
      sl1: node({ id: 'sl1', type: 'sectionlist', order: 3, style: { position: 'relative', height: 320 } }),
      slCard: node({ id: 'slCard', type: 'view', order: 0, parentId: 'sl1', style: { position: 'relative', width: '100%', minHeight: 56 } }),
      slRow: node({ id: 'slRow', type: 'text', order: 0, parentId: 'slCard', props: { content: '{item.title}' }, style: { position: 'relative' } }),
      slHdr: node({ id: 'slHdr', type: 'view', order: 1, parentId: 'sl1', listRole: 'header', style: { position: 'relative', width: '100%' } }),
      slHdrText: node({ id: 'slHdrText', type: 'text', order: 0, parentId: 'slHdr', props: { content: '{section.header}' }, style: { position: 'relative', fontSize: 13 } }),
      // View implementations.
      sv1: node({ id: 'sv1', type: 'view', order: 4, impl: 'safe-area', props: { edges: 'top-bottom' }, style: { position: 'relative', width: '100%', flex: 1 } }),
      v1: node({ id: 'v1', type: 'view', order: 5, style: { position: 'relative' } }),
      // Button implementations.
      b1: node({ id: 'b1', type: 'button', order: 6, impl: 'touchablehighlight', props: { title: 'Tap me', underlayColor: '#FF0000', activeOpacity: 0.4 }, style: { position: 'relative', borderRadius: 10 } }),
      b2: node({ id: 'b2', type: 'button', order: 7, impl: 'rnbutton', props: { title: 'Go', color: '#2563EB' }, style: { position: 'relative' } })
    },
    theme: { colors: { primary: { light: '#2563EB', dark: '#3B82F6' } } }
  }
}

describe('codegen: lists + implementations end-to-end', () => {
  const files = generateProjectFiles(listProject())
  const screen = files.get('app/lists.tsx')!
  if (DUMP) writeFileSync('/tmp/phase2-lists.tsx', screen)

  it('emits the file at all', () => {
    expect(files.has('app/lists.tsx')).toBe(true)
  })

  it('flatlist: import, default data literal, renderItem with real bindings', () => {
    expect(screen).toMatch(/import \{[^}]*FlatList[^}]*\} from 'react-native'/)
    // Default rows (registry default) with canonical key order.
    expect(screen).toContain("data={[{ title: 'Item 1' }, { title: 'Item 2' }, { title: 'Item 3' }]}")
    expect(screen).toContain('renderItem={({ item }) => (')
    // The bound template text becomes a real expression child.
    expect(screen).toContain('{item.title}')
    // Bound image source becomes source={{ uri: item.image }}.
    expect(screen).toContain('source={{ uri: item.image }}')
    // Spacing → contentContainerStyle gap.
    expect(screen).toContain('contentContainerStyle={{ gap: 8 }}')
    // keyExtractor stays omitted (RN default: index — correct for static data).
    expect(screen).not.toContain('keyExtractor')
  })

  it('flatlist roles become the list chrome attributes', () => {
    expect(screen).toContain('ListHeaderComponent={')
    expect(screen).toContain('ListFooterComponent={')
    expect(screen).toContain('ItemSeparatorComponent={')
    expect(screen).toContain('ListEmptyComponent={')
  })

  it('horizontal form emits horizontal and never numColumns; grid form emits numColumns', () => {
    // fl2: horizontal + numColumns 3 → horizontal wins.
    expect(screen).toContain('horizontal')
    // exactly one numColumns emission in the whole file (the grid form, value 2)
    const matches = screen.match(/numColumns=\{(\d+)\}/g) ?? []
    expect(matches).toEqual(['numColumns={2}'])
  })

  it('sectionlist: sections literal, renderSectionHeader, section bindings', () => {
    expect(screen).toMatch(/import \{[^}]*SectionList[^}]*\} from 'react-native'/)
    expect(screen).toContain('sections={[')
    expect(screen).toContain("header: 'Section 1'")
    expect(screen).toContain('renderSectionHeader={({ section }) => (')
    // The header template's bound text: a real section expression.
    expect(screen).toContain('{section.header}')
    expect(screen).toContain("data: [{ title: 'Item 1' }, { title: 'Item 2' }]")
  })

  it('view implementations: safe-area edges array, plain view untouched', () => {
    expect(screen).toContain("import { SafeAreaView } from 'react-native-safe-area-context'")
    expect(screen).toContain("edges={['top', 'bottom']}")
    // 'all' default never emits an edges prop (no other edges attr in the file).
    const edgesMatches = screen.match(/edges=\{/g) ?? []
    expect(edgesMatches.length).toBe(1)
    // Plain view still imports from react-native (existing projects unchanged).
    expect(screen).toMatch(/import \{[^}]*View[^}]*\} from 'react-native'/)
  })

  it('button implementations: TouchableHighlight props + RN Button placeholder onPress', () => {
    expect(screen).toMatch(/import \{[^}]*TouchableHighlight[^}]*\} from 'react-native'/)
    expect(screen).toMatch(/import \{[^}]*Button[^}]*\} from 'react-native'/)
    expect(screen).toContain('underlayColor="#FF0000"')
    expect(screen).toContain('activeOpacity={0.4}')
    expect(screen).toContain('onPress={() => { /* TODO: wire an action */ }}')
    expect(screen).toContain('title="Go"')
    expect(screen).toContain('color="#2563EB"')
  })
})
