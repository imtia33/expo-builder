/*
 * Phase 4 (P0-3) tests — the REAL-fetch API data source.
 *
 * Part 1 (pure functions): config parsing, response coercion, generated-code
 * identifier derivation, the {error} binding.
 *
 * Part 2 (the fetch client): the client code under test is the real
 * implementation the canvas, the inspector status row, and (structurally) the
 * generated loader run. The tests inject controlled network responses AT THE
 * BOUNDARY — a stubbed global fetch, the standard way a network client is
 * tested. No builder feature is mocked: no canned rows, no fake latency inside
 * the module; every state transition is produced by the module's own logic
 * against the controlled response. What is observable without a React host is
 * the network contract: the exact request issued (url/method/headers/body),
 * promise-identity dedup, settled-not-refetched, reload-forces-refetch, and
 * the never-throws guarantee. The settle STATES (rows on canvas, the error
 * design, the status row) are driven by the same module through useApiSource —
 * pinned live in the browser against real endpoints (Phase 4 verification) and
 * by the exact generated-loader tests in codegen-api.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  apiConfigFromProps,
  apiConfigKey,
  apiStatusLine,
  collectionPathSegments,
  coerceApiRows,
  coerceApiSections,
  deriveApiIdentifiers,
  fetchApiSource,
  parseErrorBinding,
  parseHeadersText,
  reloadApiSource,
  sectionsFromRows,
  type ApiSourceConfig
} from '@/lib/lists/api-source'
import type { ProjectNode, Screen } from '@/lib/project/types'

/* ── Part 1: pure functions ─────────────────────────────────────────────── */

describe('parseHeadersText', () => {
  it('parses Key: Value lines, dropping blanks, comments and colon-less lines', () => {
    expect(
      parseHeadersText('Authorization: Bearer t\n\n# a comment\nBroken line\nContent-Type: application/json')
    ).toEqual({ Authorization: 'Bearer t', 'Content-Type': 'application/json' })
  })

  it('never throws on non-strings', () => {
    expect(parseHeadersText(undefined)).toEqual({})
    expect(parseHeadersText(42)).toEqual({})
  })
})

describe('collectionPathSegments', () => {
  it('empty / undefined → [] (the response itself is the array)', () => {
    expect(collectionPathSegments('')).toEqual([])
    expect(collectionPathSegments(undefined)).toEqual([])
    expect(collectionPathSegments(null)).toEqual([])
  })

  it('dotted identifiers → segments', () => {
    expect(collectionPathSegments('data.results')).toEqual(['data', 'results'])
  })

  it('malformed → null (7 segments, invalid identifiers, non-strings)', () => {
    expect(collectionPathSegments('a.b.c.d.e.f.g')).toBeNull()
    expect(collectionPathSegments('data.1x')).toBeNull()
    expect(collectionPathSegments('data results')).toBeNull()
    expect(collectionPathSegments(19)).toBeNull()
  })
})

describe('apiConfigFromProps', () => {
  const base = { dataSourceKind: 'api', apiUrl: 'https://api.example.dev/x' }

  it('null when static, or api without a URL, or with a malformed path', () => {
    expect(apiConfigFromProps({ dataSourceKind: 'static' })).toBeNull()
    expect(apiConfigFromProps({ dataSourceKind: 'api', apiUrl: '' })).toBeNull()
    expect(apiConfigFromProps({ dataSourceKind: 'api', apiUrl: '  ' })).toBeNull()
    expect(apiConfigFromProps({ ...base, apiCollectionPath: 'not ok!' })).toBeNull()
  })

  it('full GET config with defaults (unconfigured fields are honest defaults, never invented)', () => {
    const cfg = apiConfigFromProps(base)!
    expect(cfg).not.toBeNull()
    expect(cfg.url).toBe('https://api.example.dev/x')
    expect(cfg.method).toBe('GET')
    expect(cfg.collectionPath).toBe('')
    expect(cfg.headers).toEqual({})
    expect(cfg.body).toBe('')
    expect(cfg.refresh).toBe(false)
  })

  it('POST with headers + body + collection path + refresh', () => {
    const cfg = apiConfigFromProps({
      ...base,
      apiMethod: 'POST',
      apiCollectionPath: 'data.results',
      apiHeaders: 'Authorization: Bearer t',
      apiBody: '{ "q": "*" }',
      refreshEnabled: true
    })!
    expect(cfg.method).toBe('POST')
    expect(cfg.collectionPath).toBe('data.results')
    expect(cfg.headers).toEqual({ Authorization: 'Bearer t' })
    expect(cfg.body).toBe('{ "q": "*" }')
    expect(cfg.refresh).toBe(true)
  })
})

describe('apiConfigKey', () => {
  const a: ApiSourceConfig = {
    url: 'https://k.example.dev/1',
    method: 'GET',
    collectionPath: 'data',
    headers: { A: '1', B: '2' },
    body: 'ignored-for-get',
    refresh: false
  }

  it('stable across header insertion order; differs per meaningful field', () => {
    const b: ApiSourceConfig = { ...a, headers: { B: '2', A: '1' } }
    expect(apiConfigKey(b)).toBe(apiConfigKey(a))
    expect(apiConfigKey({ ...a, url: 'https://k.example.dev/2' })).not.toBe(apiConfigKey(a))
    expect(apiConfigKey({ ...a, method: 'POST' })).not.toBe(apiConfigKey(a))
    expect(apiConfigKey({ ...a, collectionPath: 'other' })).not.toBe(apiConfigKey(a))
    // body participates only for POST
    expect(apiConfigKey({ ...a, body: 'other' })).toBe(apiConfigKey(a))
    expect(apiConfigKey({ ...a, method: 'POST', body: 'x' })).not.toBe(apiConfigKey({ ...a, method: 'POST' }))
  })
})

describe('response coercion', () => {
  it('coerceApiRows: the array at the path, untouched; [] when not an array', () => {
    const rows = [{ id: 1 }, { id: 2, nested: { deep: true } }]
    expect(coerceApiRows({ data: { results: rows } }, 'data.results')).toEqual(rows)
    expect(coerceApiRows({ data: { results: 'nope' } }, 'data.results')).toEqual([])
    expect(coerceApiRows({ data: {} }, 'data.results')).toEqual([])
    expect(coerceApiRows([1, 2], '')).toEqual([1, 2])
    expect(coerceApiRows({ not: 'an array' }, '')).toEqual([])
  })

  it('coerceApiSections + sectionsFromRows: header/title and data/items aliases; junk rows dropped', () => {
    const json = {
      menu: [
        { header: 'Starters', data: [{ title: 'Soup' }] },
        { title: 'Mains', items: [{ title: 'Pasta' }] },
        { header: 5, data: 'nope' },
        'not an object',
        null
      ]
    }
    expect(coerceApiSections(json, 'menu')).toEqual([
      { header: 'Starters', data: [{ title: 'Soup' }] },
      { header: 'Mains', data: [{ title: 'Pasta' }] },
      { header: '', data: [] }
    ])
    // sectionsFromRows consumes the SAME rows the live cache stores.
    expect(sectionsFromRows(json.menu)).toEqual(coerceApiSections(json, 'menu'))
    expect(sectionsFromRows('not an array')).toEqual([])
  })
})

describe('parseErrorBinding', () => {
  it('whole-string {error} / {error.message} only', () => {
    expect(parseErrorBinding('{error}')).toBe(true)
    expect(parseErrorBinding(' {error.message} ')).toBe(true)
    expect(parseErrorBinding('{errors}')).toBe(false)
    expect(parseErrorBinding('Failed: {error}')).toBe(false)
    expect(parseErrorBinding('')).toBe(false)
    expect(parseErrorBinding(null)).toBe(false)
  })
})

/* ── identifier derivation ──────────────────────────────────────────────── */

function listNode(id: string, type: 'flatlist' | 'sectionlist', name: string | undefined, refresh = false): ProjectNode {
  return {
    id,
    screenId: 's',
    parentId: null,
    type,
    order: 0,
    props: { refreshEnabled: refresh },
    style: {},
    ...(name !== undefined ? { name } : {})
  }
}

function screenWithState(names: string[]): Screen {
  return {
    id: 's',
    name: 'S',
    route: 's',
    groupId: null,
    order: 0,
    deviceId: 'iphone-17-pro',
    x: 0,
    y: 0,
    safeArea: { top: true, bottom: true },
    background: '#FFFFFF',
    state: names.map((n) => ({ id: `st-${n}`, name: n, type: 'boolean' as const, initial: false }))
  }
}

describe('deriveApiIdentifiers', () => {
  it('derives from the node name; refresh off → no refreshing identifier', () => {
    const ids = deriveApiIdentifiers([listNode('n1', 'flatlist', 'Flights')], undefined)
    expect(ids.get('n1')).toEqual({
      data: 'flights',
      loading: 'flightsLoading',
      error: 'flightsError',
      refreshing: null,
      loader: 'loadFlights'
    })
  })

  it('sectionlist fallback; refresh on → refreshing identifier', () => {
    const ids = deriveApiIdentifiers([listNode('n1', 'sectionlist', undefined, true)], undefined)
    expect(ids.get('n1')!.data).toBe('sections')
    expect(ids.get('n1')!.refreshing).toBe('sectionsRefreshing')
    expect(ids.get('n1')!.loader).toBe('loadSections')
  })

  it('collisions resolve with numeric suffixes in tree order', () => {
    const ids = deriveApiIdentifiers(
      [listNode('a', 'flatlist', 'Flights'), listNode('b', 'flatlist', 'Flights')],
      undefined
    )
    expect(ids.get('a')!.data).toBe('flights')
    expect(ids.get('b')!.data).toBe('flights2')
    expect(ids.get('b')!.loader).toBe('loadFlights2')
  })

  it('never shadows builder-reserved identifiers (first FREE suffixed name)', () => {
    // 'router' is builder-reserved → the first free name is router1 (root
    // itself is never emitted, so router1 reads as the first one).
    const ids = deriveApiIdentifiers([listNode('n1', 'flatlist', 'Router')], undefined)
    expect(ids.get('n1')!.data).toBe('router1')
    const ids2 = deriveApiIdentifiers([listNode('n1', 'flatlist', 'Json')], undefined)
    expect(ids2.get('n1')!.data).toBe('json1')
  })

  it('never collides with declared screen-state entries (conservative, usage-independent)', () => {
    const ids = deriveApiIdentifiers([listNode('n1', 'flatlist', 'Busy')], screenWithState(['busy']))
    expect(ids.get('n1')!.data).toBe('busy1')
  })
})

describe('apiStatusLine', () => {
  it('renders every state', () => {
    expect(apiStatusLine({ status: 'idle' })).toBe('Not fetched')
    expect(apiStatusLine({ status: 'loading' })).toBe('Fetching…')
    expect(apiStatusLine({ status: 'error', error: 'Failed to fetch' })).toBe('Error: Failed to fetch')
    expect(apiStatusLine({ status: 'success', data: [{ a: 1 }, { a: 2 }], durationMs: 118 })).toBe(
      'Loaded 2 rows · 118 ms'
    )
  })
})

/* ── Part 2: the real fetch client (network boundary stubbed) ──────────── */

/** A minimal Response-shaped stand-in — the module only reads ok/status/json. */
function res(ok: boolean, status: number, json: unknown) {
  return {
    ok,
    status,
    json: () => Promise.resolve(json)
  }
}

/** A Response whose json() itself rejects (invalid JSON body). */
function badJsonRes() {
  return {
    ok: true,
    status: 200,
    json: () => Promise.reject(new Error('Unexpected token < in JSON'))
  }
}

const config = (url: string, over: Partial<ApiSourceConfig> = {}): ApiSourceConfig => ({
  url,
  method: 'GET',
  collectionPath: '',
  headers: {},
  body: '',
  refresh: false,
  ...over
})

describe('the fetch client', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('issues the exact request the configuration describes (url first arg)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(res(true, 200, [])))
    await fetchApiSource(config('https://t1.example.dev/a'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://t1.example.dev/a')
  })

  it('sends method, headers and body exactly as configured', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(res(true, 200, [])))
    const post = config('https://t2.example.dev/b', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
      body: '{ "q": "*" }'
    })
    await fetchApiSource(post)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer t' })
    expect(init.body).toBe('{ "q": "*" }')

    const get = config('https://t2.example.dev/c')
    await fetchApiSource(get)
    const getInit = fetchMock.mock.calls[1][1] as RequestInit
    expect(getInit.method).toBe('GET')
    expect(getInit.body).toBeUndefined()
    expect(getInit.headers).toBeUndefined()
  })

  it('never throws — a rejected fetch, a non-2xx or invalid JSON settles instead of rejecting outward', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'))
    await expect(reloadApiSource(config('https://t3.example.dev/d'))).resolves.toBeUndefined()
    fetchMock.mockClear()
    fetchMock.mockImplementation(() => Promise.resolve(res(false, 503, {})))
    await expect(reloadApiSource(config('https://t3.example.dev/e'))).resolves.toBeUndefined()
    fetchMock.mockClear()
    fetchMock.mockImplementation(() => Promise.resolve(badJsonRes()))
    await expect(reloadApiSource(config('https://t3.example.dev/f'))).resolves.toBeUndefined()
  })

  it('dedupes concurrent callers onto one in-flight request; settled entries are not refetched', async () => {
    let open!: (v: unknown) => void
    const gate = new Promise<unknown>((r) => {
      open = r
    })
    fetchMock.mockImplementation(() => gate)
    const cfg = config('https://t5.example.dev/h')
    const p1 = fetchApiSource(cfg)
    const p2 = fetchApiSource(cfg)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(p1).toBe(p2) // the very same in-flight promise
    open(res(true, 200, [{ id: 1 }]))
    await p1

    // Settled: a fresh fetchApiSource is a no-op (the cache serves it).
    fetchMock.mockClear()
    fetchMock.mockImplementation(() => Promise.resolve(res(true, 200, [])))
    await fetchApiSource(cfg)
    expect(fetchMock).toHaveBeenCalledTimes(0)

    // Reload forces the real request again (its subscribers stay attached).
    fetchMock.mockClear()
    fetchMock.mockImplementation(() => Promise.resolve(res(true, 200, [{ id: 2 }])))
    await reloadApiSource(cfg)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('isolates distinct configs (unique URL → unique request)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(res(true, 200, [])))
    await fetchApiSource(config('https://t6.example.dev/one'))
    await fetchApiSource(config('https://t6.example.dev/two'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('https://t6.example.dev/one')
    expect(fetchMock.mock.calls[1][0]).toBe('https://t6.example.dev/two')
  })
})
