/*
 * Phase 4 (P0-3) codegen end-to-end — REAL-fetch API data sources.
 *
 * Pin the exact generated shapes: the useState/useCallback/useEffect loader
 * block (one per API list, tree order), data/refreshing/onRefresh bound to the
 * derived identifiers, the ListEmptyComponent conditional composing the
 * designed loading → error → empty states, {error} substituted on both label
 * surfaces (text child + RN-Button title), the sectionlist rows→sections
 * mapping, the nesting rule (lists inside repeated templates stay static),
 * identifier collisions/reservations, and static-mode byte-compat (no
 * api anything without an endpoint). Every file parses as JSX.
 *
 * CODEGEN_DUMP=1 bun run test → also writes the generated files for inspection.
 */
import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'

import type { ProjectData, ProjectNode } from '@/lib/project/types'
import { generateProjectFiles } from '@/lib/codegen/files'

const DUMP = typeof process !== 'undefined' && process.env.CODEGEN_DUMP === '1'

function screenFixture(id: string, route: string, extra: Partial<ProjectData['screens'][number]> = {}) {
  return {
    id,
    name: route,
    route,
    groupId: null,
    order: 0,
    deviceId: 'iphone-17-pro',
    x: 0,
    y: 0,
    safeArea: { top: false, bottom: false },
    background: '#FFFFFF',
    ...extra
  }
}

function node(
  partial: Partial<ProjectNode> & Pick<ProjectNode, 'id' | 'type' | 'order'> & { screenId?: string }
): ProjectNode {
  return {
    id: partial.id,
    screenId: partial.screenId ?? 'flights',
    parentId: partial.parentId ?? null,
    type: partial.type,
    order: partial.order,
    props: partial.props ?? {},
    style: partial.style ?? { position: 'relative' },
    ...(partial.name !== undefined ? { name: partial.name } : {}),
    ...(partial.impl !== undefined ? { impl: partial.impl } : {}),
    ...(partial.listRole !== undefined ? { listRole: partial.listRole } : {})
  }
}

const API_PROPS = {
  dataSourceKind: 'api',
  apiUrl: 'https://api.example.dev/flights',
  apiMethod: 'GET' as const,
  apiCollectionPath: 'data.results',
  apiHeaders: 'Authorization: Bearer t\nContent-Type: application/json',
  refreshEnabled: true
}

function projectData(): ProjectData {
  return {
    name: 'P0-3 codegen',
    groups: [],
    screens: [
      // s1 'flights': the full API flatlist — refresh on, designed
      // loading/error/empty states, {error} on both label surfaces, a
      // referenced state entry coexisting with the api identifiers.
      screenFixture('flights', 'flights', {
        state: [{ id: 'st-busy', name: 'busy', type: 'boolean', initial: false }]
      }),
      // s2 'menu': sectionlist, POST + body, path '' (the response IS the
      // array), refresh off.
      screenFixture('menu', 'menu'),
      // s3 'nested': an API-configured flatlist INSIDE a static list's item
      // template — the nesting rule keeps it static.
      screenFixture('nested', 'nested'),
      // s4 'dupe': name collisions + builder-reserved names.
      screenFixture('dupe', 'dupe'),
      // s5 'plain': static lists only — no api anything.
      screenFixture('plain', 'plain')
    ],
    nodes: {
      /* ── s1 flights ── */
      fl: node({
        id: 'fl',
        type: 'flatlist',
        order: 0,
        name: 'Flights',
        props: { ...API_PROPS, itemSpacing: 8 },
        style: { position: 'relative', width: '100%', flex: 1 }
      }),
      card: node({ id: 'card', type: 'view', order: 0, parentId: 'fl', style: { position: 'relative', width: '100%', minHeight: 64, backgroundColor: '#F3F4F6', borderRadius: 8 } }),
      cardTitle: node({ id: 'cardTitle', type: 'text', order: 0, parentId: 'card', props: { content: '{item.title}' }, style: { position: 'relative', fontSize: 15 } }),
      // Designed states: loading (view+text), error (view + {error} text + an
      // RN Button whose title is {error}), empty (view + text).
      loadingWrap: node({ id: 'loadingWrap', type: 'view', order: 1, parentId: 'fl', listRole: 'loading', style: { position: 'relative', width: '100%', paddingTop: 24 } }),
      loadingText: node({ id: 'loadingText', type: 'text', order: 0, parentId: 'loadingWrap', props: { content: 'Loading flights…' }, style: { position: 'relative' } }),
      errorWrap: node({ id: 'errorWrap', type: 'view', order: 2, parentId: 'fl', listRole: 'error', style: { position: 'relative', width: '100%', paddingTop: 24 } }),
      errorText: node({ id: 'errorText', type: 'text', order: 0, parentId: 'errorWrap', props: { content: '{error}' }, style: { position: 'relative' } }),
      errorButton: node({ id: 'errorButton', type: 'button', order: 1, parentId: 'errorWrap', impl: 'rnbutton', props: { title: '{error}', color: '#2563EB' }, style: { position: 'relative' } }),
      emptyWrap: node({ id: 'emptyWrap', type: 'view', order: 3, parentId: 'fl', listRole: 'empty', style: { position: 'relative', width: '100%', paddingTop: 24 } }),
      emptyText: node({ id: 'emptyText', type: 'text', order: 0, parentId: 'emptyWrap', props: { content: 'No flights yet' }, style: { position: 'relative' } }),
      busyText: node({ id: 'busyText', type: 'text', order: 1, props: { content: '{state.busy}' }, style: { position: 'relative' } }),

      /* ── s2 menu (sectionlist) ── */
      mn: node({
        id: 'mn',
        screenId: 'menu',
        type: 'sectionlist',
        order: 0,
        name: 'Menu',
        props: { dataSourceKind: 'api', apiUrl: 'https://api.example.dev/menu', apiMethod: 'POST', apiCollectionPath: '', apiBody: '{ "q": "*" }' },
        style: { position: 'relative', height: 320 }
      }),
      mnRow: node({ id: 'mnRow', screenId: 'menu', type: 'view', order: 0, parentId: 'mn', style: { position: 'relative', width: '100%', minHeight: 56 } }),
      mnRowText: node({ id: 'mnRowText', screenId: 'menu', type: 'text', order: 0, parentId: 'mnRow', props: { content: '{item.title}' }, style: { position: 'relative' } }),
      mnHdr: node({ id: 'mnHdr', screenId: 'menu', type: 'view', order: 1, parentId: 'mn', listRole: 'header', style: { position: 'relative', width: '100%' } }),
      mnHdrText: node({ id: 'mnHdrText', screenId: 'menu', type: 'text', order: 0, parentId: 'mnHdr', props: { content: '{section.header}' }, style: { position: 'relative', fontSize: 13 } }),

      /* ── s3 nested: inner API list inside the outer static template, with
       * its own item template (row content of the outer row). ── */
      outer: node({
        id: 'outer',
        screenId: 'nested',
        type: 'flatlist',
        order: 0,
        props: { data: [{ title: 'A' }, { title: 'B' }] },
        style: { position: 'relative', height: 240 }
      }),
      outerCard: node({ id: 'outerCard', screenId: 'nested', type: 'view', order: 0, parentId: 'outer', style: { position: 'relative', width: '100%', minHeight: 48 } }),
      inner: node({
        id: 'inner',
        screenId: 'nested',
        type: 'flatlist',
        order: 0,
        parentId: 'outerCard',
        props: { ...API_PROPS, refreshEnabled: false },
        style: { position: 'relative', height: 96 }
      }),
      innerTpl: node({ id: 'innerTpl', screenId: 'nested', type: 'text', order: 0, parentId: 'inner', props: { content: '{item.title}' }, style: { position: 'relative' } }),

      /* ── s4 dupe: collisions + reserved names ── */
      d1: node({ id: 'd1', screenId: 'dupe', type: 'flatlist', order: 0, name: 'Flights', props: { ...API_PROPS, refreshEnabled: false }, style: { position: 'relative', height: 120 } }),
      d2: node({ id: 'd2', screenId: 'dupe', type: 'flatlist', order: 1, name: 'Flights', props: { ...API_PROPS, refreshEnabled: false }, style: { position: 'relative', height: 120 } }),
      d3: node({ id: 'd3', screenId: 'dupe', type: 'flatlist', order: 2, name: 'Router', props: { ...API_PROPS, refreshEnabled: false }, style: { position: 'relative', height: 120 } }),

      /* ── s5 plain: static lists only ── */
      p1: node({ id: 'p1', screenId: 'plain', type: 'flatlist', order: 0, props: { itemSpacing: 4 }, style: { position: 'relative', height: 200 } }),
      p1Card: node({ id: 'p1Card', screenId: 'plain', type: 'view', order: 0, parentId: 'p1', style: { position: 'relative', width: '100%', minHeight: 40 } }),
      p1Empty: node({ id: 'p1Empty', screenId: 'plain', type: 'text', order: 1, parentId: 'p1', listRole: 'empty', props: { content: 'Nothing here' }, style: { position: 'relative' } }),
      p2: node({ id: 'p2', screenId: 'plain', type: 'sectionlist', order: 1, props: { sections: [{ header: 'One', items: [{ title: 'X' }] }] }, style: { position: 'relative', height: 160 } })
    },
    theme: { colors: { primary: { light: '#2563EB', dark: '#3B82F6' } } }
  }
}

describe('codegen: API data sources end-to-end', () => {
  const files = generateProjectFiles(projectData())
  const flights = files.get('app/flights.tsx')!
  const menu = files.get('app/menu.tsx')!
  const nested = files.get('app/nested.tsx')!
  const dupe = files.get('app/dupe.tsx')!
  const plain = files.get('app/plain.tsx')!
  if (DUMP) {
    writeFileSync('/tmp/p03-flights.tsx', flights)
    writeFileSync('/tmp/p03-menu.tsx', menu)
    writeFileSync('/tmp/p03-nested.tsx', nested)
    writeFileSync('/tmp/p03-dupe.tsx', dupe)
    writeFileSync('/tmp/p03-plain.tsx', plain)
  }

  it('emits every screen file', () => {
    expect(files.has('app/flights.tsx')).toBe(true)
    expect(files.has('app/menu.tsx')).toBe(true)
    expect(files.has('app/nested.tsx')).toBe(true)
    expect(files.has('app/dupe.tsx')).toBe(true)
    expect(files.has('app/plain.tsx')).toBe(true)
  })

  it('flatlist API mode: react imports grow exactly with usage', () => {
    expect(flights).toContain('import { useCallback, useEffect, useState } from \'react\';')
    expect(flights).toMatch(/import \{[^}]*FlatList[^}]*\} from 'react-native'/)
    // The api config keys are builder config — never FlatList attributes.
    expect(flights).not.toContain('dataSourceKind')
    expect(flights).not.toContain('apiUrl')
    expect(flights).not.toContain('apiCollectionPath')
    expect(flights).not.toContain('refreshEnabled')
  })

  it('flatlist API mode: state entry + api declarations coexist, in that order', () => {
    // The referenced {state.busy} entry emits before the api blocks.
    const busyAt = flights.indexOf('const [busy, setBusy] = useState(false);')
    const apiAt = flights.indexOf('const [flights, setFlights] = useState([]);')
    expect(busyAt).toBeGreaterThanOrEqual(0)
    expect(apiAt).toBeGreaterThan(busyAt)
    expect(flights).toContain('const [busy, setBusy] = useState(false);')
  })

  it('flatlist API mode: the exact real-fetch declaration block (GET + headers + refresh)', () => {
    expect(flights).toContain('const [flights, setFlights] = useState([]);')
    expect(flights).toContain('const [flightsLoading, setFlightsLoading] = useState(true);')
    expect(flights).toContain('const [flightsError, setFlightsError] = useState(null);')
    expect(flights).toContain('const [flightsRefreshing, setFlightsRefreshing] = useState(false);')
    expect(flights).toContain('const loadFlights = useCallback(async () => {')
    expect(flights).toContain('setFlightsError(null);')
    expect(flights).toContain("await fetch('https://api.example.dev/flights', {")
    expect(flights).toContain("method: 'GET',")
    expect(flights).toContain('headers: {')
    expect(flights).toContain("Authorization: 'Bearer t',")
    // Hyphenated keys MUST be quoted object keys — bare `Content-Type:` is a
    // syntax error (found live by the babel-parse test).
    expect(flights).toContain("'Content-Type': 'application/json',")
    // GET never sends a body — the option is absent, not empty.
    expect(flights).not.toContain('body:')
    expect(flights).toContain('if (!response.ok) throw new Error(`Request failed with status ${response.status}`);')
    expect(flights).toContain('const json = await response.json();')
    expect(flights).toContain('setFlights(Array.isArray(json?.data?.results) ? json.data.results : []);')
    expect(flights).toContain("setFlightsError(e instanceof Error ? e.message : 'Something went wrong');")
    expect(flights).toContain('setFlightsLoading(false);')
    expect(flights).toContain('setFlightsRefreshing(false);')
    expect(flights).toContain('}, []);')
    expect(flights).toContain('useEffect(() => {')
    expect(flights).toContain('loadFlights();')
    expect(flights).toContain('}, [loadFlights]);')
  })

  it('flatlist API mode: element attrs bind the derived identifiers', () => {
    expect(flights).toContain('data={flights}')
    expect(flights).toContain('refreshing={flightsRefreshing}')
    expect(flights).toContain('onRefresh={() => { setFlightsRefreshing(true); loadFlights(); }}')
    expect(flights).toContain('renderItem={({ item }) => (')
    expect(flights).toContain('{item.title}')
    // itemSpacing → gap; the designed header/footer/separator stay plain chrome.
    expect(flights).toContain('contentContainerStyle={{ gap: 8 }}')
  })

  it('flatlist API mode: the designed states compose into ListEmptyComponent\u2019s conditional', () => {
    expect(flights).toContain('flightsLoading ? (')
    expect(flights).toContain(': flightsError ? (')
    // The final (unconditional) branch is the empty design.
    expect(flights).toContain('No flights yet')
    // {error} on the text-child surface…
    expect(flights).toContain('{flightsError}')
    // …and on the RN-Button title surface.
    expect(flights).toContain('title={flightsError}')
  })

  it('sectionlist API mode: POST + body loader, rows→sections mapping, header bindings', () => {
    expect(menu).toContain('import { useCallback, useEffect, useState } from \'react\';')
    expect(menu).toMatch(/import \{[^}]*SectionList[^}]*\} from 'react-native'/)
    expect(menu).toContain('const [menu, setMenu] = useState([]);')
    expect(menu).toContain('const [menuLoading, setMenuLoading] = useState(true);')
    expect(menu).toContain('const [menuError, setMenuError] = useState(null);')
    // Refresh off → no refreshing identifier anywhere.
    expect(menu).not.toContain('menuRefreshing')
    expect(menu).not.toContain('refreshing=')
    expect(menu).not.toContain('onRefresh')
    expect(menu).toContain('const loadMenu = useCallback(async () => {')
    expect(menu).toContain("await fetch('https://api.example.dev/menu', {")
    expect(menu).toContain("method: 'POST',")
    expect(menu).toContain(`body: '{ "q": "*" }',`)
    // path '' → the response itself is the array.
    expect(menu).toContain('const menuSections = Array.isArray(json) ? json : [];')
    expect(menu).toContain('menuSections.map((section) => ({')
    expect(menu).toContain("typeof section?.header === 'string'")
    expect(menu).toContain(": typeof section?.title === 'string'")
    expect(menu).toContain('data: Array.isArray(section?.data)')
    expect(menu).toContain(': Array.isArray(section?.items)')
    expect(menu).toContain('}, [loadMenu]);')
    // Element: sections bound to the state var; per-section header design.
    expect(menu).toContain('sections={menu}')
    expect(menu).toContain('renderSectionHeader={({ section }) => (')
    expect(menu).toContain('{section.header}')
    expect(menu).toContain('{item.title}')
  })

  it('the nesting rule: an API-configured list inside a repeated template stays static', () => {
    // No fetch, no react import, no api identifiers in the whole screen file.
    expect(nested).not.toContain('fetch(')
    expect(nested).not.toContain('useState')
    expect(nested).not.toMatch(/from 'react'/)
    // The outer static list emits its explicit rows; the inner list emits the
    // registry default rows as a literal — exactly as a static list does
    // (layout-agnostic: the deeper column wraps the literal across lines).
    expect(nested).toContain('data={[{ title: \'A\' }, { title: \'B\' }]}')
    expect(nested).toMatch(/data=\{\[\s*\{ title: 'Item 1' \},\s*\{ title: 'Item 2' \},\s*\{ title: 'Item 3' \},\s*\]\}/)
    // The nested list keeps its OWN renderItem (row content, full list form) —
    // one arrow for the outer template, one for the inner list's template.
    expect(nested.match(/renderItem=\{\(\{ item \}\) => \(/g)).toHaveLength(2)
    expect(nested).toContain('{item.title}')
  })

  it('identifier collisions resolve with suffixes; reserved names are never shadowed', () => {
    expect(dupe.match(/const \[flights, setFlights\]/g)).toHaveLength(1)
    expect(dupe.match(/const \[flights2, setFlights2\]/g)).toHaveLength(1)
    expect(dupe.match(/const \[router1, setRouter1\]/g)).toHaveLength(1)
    expect(dupe).toContain('data={flights}')
    expect(dupe).toContain('data={flights2}')
    expect(dupe).toContain('data={router1}')
    expect(dupe).toContain('const loadFlights2 =')
    expect(dupe).toContain('const loadRouter1 =')
    // The reserved name itself is never emitted as an identifier declaration.
    expect(dupe).not.toContain('const [router,')
    expect(dupe).not.toContain('const router =')
  })

  it('static lists emit no api anything (byte-compat with pre-P0-3 emission)', () => {
    expect(plain).not.toContain('fetch(')
    expect(plain).not.toContain('useState')
    expect(plain).not.toMatch(/from 'react'/)
    expect(plain).not.toContain('dataSourceKind')
    // Static data literal + plain (non-conditional) empty design.
    expect(plain).toContain("data={[{ title: 'Item 1' }, { title: 'Item 2' }, { title: 'Item 3' }]}")
    expect(plain).toContain('ListEmptyComponent={')
    expect(plain).not.toContain('Loading ? (')
    expect(plain).toContain('sections={')
  })

  it('every generated file parses as valid JSX/TS', async () => {
    const { parse } = await import('@babel/parser')
    for (const [path, content] of files) {
      expect(() => parse(content, { sourceType: 'module', plugins: ['jsx', 'typescript'] }), path).not.toThrow()
    }
  })
})
