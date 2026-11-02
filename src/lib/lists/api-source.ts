/*
 * API data sources (Phase 4, P0-3) — REAL fetch, no mock layer.
 *
 * A list (flatlist/sectionlist) can switch its data source from the static
 * array (the array editor) to a live API endpoint. The configuration lives in
 * node.props (registry-driven, inspector-generic); THIS module is the one
 * resolver every consumer reads it through:
 *
 *   preview     useApiSource() — the browser fetches the endpoint FOR REAL
 *                (edit + sim mode alike; module cache + in-flight dedup)
 *   codegen     apiIdentifiers() + the loader body builders — the generated
 *                app fetches for real on device (useState/useCallback/useEffect)
 *   inspector   the Data-source section's live status row (same cache)
 *
 * Honesty rules (no mocking, anywhere):
 *  - No canned responses, no fake latency, no sampled rows. fetch() is fetch().
 *  - Errors are the REAL errors: network failures, non-2xx statuses (thrown as
 *    `Request failed with status N`), CORS blocks (the browser's "Failed to
 *    fetch"). They surface in the error state exactly as the device would
 *    surface them (minus CORS, which only applies to the web canvas).
 *  - Loading / error / empty states are the USER-DESIGNED list roles
 *    (listRole 'loading' / 'error' / 'empty'). Nothing designed → nothing
 *    rendered. The builder never injects UI the user didn't draw.
 *
 * Safety: the collection path is dotted identifiers only; headers parse from
 * `Key: Value` lines; the request body is emitted verbatim as a string. None
 * of it can become arbitrary code in generated files.
 */

import { useSyncExternalStore } from 'react'
import type { ProjectNode, Screen } from '@/lib/project/types'

/* ────────────────────────────────────────────────────────────────────────────
 * Configuration (parsed from node.props)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ApiSourceConfig {
  url: string
  method: 'GET' | 'POST'
  /** Dotted path to the rows array inside the JSON response ('' = the
   *  response body itself is the array). Identifier segments only. */
  collectionPath: string
  /** Request headers (Key: Value), verbatim values. */
  headers: Record<string, string>
  /** Raw request body (sent with POST only). */
  body: string
  /** Pull-to-refresh: FlatList refreshing + onRefresh re-run the loader. */
  refresh: boolean
}

/** The registry prop keys the API data source reads (also takeAttr'd out of
 *  list emission — they are builder config, never FlatList attributes). */
export const API_PROP_KEYS = [
  'dataSourceKind',
  'apiUrl',
  'apiMethod',
  'apiCollectionPath',
  'apiHeaders',
  'apiBody',
  'refreshEnabled'
] as const

/** True when the node's data source is the API (vs. the static array). */
export function isApiSource(props: Record<string, unknown>): boolean {
  return props.dataSourceKind === 'api'
}

/** Parse `Key: Value` header lines → a record. Blank/comment lines drop;
 *  lines without a colon drop (forgiving, never throws). */
export function parseHeadersText(text: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof text !== 'string') return out
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const colon = trimmed.indexOf(':')
    if (colon <= 0) continue
    const key = trimmed.slice(0, colon).trim()
    const value = trimmed.slice(colon + 1).trim()
    if (key !== '' && value !== '') out[key] = value
  }
  return out
}

const PATH_SEGMENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Validate a dotted collection path: 1–6 identifier segments, or '' (the
 *  response itself). Returns the segments, or null when malformed. */
export function collectionPathSegments(path: unknown): string[] | null {
  if (path === undefined || path === null) return []
  if (typeof path !== 'string') return null
  const trimmed = path.trim()
  if (trimmed === '') return []
  const segs = trimmed.split('.').map((s) => s.trim()).filter((s) => s.length > 0)
  if (segs.length === 0 || segs.length > 6) return null
  if (!segs.every((s) => PATH_SEGMENT.test(s))) return null
  return segs
}

/** The effective API config of a list node; null when not in API mode or the
 *  URL is empty (an unconfigured API list behaves like an empty static one —
 *  honest, no defaults invented). */
export function apiConfigFromProps(props: Record<string, unknown>): ApiSourceConfig | null {
  if (!isApiSource(props)) return null
  const url = typeof props.apiUrl === 'string' ? props.apiUrl.trim() : ''
  if (url === '') return null
  const segs = collectionPathSegments(props.apiCollectionPath)
  if (segs === null) return null
  return {
    url,
    method: props.apiMethod === 'POST' ? 'POST' : 'GET',
    collectionPath: segs.join('.'),
    headers: parseHeadersText(props.apiHeaders),
    body: typeof props.apiBody === 'string' ? props.apiBody : '',
    refresh: props.refreshEnabled === true
  }
}

/** Stable cache key for one config (config identity across consumers). */
export function apiConfigKey(config: ApiSourceConfig): string {
  const headers = Object.keys(config.headers)
    .sort()
    .map((k) => `${k}: ${config.headers[k]}`)
    .join('\n')
  return JSON.stringify([config.url, config.method, config.collectionPath, headers, config.method === 'POST' ? config.body : ''])
}

/* ────────────────────────────────────────────────────────────────────────────
 * Response coercion (shared by the live fetch and — structurally — by the
 * generated loader; see codegen/screens.ts)
 * ──────────────────────────────────────────────────────────────────────────── */

function walkPath(value: unknown, segments: string[]): unknown {
  let cur: unknown = value
  for (const seg of segments) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

/**
 * FLATLIST rows from a JSON response: the array at the collection path,
 * passed through UNTOUCHED (real API rows keep their shape — deep bindings
 * like {item.address.city} resolve against the real objects). Not an array
 * at the path → [] (the honest empty result; the error state stays clear).
 */
export function coerceApiRows(json: unknown, collectionPath: string): unknown[] {
  const segs = collectionPath === '' ? [] : collectionPath.split('.')
  const found = walkPath(json, segs)
  return Array.isArray(found) ? found : []
}

/** The RN SectionList section shape the static editor also emits. */
export interface ApiSection {
  header: string
  data: unknown[]
}

/**
 * SECTIONLIST sections from a JSON response: the array at the collection
 * path, each entry coerced to { header, data }. Two well-known aliases are
 * accepted per section (documented in the registry field): header text from
 * `header` or `title`, rows from `data` or `items` — covering both the RN
 * convention and the editor's own static shape. No other guessing.
 */
export function coerceApiSections(json: unknown, collectionPath: string): ApiSection[] {
  const raw = coerceApiRows(json, collectionPath)
  return sectionsFromRows(raw)
}

/**
 * SECTIONLIST sections from ALREADY-EXTRACTED rows (the live cache's `data` —
 * the array at the collection path). The live preview consumes this: the
 * generated code performs the identical per-row mapping inline (see
 * apiDeclarationLines' sectionlist branch).
 */
export function sectionsFromRows(rows: unknown): ApiSection[] {
  const raw = Array.isArray(rows) ? rows : []
  const out: ApiSection[] = []
  for (const row of raw) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
    const rec = row as Record<string, unknown>
    const header =
      typeof rec.header === 'string' ? rec.header : typeof rec.title === 'string' ? rec.title : ''
    const data = Array.isArray(rec.data) ? rec.data : Array.isArray(rec.items) ? rec.items : []
    out.push({ header, data })
  }
  return out
}

/* ────────────────────────────────────────────────────────────────────────────
 * Generated-code identifiers
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ApiIdentifiers {
  /** The rows/sections useState variable, e.g. `flights`. */
  data: string
  loading: string
  error: string
  /** Only when refresh is enabled. */
  refreshing: string | null
  /** The loader function, e.g. `loadFlights`. */
  loader: string
}

const IDENT_OK = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Identifiers generated code binds at component scope — API lists must never
 *  shadow them (extends the screen-state blocklist with the React hooks the
 *  API emission itself brings). */
const RESERVED = new Set(['router', 'colors', 'response', 'json', 'useCallback', 'useEffect', 'fetch'])

function camelSafe(name: string): string | null {
  // Letters/digits/underscores only, lowered, leading digit → 'list' prefix.
  const cleaned = name.replace(/[^A-Za-z0-9_$]+/g, '')
  if (cleaned === '') return null
  const lowered = cleaned.charAt(0).toLowerCase() + cleaned.slice(1)
  return /^[A-Za-z_$]/.test(lowered) ? lowered : `list${lowered}`
}

/**
 * Derive the identifier set for EVERY API list on a screen (call once per
 * file, tree order — deterministic). Bases come from the node's name (when a
 * valid identifier) or its type; they never collide with user-declared state
 * entries, builder-reserved names, or each other (numeric suffixes resolve
 * conflicts in tree order).
 */
export function deriveApiIdentifiers(apiNodes: ProjectNode[], screen: Screen | undefined): Map<string, ApiIdentifiers> {
  const taken = new Set<string>(RESERVED)
  for (const entry of screen?.state ?? []) taken.add(entry.name)
  const out = new Map<string, ApiIdentifiers>()
  const usedBases = new Set<string>()
  for (const node of apiNodes) {
    const base = node.name ? camelSafe(node.name) : null
    const fallback = node.type === 'sectionlist' ? 'sections' : 'list'
    let chosen = base !== null && !taken.has(base) && !usedBases.has(base) ? base : null
    if (chosen === null) {
      const root = base !== null ? base : fallback
      let n = usedBases.has(root) ? 2 : 1
      if (n === 1 && !taken.has(root)) chosen = root
      else {
        do {
          chosen = `${root}${n}`
          n += 1
        } while (taken.has(chosen) || usedBases.has(chosen))
      }
    }
    usedBases.add(chosen)
    const refresh = node.props.refreshEnabled === true
    out.set(node.id, {
      data: chosen,
      loading: `${chosen}Loading`,
      error: `${chosen}Error`,
      refreshing: refresh ? `${chosen}Refreshing` : null,
      loader: `load${chosen.charAt(0).toUpperCase()}${chosen.slice(1)}`
    })
  }
  return out
}

/* ────────────────────────────────────────────────────────────────────────────
 * The {error} binding (text content inside the ERROR role design)
 * ──────────────────────────────────────────────────────────────────────────── */

const ERROR_BINDING_RE = /^\{error(\.message)?\}$/

/** Parse a whole-string `{error}` / `{error.message}` binding; null otherwise. */
export function parseErrorBinding(text: unknown): boolean {
  return typeof text === 'string' && ERROR_BINDING_RE.test(text.trim())
}

/* ────────────────────────────────────────────────────────────────────────────
 * The REAL fetch client — module cache + in-flight dedup + subscribe.
 * The browser performs the actual network request (edit AND sim mode): this
 * is the same fetch the generated app performs, run by the canvas.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ApiFetchState {
  status: 'idle' | 'loading' | 'success' | 'error'
  /** Success: the coerced rows/sections (arbitrary JSON shapes, untouched). */
  data?: unknown[]
  /** The real error message (network / status / CORS — as the platform reports it). */
  error?: string
  /** ms from request start to settlement (the inspector status line shows it). */
  durationMs?: number
  fetchedAt?: number
}

interface ApiCacheEntry {
  state: ApiFetchState
  promise: Promise<void> | null
  listeners: Set<() => void>
}

const cache = new Map<string, ApiCacheEntry>()

function emit(entry: ApiCacheEntry): void {
  for (const fn of entry.listeners) fn()
}

/**
 * Run the real request against one cache entry (shared by the first fetch and
 * Reload — Reload reuses the entry so its subscriber set survives).
 */
function startFetch(entry: ApiCacheEntry, config: ApiSourceConfig): Promise<void> {
  const started = Date.now()
  const request: RequestInit = { method: config.method }
  const headerKeys = Object.keys(config.headers)
  if (headerKeys.length > 0) request.headers = { ...config.headers }
  if (config.method === 'POST' && config.body !== '') request.body = config.body
  entry.state = { status: 'loading' }
  entry.promise = (async () => {
    try {
      const response = await fetch(config.url, request)
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
      const json: unknown = await response.json()
      entry.state = {
        status: 'success',
        data: coerceApiRows(json, config.collectionPath),
        durationMs: Date.now() - started,
        fetchedAt: Date.now()
      }
    } catch (e) {
      entry.state = {
        status: 'error',
        error: e instanceof Error ? e.message : 'Something went wrong',
        durationMs: Date.now() - started,
        fetchedAt: Date.now()
      }
    } finally {
      entry.promise = null
      emit(entry)
    }
  })()
  emit(entry)
  return entry.promise
}

function entryFor(key: string): ApiCacheEntry {
  let entry = cache.get(key)
  if (!entry) {
    entry = { state: IDLE, promise: null, listeners: new Set() }
    cache.set(key, entry)
  }
  return entry
}

/**
 * Fetch one config FOR REAL (deduped: concurrent callers share one request).
 * Never throws — settlement is recorded in the cache state. A SETTLED entry
 * is not refetched (the cache serves it); use reloadApiSource to force it.
 */
export function fetchApiSource(config: ApiSourceConfig, key: string = apiConfigKey(config)): Promise<void> {
  const entry = entryFor(key)
  if (entry.promise) return entry.promise
  if (entry.state.status === 'loading') return Promise.resolve()
  if (entry.state.status === 'success' || entry.state.status === 'error') return Promise.resolve()
  return startFetch(entry, config)
}

/** Refetch for real, reusing the cache entry (its subscribers stay live). */
export function reloadApiSource(config: ApiSourceConfig, key: string = apiConfigKey(config)): Promise<void> {
  const entry = entryFor(key)
  if (entry.promise) return entry.promise
  return startFetch(entry, config)
}

function subscribeApi(entry: ApiCacheEntry, onChange: () => void): () => void {
  entry.listeners.add(onChange)
  return () => {
    entry.listeners.delete(onChange)
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * React binding — useApiSource(config | null)
 *
 * The hook is called unconditionally by every PreviewNode (rules of hooks);
 * a null config (static lists, non-lists) is a cheap idle return. useSyncExternalStore
 * keeps re-renders keyed to the cache entry's own listener set — no polling.
 * The subscribe function is cached per key (stable identity — React would
 * resubscribe on every render otherwise); the SNAPSHOT is the cache entry's
 * state object, replaced only on settlement (referentially stable in between).
 * ──────────────────────────────────────────────────────────────────────────── */

const IDLE: ApiFetchState = { status: 'idle' }
const NOOP_SUBSCRIBE = (): (() => void) => (): void => {}
const IDLE_SNAPSHOT = (): ApiFetchState => IDLE

const subscribers = new Map<string, (onStoreChange: () => void) => () => void>()

function subscribeFor(key: string, config: ApiSourceConfig): (onStoreChange: () => void) => () => void {
  let fn = subscribers.get(key)
  if (!fn) {
    fn = (onStoreChange: () => void) => {
      // The real request starts on first subscribe (mount / config change)
      // and only then — settled results ride the cache across re-renders.
      const entry = entryFor(key)
      if (!entry.promise && entry.state.status === 'idle') void startFetch(entry, config)
      return subscribeApi(entry, onStoreChange)
    }
    subscribers.set(key, fn)
  }
  return fn
}

export function useApiSource(config: ApiSourceConfig | null): ApiFetchState {
  const key = config !== null ? apiConfigKey(config) : null
  return useSyncExternalStore(
    key !== null && config !== null ? subscribeFor(key, config) : NOOP_SUBSCRIBE,
    key !== null ? () => cache.get(key)?.state ?? IDLE : IDLE_SNAPSHOT,
    IDLE_SNAPSHOT
  )
}

/** The live status line for the inspector (never app UI — editor chrome). */
export function apiStatusLine(state: ApiFetchState): string {
  if (state.status === 'idle') return 'Not fetched'
  if (state.status === 'loading') return 'Fetching…'
  if (state.status === 'error') return `Error: ${state.error ?? 'unknown'}`
  return `Loaded ${state.data?.length ?? 0} rows · ${state.durationMs ?? 0} ms`
}
