'use client'
/*
 * Project store — the single mutation funnel for the whole builder.
 *
 * Everything (sidebar tree, canvas, inspector, codegen, sim) reads from this
 * store and mutates through these actions. Undo/redo is snapshot-based
 * (project + selection + active screen, like the Revyme history model):
 * every mutation outside a gesture pushes the pre-state; mutations inside a
 * gesture (a drag, a slider scrub) coalesce into one entry.
 *
 * Persistence: localStorage via zustand persist (key 'expoforge:project:v2').
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { DEVICE_PRESETS, deviceById, type PlatformId } from '@/components/builder/screens/device-presets'
import { getEntry } from '@/expoforge/registry'
import { isListEntryType, type ListRole } from '@/lib/lists/bindings'
import { resolveStateValues, stateEntry, normalizeStateEntries } from '@/lib/state/screen-state'
import { DEFAULT_THEME_COLORS } from '@/lib/paint'
import { HistoryManager, installHistoryWatchdog } from './history'
import type {
  AnimationSpec,
  CodeNodePatch,
  CustomTabBarConfig,
  EditorUiState,
  InsertTool,
  InteractionAction,
  NavConfig,
  NavKind,
  NodeAnimations,
  NodeInteractions,
  ProjectData,
  ProjectNode,
  Screen,
  ScreenGroup,
  ScreenStateEntry,
  Selection,
  SimState,
  StackNavConfig,
  TabBarImplementation,
  TabsNavConfig
} from './types'

/* ────────────────────────────────────────────────────────────────────────────
 * Small helpers
 * ──────────────────────────────────────────────────────────────────────────── */

let uidCounter = 0
function uid(prefix: string): string {
  uidCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${uidCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'screen'
  )
}

function uniqueSlug(base: string, taken: Set<string>): string {
  let candidate = base
  let i = 2
  while (taken.has(candidate)) candidate = `${base}-${i++}`
  return candidate
}

/** "Screen 4" → next is Screen 5 (falls back to count+1). */
function nextScreenNumber(screens: Screen[]): number {
  let max = 0
  for (const s of screens) {
    const m = /^Screen (\d+)$/.exec(s.name)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

function nextGroupName(groups: ScreenGroup[]): number {
  let max = 0
  for (const g of groups) {
    const m = /^Group (\d+)$/.exec(g.name)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

/** Closest device preset of `platform` to a reference size (aspect-ratio aware). */
function closestDevice(platform: PlatformId, width: number, height: number) {
  let best: (typeof DEVICE_PRESETS)[number] | null = null
  let bestScore = Infinity
  for (const d of DEVICE_PRESETS) {
    if (d.platform !== platform) continue
    // Compare physical size + aspect; aspect matters more for artboard feel.
    const sizeDiff = Math.abs(d.width - width) / width + Math.abs(d.height - height) / height
    const aspectDiff = Math.abs(d.width / d.height - width / height)
    const score = aspectDiff * 2 + sizeDiff
    if (score < bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

/* ────────────────────────────────────────────────────────────────────────────
 * Navigation defaults (LOCKED — preview + inspector + codegen all read these)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Default tab icons, one per screen index (cycled). Phosphor set. */
export const DEFAULT_TAB_ICONS = [
  'ph:house',
  'ph:compass',
  'ph:user-circle',
  'ph:gear-six',
  'ph:bell',
  'ph:bookmark-simple',
  'ph:chat-circle-text',
  'ph:shopping-bag',
  'ph:calendar-blank',
  'ph:map-pin'
]

export function defaultCustomTabBarConfig(base?: Partial<TabsNavConfig & CustomTabBarConfig>): CustomTabBarConfig {
  return {
    activeColor: base?.activeColor ?? '#007AFF',
    inactiveColor: base?.inactiveColor ?? '#8E8E93',
    barBackground: base?.barBackground ?? '#F8F8F8',
    barHeight: base?.barHeight ?? 56,
    showLabels: base?.showLabels ?? true,
    labelSize: base?.labelSize ?? 10,
    labelWeight: base?.labelWeight ?? '500',
    iconSize: base?.iconSize ?? 24,
    showTopBorder: base?.showTopBorder ?? true,
    borderTopColor: base?.borderTopColor ?? '#C6C6C8',
    borderTopWidth: base?.borderTopWidth ?? 1,
    animation: 'spring',
    springDamping: 12,
    springStiffness: 170
  }
}

export function defaultTabsConfig(screens: Array<{ id: string; name: string }>): TabsNavConfig {
  return {
    impl: 'native',
    position: 'bottom',
    showLabels: true,
    activeColor: '#007AFF',
    inactiveColor: '#8E8E93',
    barBackground: '#F8F8F8',
    barHeight: 52,
    labelSize: 10,
    labelWeight: '500',
    iconSize: 24,
    showTopBorder: true,
    borderTopColor: '#C6C6C8',
    borderTopWidth: 1,
    items: screens.map((s, i) => ({
      screenId: s.id,
      label: s.name,
      icon: DEFAULT_TAB_ICONS[i % DEFAULT_TAB_ICONS.length]
    })),
    custom: defaultCustomTabBarConfig()
  }
}

export function defaultStackConfig(): StackNavConfig {
  return {
    headerShown: true,
    headerBg: '#FFFFFF',
    headerTitleColor: '#111111',
    headerTitleSize: 17,
    headerTintColor: '#007AFF',
    animation: 'default',
    presentation: 'card'
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Canvas placement — deterministic non-overlapping positions
 * ──────────────────────────────────────────────────────────────────────────── */

const PLACE_ORIGIN = 120
const PLACE_STEP_X = 80
const PLACE_STEP_Y = 120
/** Search window around the origin. */
const PLACE_SPAN = 6400
/** Extra clearance kept between artboards. */
const CLEAR_X = 56
const CLEAR_TOP = 34 // label row above the frame
const CLEAR_BOTTOM = 56

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function occupiedRects(data: ProjectData): Rect[] {
  return data.screens.map((s) => {
    const d = deviceById(s.deviceId)
    return { x: s.x - CLEAR_X, y: s.y - CLEAR_TOP, width: d.width + CLEAR_X * 2, height: d.height + CLEAR_TOP + CLEAR_BOTTOM }
  })
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function withinBounds(x: number, w: number): boolean {
  return x + w <= PLACE_ORIGIN + PLACE_SPAN
}

/**
 * First free position for a w×h block, scanning row-major from the origin
 * (optionally biased toward `prefer`). Deterministic; never overlaps an
 * existing artboard (with clearance).
 */
export function findFreePosition(w: number, h: number, prefer?: { x: number; y: number }): { x: number; y: number } {
  const rects = occupiedRects(useProjectStore.getState().data)
  const test = (x: number, y: number) => {
    const r: Rect = { x, y, width: w, height: h }
    return !rects.some((o) => rectsOverlap(r, o))
  }
  if (prefer) {
    const px = Math.max(0, Math.round((prefer.x - w / 2) / 8) * 8)
    const py = Math.max(0, Math.round((prefer.y - h / 2) / 8) * 8)
    // try the preferred spot and a few offsets around it
    const offsets = [0, 48, -48, 96, -96, 160, -160, 240, -240]
    for (const o of offsets) {
      if (test(px + o, py)) return { x: px + o, y: py }
      if (test(px, py + o)) return { x: px, y: py + o }
    }
  }
  for (let y = PLACE_ORIGIN; y <= PLACE_ORIGIN + PLACE_SPAN; y += PLACE_STEP_Y) {
    for (let x = PLACE_ORIGIN; withinBounds(x, w); x += PLACE_STEP_X) {
      if (test(x, y)) return { x, y }
    }
  }
  // Fallback: far below everything (should never happen within PLACE_SPAN).
  return { x: PLACE_ORIGIN, y: PLACE_ORIGIN + PLACE_SPAN + 800 }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Tree helpers (renderers, layers panel, codegen all use these)
 * ──────────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────────
 * Group canvas geometry (Figma-Section semantics)
 * ─────────────────────────────────────────────────────────────────────────── */

/** All descendant group ids of `id` (excluding itself). */
export function descendantGroupIds(data: ProjectData, id: string): string[] {
  const out: string[] = []
  const walk = (gid: string) => {
    for (const g of data.groups) {
      if (g.parentId === gid) {
        out.push(g.id)
        walk(g.id)
      }
    }
  }
  walk(id)
  return out
}

export interface CanvasRect {
  x: number
  y: number
  width: number
  height: number
}

/** Padding kept around the member artboards inside a group frame. */
export const GROUP_FRAME_PAD = { top: 34, right: 28, bottom: 28, left: 28 }

/**
 * Bounding frame of a group on the canvas: the union rect of every screen in
 * the group subtree (self + descendant groups) plus padding. Null when the
 * subtree holds no screens. Pure function over data — canvas chrome and
 * zoom-to-fit both use it.
 */
export function groupBounds(data: ProjectData, groupId: string): CanvasRect | null {
  const ids = new Set<string>([groupId, ...descendantGroupIds(data, groupId)])
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of data.screens) {
    if (!ids.has(s.groupId ?? '')) continue
    const d = deviceById(s.deviceId)
    minX = Math.min(minX, s.x)
    minY = Math.min(minY, s.y)
    maxX = Math.max(maxX, s.x + d.width)
    maxY = Math.max(maxY, s.y + d.height)
  }
  if (minX === Infinity) return null
  return {
    x: minX - GROUP_FRAME_PAD.left,
    y: minY - GROUP_FRAME_PAD.top,
    width: maxX - minX + GROUP_FRAME_PAD.left + GROUP_FRAME_PAD.right,
    height: maxY - minY + GROUP_FRAME_PAD.top + GROUP_FRAME_PAD.bottom
  }
}

/** Root-level groups (no parent) — the canvas draws frames for these only. */
export function rootGroups(data: ProjectData): ScreenGroup[] {
  return sortedGroups(data).filter((g) => g.parentId === null)
}

export interface TreeNode {
  node: ProjectNode
  children: TreeNode[]
}

export function childNodes(data: ProjectData, screenId: string, parentId: string | null): ProjectNode[] {
  const out: ProjectNode[] = []
  for (const id in data.nodes) {
    const n = data.nodes[id]
    if (n.screenId === screenId && n.parentId === parentId) out.push(n)
  }
  return out.sort((a, b) => a.order - b.order)
}

export function buildScreenTree(data: ProjectData, screenId: string): TreeNode[] {
  const build = (parentId: string | null): TreeNode[] =>
    childNodes(data, screenId, parentId).map((node) => ({ node, children: build(node.id) }))
  return build(null)
}

export function collectSubtree(data: ProjectData, nodeId: string): string[] {
  const out: string[] = [nodeId]
  const walk = (parentId: string) => {
    for (const id in data.nodes) {
      const n = data.nodes[id]
      if (n.parentId === parentId) {
        out.push(n.id)
        walk(n.id)
      }
    }
  }
  walk(nodeId)
  return out
}

/* ────────────────────────────────────────────────────────────────────────────
 * Store
 * ──────────────────────────────────────────────────────────────────────────── */

interface Snapshot {
  data: ProjectData
  ui: EditorUiState
  selection: Selection
  activeScreenId: string | null
}

/**
 * The session-scoped undo engine (docs/12 §1.2): gesture tokens, watchdog
 * releases, and REFERENCE snapshots — the store's copy-on-write rule makes
 * old `data` graphs safe to keep by reference (structural sharing, no deep
 * clones). Never persisted.
 */
const history = new HistoryManager<Snapshot>()
if (typeof window !== 'undefined') installHistoryWatchdog(history)

/** Test/tool hook: clear the session history (external document load / tests). */
export function resetProjectHistory(): void {
  history.clear()
}

export interface CreateGroupInput {
  name?: string
  navKind: NavKind
  /** 0..10, clamped. 0 = empty group (screens added later). */
  screenCount: number
  deviceId?: string
  /** Optional explicit screen display names (length may be < screenCount). */
  screenNames?: string[]
}

export interface InsertNodeInput {
  screenId: string
  type: string
  parentId?: string | null
  order?: number
  /** Placement rect in the parent's coordinate space (or the screen's). */
  rect?: { left: number; top: number; width?: number; height?: number | 'auto' }
  /** Phase 2: implementation variant the node is created with (registry
   *  implementations[]; e.g. view → 'safe-area', button → 'touchableopacity').
   *  Stored as node.impl — switchable later from the inspector. */
  impl?: string
  /** Phase 2: insert-time prop overrides written EXPLICITLY into node.props
   *  (visible + editable in the inspector immediately; e.g. a horizontal
   *  FlatList form inserts { horizontal: true }). Undefined values skip. */
  props?: Record<string, unknown>
}

interface ProjectState {
  data: ProjectData
  ui: EditorUiState
  selection: Selection
  activeScreenId: string | null
  sim: SimState
  /** Bumped on every committed mutation — cheap change signal for overlays. */
  revision: number
  past: Snapshot[]
  future: Snapshot[]

  /* gestures & undo */
  /**
   * Open (or join) a coalescing gesture — every commit inside becomes ONE
   * history entry. `token`: the dragging pointer's pointerId (recommended;
   * the watchdog can then release it even if pointerup is lost), 'keyboard'
   * for arrow-nudge batches, or undefined for anonymous nesting (scrub
   * fields, placement try/finally blocks).
   */
  beginGesture: (token?: number | 'keyboard') => void
  /** Close a gesture (idempotent; unknown tokens are a no-op). */
  endGesture: (token?: number | 'keyboard') => void
  /** Hard-release every open gesture (watchdog / tests / doc swap). */
  releaseGestures: () => void
  undo: () => void
  redo: () => void

  /* groups */
  createGroup: (input: CreateGroupInput) => string
  renameGroup: (id: string, name: string) => void
  deleteGroup: (id: string) => void
  moveGroup: (id: string, toIndex: number) => void
  /** Move a group's whole subtree on the canvas by a dp delta (one undo entry). */
  moveGroupCanvas: (id: string, dx: number, dy: number) => void
  setNavKind: (id: string, kind: NavKind) => void
  /** Switch the tab bar implementation (native ⇄ custom), preserving compatible settings. */
  setTabBarImpl: (id: string, impl: TabBarImplementation) => void
  patchTabsConfig: (id: string, patch: Partial<TabsNavConfig>) => void
  patchCustomTabBar: (id: string, patch: Partial<CustomTabBarConfig>) => void
  patchTabItem: (groupId: string, screenId: string, patch: { label?: string; icon?: string }) => void
  patchStackConfig: (id: string, patch: Partial<StackNavConfig>) => void

  /* screens */
  addScreen: (input?: {
    groupId?: string | null
    name?: string
    deviceId?: string
    at?: { x: number; y: number }
  }) => string
  renameScreen: (id: string, name: string) => void
  deleteScreen: (id: string) => void
  moveScreen: (id: string, toGroupId: string | null, toIndex: number) => void
  moveScreenCanvas: (id: string, x: number, y: number) => void
  setScreenDevice: (id: string, deviceId: string) => void
  setScreenSafeArea: (id: string, patch: Partial<{ top: boolean; bottom: boolean }>) => void
  setScreenBackground: (id: string, color: string | { token: string } | { type: 'linear-gradient'; angle: number; stops: { color: string; position: number }[] } | { type: 'radial-gradient'; stops: { color: string; position: number }[] }) => void
  /** Pin/unpin a screen's file to hand-written source (code-controlled screen). */
  setScreenCodeOverride: (id: string, content: string | null) => void

  /* platform — ONE editor-global target platform (no per-screen platform) */
  setGlobalPlatform: (platform: PlatformId) => void

  /* theme — plain-TS palette (Phase 1); tokens bind color fields, codegen
   * emits constants/theme.ts + hooks/useTheme.ts (no NativeWind). */
  setThemeToken: (name: string, value: { light: string; dark: string }) => void
  deleteThemeToken: (name: string) => void
  /** Preview theme mode — how tokens resolve on the canvas (not exported). */
  setThemeMode: (mode: 'light' | 'dark') => void

  /* nodes */
  insertNode: (input: InsertNodeInput) => string
  deleteNode: (id: string) => void
  moveNode: (id: string, parentId: string | null, order: number) => void
  setNodeProps: (id: string, patch: Record<string, unknown>) => void
  setNodeStyle: (id: string, patch: Record<string, unknown>) => void
  setNodeName: (id: string, name: string) => void
  toggleNodeHidden: (id: string) => void
  /** Switch implementation variant (registry implementations[]) keeping compatible props. */
  setNodeImpl: (id: string, implId: string) => void
  /** Phase 2: set the list role of a DIRECT child of a list node
   *  (flatlist/sectionlist). undefined role = 'item'. P0-3 adds the API
   *  loading / error state designs to the roster. */
  setNodeListRole: (id: string, role: ListRole) => void
  /** Phase 4 (P0-1): wire (or unwire with null) one event hook on a node to
   *  an interaction action. One undo entry per wiring change. */
  setNodeInteraction: (id: string, hook: string, action: InteractionAction | null) => void
  /** Phase 4 slice 2: replace one screen's state entries (Screen tab editor).
   *  One undo entry per edit; entries are normalized (identifier names,
   *  unique, initials coerced to their declared type). */
  setScreenState: (screenId: string, entries: ScreenStateEntry[]) => void
  /** Patch entering/exiting animation specs (undefined value removes the phase). */
  patchNodeAnimations: (id: string, patch: Partial<NodeAnimations>) => void
  /** Replace preserved verbatim attribute source (code-controlled props). */
  setNodeRawCodeProps: (id: string, raw: Record<string, string> | undefined) => void
  /** Apply parsed-back code edits to many nodes in ONE undo entry. */
  applyCodePatches: (screenId: string, patches: CodeNodePatch[]) => void

  /* selection & view */
  select: (selection: Selection) => void
  setActiveScreen: (id: string | null) => void
  setExpanded: (id: string, expanded: boolean) => void

  /* project */
  setProjectName: (name: string) => void

  /* simulation */
  setSim: (on: boolean) => void
  simNavigate: (artboardScreenId: string, targetScreenId: string, mode: 'push' | 'replace') => void
  simBack: (artboardScreenId: string) => void
  /** Phase 4 slice 2: write one live state value during sim (never undoable —
   *  ephemeral runtime state, like sim history). 'toggle' flips the current
   *  value (initial when never set). */
  simSetState: (screenId: string, name: string, value: boolean | string | number | 'toggle') => void
}

const EMPTY_DATA: ProjectData = {
  name: 'Untitled app',
  groups: [],
  screens: [],
  nodes: {},
  theme: { colors: { ...DEFAULT_THEME_COLORS } }
}

/**
 * REFERENCE snapshot — the pre-mutation state kept by undo. Valid because
 * every commit is copy-on-write (unchanged objects are shared, never
 * mutated); this is the memory-efficient replacement for the old
 * JSON.parse(JSON.stringify()) deep clone (docs/12 §1.2).
 */
function snapshotOf(s: { data: ProjectData; ui: EditorUiState; selection: Selection; activeScreenId: string | null }): Snapshot {
  return {
    data: s.data,
    ui: s.ui,
    selection: s.selection,
    activeScreenId: s.activeScreenId
  }
}

/** Drop sim history entries pointing at deleted screens; re-seed empties. */
function normalizeSim(sim: SimState, data: ProjectData): SimState {
  if (!sim.on) return sim
  const history: Record<string, string[]> = {}
  for (const s of data.screens) {
    const stack = (sim.history[s.id] ?? []).filter((id) => data.screens.some((x) => x.id === id))
    if (stack.length === 0) {
      history[s.id] = [firstScreenOf(data, s) ?? s.id]
    } else {
      history[s.id] = stack
    }
  }
  return { on: sim.on, history }
}

function firstScreenOf(data: ProjectData, s: Screen): string | null {
  if (s.groupId == null) return s.id
  const group = data.groups.find((g) => g.id === s.groupId)
  if (!group || group.nav.kind === 'none') return s.id
  const siblings = data.screens.filter((x) => x.groupId === s.groupId).sort((a, b) => a.order - b.order)
  return siblings[0]?.id ?? s.id
}

/** Screens in a group (or standalone when null), ordered. */
export function screensInBucket(data: ProjectData, groupId: string | null): Screen[] {
  return data.screens.filter((s) => s.groupId === groupId).sort((a, b) => a.order - b.order)
}

function reindex(arr: Array<{ order: number }>) {
  arr.forEach((item, i) => (item.order = i))
}

/**
 * Dense-reindex WITHOUT mutating the inputs (copy-on-write rule, docs/12 §5):
 * returns clones for items whose order changes, keeps references otherwise.
 * Every history snapshot holds old collections by reference, so mutating a
 * persisted object in place corrupts past states.
 */
function reindexed<T extends { id: string; order: number }>(items: T[]): T[] {
  return items.map((item, i) => (item.order === i ? item : { ...item, order: i }))
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => {
      /* Internal: run one mutation with undo bookkeeping.
       *
       * History contract (docs/12 §5): the FIRST commit inside an open gesture
       * pushes the pre-state (one undo entry per drag/scrub/type session);
       * every commit outside a gesture pushes. The gesture registry is
       * leak-proof (pointer tokens + window watchdog), so a stuck gesture can
       * never swallow later history entries again. */
      const commit = (fn: (s: ProjectState) => Partial<ProjectState>) => {
        const state = get()
        if (history.shouldPushOnCommit()) {
          history.push(snapshotOf(state))
        }
        set({
          ...fn(state),
          future: history.futureView(),
          past: history.pastView(),
          revision: state.revision + 1
        } as Partial<ProjectState>)
        // keep sim coherent after structural changes
        const next = get()
        if (next.sim.on) {
          const normalized = normalizeSim(next.sim, next.data)
          if (normalized !== next.sim) set({ sim: normalized })
        }
      }

      return {
        data: EMPTY_DATA,
        ui: { expanded: {}, lastDeviceId: DEVICE_PRESETS[0].id, platform: 'ios', themeMode: 'light' },
        selection: null,
        activeScreenId: null,
        sim: { on: false, history: {} },
        revision: 0,
        past: [],
        future: [],

        /* ── gestures & undo ─────────────────────────────────────────────── */
        beginGesture: (token) => {
          history.begin(token)
        },
        endGesture: (token) => {
          history.end(token)
        },
        releaseGestures: () => {
          history.releaseAllGestures()
        },
        undo: () => {
          const s = get()
          const prev = history.undo(snapshotOf(s))
          if (!prev) return
          set({
            data: prev.data,
            ui: prev.ui,
            selection: prev.selection,
            activeScreenId: prev.activeScreenId,
            sim: normalizeSim(s.sim, prev.data),
            past: history.pastView(),
            future: history.futureView(),
            revision: s.revision + 1
          })
        },
        redo: () => {
          const s = get()
          const next = history.redo(snapshotOf(s))
          if (!next) return
          set({
            data: next.data,
            ui: next.ui,
            selection: next.selection,
            activeScreenId: next.activeScreenId,
            sim: normalizeSim(s.sim, next.data),
            past: history.pastView(),
            future: history.futureView(),
            revision: s.revision + 1
          })
        },

        /* ── groups ───────────────────────────────────────────────────────── */
        createGroup: (input) => {
          const s = get()
          const count = Math.max(0, Math.min(10, Math.round(input.screenCount)))
          const deviceId = input.deviceId ?? s.ui.lastDeviceId
          const device = deviceById(deviceId)
          const gNum = nextGroupName(s.data.groups)
          const name = (input.name ?? `Group ${gNum}`).trim() || `Group ${gNum}`
          const dirName = uniqueSlug(slugify(name).replace(/^-+|-+$/g, '') || 'group', new Set(s.data.groups.map((g) => g.dirName)))
          const groupId = uid('group')
          const screenNum = nextScreenNumber(s.data.screens)

          // screens for the group
          const screens: Screen[] = []
          for (let i = 0; i < count; i++) {
            const displayName = input.screenNames?.[i]?.trim() || `Screen ${screenNum + i}`
            const route = uniqueSlug(slugify(displayName), new Set([...s.data.screens.map((x) => x.route), ...screens.map((x) => x.route)]))
            screens.push({
              id: uid('screen'),
              name: displayName,
              route,
              groupId,
              order: i,
              deviceId,
              x: 0,
              y: 0,
              safeArea: { top: true, bottom: true },
              background: '#FFFFFF'
            })
          }

          // layout the group as a block of up to 3 per row, then find a free spot
          const perRow = Math.min(3, Math.max(1, screens.length))
          const rows = Math.ceil(screens.length / perRow)
          const cellW = screens.length ? Math.max(...screens.map((x) => deviceById(x.deviceId).width)) + 72 : device.width + 72
          const cellH = screens.length ? Math.max(...screens.map((x) => deviceById(x.deviceId).height)) + 96 : device.height + 96
          const at = findFreePosition(perRow * cellW, rows * cellH)
          screens.forEach((sc, i) => {
            const d = deviceById(sc.deviceId)
            const col = i % perRow
            const row = Math.floor(i / perRow)
            sc.x = Math.round(at.x + col * cellW + (cellW - d.width) / 2)
            sc.y = Math.round(at.y + row * cellH + (CLEAR_TOP + 24))
          })

          const nav: NavConfig =
            input.navKind === 'tabs'
              ? { kind: 'tabs', tabs: defaultTabsConfig(screens) }
              : input.navKind === 'stack'
                ? { kind: 'stack', stack: defaultStackConfig() }
                : { kind: 'none' }

          const orderMax = s.data.groups.reduce((m, g) => Math.max(m, g.order), -1)
          const group: ScreenGroup = { id: groupId, name, dirName, order: orderMax + 1, parentId: null, nav }

          commit((st) => ({
            data: {
              ...st.data,
              groups: [...st.data.groups, group],
              screens: [...st.data.screens, ...screens]
            },
            ui: { ...st.ui, lastDeviceId: deviceId, expanded: { ...st.ui.expanded, [groupId]: true } },
            selection: { kind: 'group', groupId },
            activeScreenId: screens[0]?.id ?? null
          }))
          return groupId
        },

        renameGroup: (id, name) =>
          commit((st) => {
            const groups = st.data.groups.map((g) => {
              if (g.id !== id) return g
              const clean = name.trim() || g.name
              const dirName = uniqueSlug(slugify(clean), new Set(st.data.groups.filter((x) => x.id !== id).map((x) => x.dirName)))
              return { ...g, name: clean, dirName }
            })
            return { data: { ...st.data, groups } }
          }),

        deleteGroup: (id) =>
          commit((st) => {
            const screenIds = st.data.screens.filter((s) => s.groupId === id).map((s) => s.id)
            const nodes: Record<string, ProjectNode> = {}
            for (const nid in st.data.nodes) {
              if (!screenIds.includes(st.data.nodes[nid].screenId)) nodes[nid] = st.data.nodes[nid]
            }
            return {
              data: {
                ...st.data,
                groups: reindexAndFilter(st.data.groups, id),
                screens: st.data.screens.filter((s) => s.groupId !== id),
                nodes
              },
              selection: null,
              activeScreenId: null
            }
          }),

        moveGroup: (id, toIndex) =>
          commit((st) => {
            const sorted = [...st.data.groups].sort((a, b) => a.order - b.order)
            const from = sorted.findIndex((g) => g.id === id)
            if (from < 0) return {}
            const [item] = sorted.splice(from, 1)
            sorted.splice(Math.max(0, Math.min(sorted.length, toIndex)), 0, item)
            const dense = reindexed(sorted) // copy-on-write: never mutate shared group objects
            return { data: { ...st.data, groups: st.data.groups.map((g) => dense.find((x) => x.id === g.id) ?? g) } }
          }),

        moveGroupCanvas: (id, dx, dy) => {
          if (dx === 0 && dy === 0) return
          commit((st) => {
            const ids = new Set<string>([id, ...descendantGroupIds(st.data, id)])
            return {
              data: {
                ...st.data,
                screens: st.data.screens.map((s) =>
                  ids.has(s.groupId ?? '')
                    ? { ...s, x: Math.round(s.x + dx), y: Math.round(s.y + dy) }
                    : s
                )
              }
            }
          })
        },

        setTabBarImpl: (id, impl) =>
          commit((st) => {
            const groups = st.data.groups.map((g) => {
              if (g.id !== id || g.nav.kind !== 'tabs') return g
              const tabs = g.nav.tabs
              if (impl === 'custom') {
                // Preserve compatible native settings on the custom bar.
                const custom = { ...tabs.custom }
                for (const key of Object.keys(custom) as Array<keyof CustomTabBarConfig>) {
                  const nativeValue = (tabs as unknown as Record<string, unknown>)[key]
                  if (nativeValue !== undefined) (custom as Record<string, unknown>)[key] = nativeValue
                }
                return { ...g, nav: { kind: 'tabs' as const, tabs: { ...tabs, impl, custom } } }
              }
              // custom → native: keep values for keys that exist on both.
              const tabsNext: TabsNavConfig = { ...tabs, impl }
              for (const key of Object.keys(tabs) as Array<keyof TabsNavConfig>) {
                if (key === 'custom' || key === 'items' || key === 'impl') continue
                const customValue = (tabs.custom as unknown as Record<string, unknown>)[key]
                if (customValue !== undefined) (tabsNext as unknown as Record<string, unknown>)[key] = customValue
              }
              return { ...g, nav: { kind: 'tabs' as const, tabs: tabsNext } }
            })
            return { data: { ...st.data, groups } }
          }),

        patchCustomTabBar: (id, patch) =>
          commit((st) => ({
            data: {
              ...st.data,
              groups: st.data.groups.map((g) =>
                g.id === id && g.nav.kind === 'tabs'
                  ? { ...g, nav: { kind: 'tabs', tabs: { ...g.nav.tabs, custom: { ...g.nav.tabs.custom, ...patch } } } }
                  : g
              )
            }
          })),

        setNavKind: (id, kind) =>
          commit((st) => {
            const group = st.data.groups.find((g) => g.id === id)
            if (!group) return {}
            const screens = screensInBucket(st.data, id)
            const nav: NavConfig =
              kind === 'tabs'
                ? { kind: 'tabs', tabs: defaultTabsConfig(screens) }
                : kind === 'stack'
                  ? { kind: 'stack', stack: defaultStackConfig() }
                  : { kind: 'none' }
            const groups = st.data.groups.map((g) => (g.id === id ? { ...g, nav } : g))
            return { data: { ...st.data, groups } }
          }),

        patchTabsConfig: (id, patch) =>
          commit((st) => ({
            data: {
              ...st.data,
              groups: st.data.groups.map((g) =>
                g.id === id && g.nav.kind === 'tabs' ? { ...g, nav: { kind: 'tabs', tabs: { ...g.nav.tabs, ...patch } } } : g
              )
            }
          })),

        patchTabItem: (groupId, screenId, patch) =>
          commit((st) => ({
            data: {
              ...st.data,
              groups: st.data.groups.map((g) => {
                if (g.id !== groupId || g.nav.kind !== 'tabs') return g
                const items = g.nav.tabs.items.map((it) => (it.screenId === screenId ? { ...it, ...patch } : it))
                return { ...g, nav: { kind: 'tabs', tabs: { ...g.nav.tabs, items } } }
              })
            }
          })),

        patchStackConfig: (id, patch) =>
          commit((st) => ({
            data: {
              ...st.data,
              groups: st.data.groups.map((g) =>
                g.id === id && g.nav.kind === 'stack'
                  ? { ...g, nav: { kind: 'stack', stack: { ...g.nav.stack, ...patch } } }
                  : g
              )
            }
          })),

        /* ── screens ──────────────────────────────────────────────────────── */
        addScreen: (input) => {
          const s = get()
          const deviceId = input?.deviceId ?? s.ui.lastDeviceId
          const device = deviceById(deviceId)
          const groupId = input?.groupId ?? null
          const bucket = screensInBucket(s.data, groupId)
          const num = nextScreenNumber(s.data.screens)
          const displayName = input?.name?.trim() || `Screen ${num}`
          const taken = new Set([...s.data.screens.map((x) => x.route), ...s.data.groups.map((g) => g.dirName)])
          const id = uid('screen')
          const at = findFreePosition(device.width, device.height, input?.at)
          const screen: Screen = {
            id,
            name: displayName,
            route: uniqueSlug(slugify(displayName), taken),
            groupId,
            order: bucket.length,
            deviceId,
            x: at.x,
            y: at.y,
            safeArea: { top: true, bottom: true },
            background: '#FFFFFF'
          }
          commit((st) => ({
            data: { ...st.data, screens: [...st.data.screens, screen] },
            ui: { ...st.ui, lastDeviceId: deviceId },
            selection: { kind: 'screen', screenId: id },
            activeScreenId: id
          }))
          return id
        },

        renameScreen: (id, name) =>
          commit((st) => ({
            data: {
              ...st.data,
              screens: st.data.screens.map((s) => {
                if (s.id !== id) return s
                const clean = name.trim() || s.name
                const taken = new Set(st.data.screens.filter((x) => x.id !== id).map((x) => x.route))
                return { ...s, name: clean, route: uniqueSlug(slugify(clean), taken) }
              })
            }
          })),

        deleteScreen: (id) =>
          commit((st) => {
            const nodes: Record<string, ProjectNode> = {}
            for (const nid in st.data.nodes) {
              if (st.data.nodes[nid].screenId !== id) nodes[nid] = st.data.nodes[nid]
            }
            // reindex the bucket the screen lived in (copy-on-write)
            const groupId = st.data.screens.find((s) => s.id === id)?.groupId ?? null
            const screens = reindexedInBucket(
              st.data.screens.filter((s) => s.id !== id),
              groupId
            )
            return {
              data: { ...st.data, screens, nodes },
              selection: st.selection && st.selection.kind !== 'group' ? null : st.selection,
              activeScreenId: st.activeScreenId === id ? null : st.activeScreenId
            }
          }),

        moveScreen: (id, toGroupId, toIndex) =>
          commit((st) => {
            const screen = st.data.screens.find((s) => s.id === id)
            if (!screen) return {}
            const screens = st.data.screens.map((s) => ({ ...s }))
            const fromGroupId = screen.groupId
            // remove from old bucket (dense reindex), insert at target index
            const oldBucket = screens.filter((s) => s.groupId === fromGroupId && s.id !== id).sort((a, b) => a.order - b.order)
            reindex(oldBucket)
            const target = screens.find((s) => s.id === id)!
            target.groupId = toGroupId
            const newBucket = screens.filter((s) => s.groupId === toGroupId && s.id !== id).sort((a, b) => a.order - b.order)
            newBucket.splice(Math.max(0, Math.min(newBucket.length, toIndex)), 0, target)
            reindex(newBucket)
            // refresh tab items binding when moving out of / into a tabs group
            const groups: ScreenGroup[] = st.data.groups.map((g): ScreenGroup => {
              if (g.nav.kind !== 'tabs') return g
              if (g.id === toGroupId || g.id === fromGroupId) {
                const members = screens.filter((s) => s.groupId === g.id).sort((a, b) => a.order - b.order)
                return { ...g, nav: { kind: 'tabs' as const, tabs: { ...g.nav.tabs, items: defaultTabsConfig(members).items } } }
              }
              return g
            })
            return { data: { ...st.data, screens, groups } }
          }),

        moveScreenCanvas: (id, x, y) =>
          commit((st) => ({
            data: { ...st.data, screens: st.data.screens.map((s) => (s.id === id ? { ...s, x: Math.round(x), y: Math.round(y) } : s)) }
          })),

        setScreenDevice: (id, deviceId) =>
          commit((st) => ({
            data: { ...st.data, screens: st.data.screens.map((s) => (s.id === id ? { ...s, deviceId } : s)) },
            ui: { ...st.ui, lastDeviceId: deviceId }
          })),

        setScreenCodeOverride: (id, content) =>
          commit((st) => ({
            data: {
              ...st.data,
              screens: st.data.screens.map((s) =>
                s.id === id ? (content === null ? { ...s, codeOverride: undefined } : { ...s, codeOverride: content }) : s
              )
            }
          })),

        /* ── platform — ONE editor-global target ─────────────────────────── */
        setGlobalPlatform: (platform) =>
          commit((st) => {
            if (st.ui.platform === platform) return {}
            // Remap every screen's device to the closest preset of the new
            // platform — the entire editor (frames, previews, defaults)
            // follows the single global platform.
            const screens = st.data.screens.map((s) => {
              const current = deviceById(s.deviceId)
              if (current.platform === platform) return s
              const next = closestDevice(platform, current.width, current.height)
              return next ? { ...s, deviceId: next.id } : s
            })
            const lastDevice = deviceById(st.ui.lastDeviceId)
            const lastDeviceId = lastDevice.platform === platform ? st.ui.lastDeviceId : (closestDevice(platform, lastDevice.width, lastDevice.height)?.id ?? st.ui.lastDeviceId)
            return { data: { ...st.data, screens }, ui: { ...st.ui, platform, lastDeviceId } }
          }),

        /* ── theme (plain-TS palette; no NativeWind) ────────────────────── */
        setThemeToken: (name, value) =>
          commit((st) => {
            const clean = name.trim()
            if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(clean)) return {}
            const colors = { ...(st.data.theme?.colors ?? {}), [clean]: { light: value.light, dark: value.dark } }
            return { data: { ...st.data, theme: { colors } } }
          }),

        deleteThemeToken: (name) =>
          commit((st) => {
            const colors = { ...(st.data.theme?.colors ?? {}) }
            if (!(name in colors)) return {}
            delete colors[name]
            // Bound paints keep their { token } reference (it resolves to
            // nothing while absent) — same recoverability as an unset key.
            return { data: { ...st.data, theme: { colors } } }
          }),

        setThemeMode: (mode) =>
          commit((st) => (st.ui.themeMode === mode ? {} : { ui: { ...st.ui, themeMode: mode } })),

        setScreenSafeArea: (id, patch) =>
          commit((st) => ({
            data: {
              ...st.data,
              screens: st.data.screens.map((s) => (s.id === id ? { ...s, safeArea: { ...s.safeArea, ...patch } } : s))
            }
          })),

        setScreenBackground: (id, color) =>
          commit((st) => ({
            data: { ...st.data, screens: st.data.screens.map((s) => (s.id === id ? { ...s, background: color } : s)) }
          })),

        /* ── nodes ─────────────────────────────────────────────────────────── */
        insertNode: (input) => {
          const s = get()
          const entry = getEntry(input.type)
          if (!entry) throw new Error(`Unknown component type: ${input.type}`)
          const id = uid('node')
          const siblings = childNodes(s.data, input.screenId, input.parentId ?? null)
          const order = input.order ?? siblings.length
          // shift siblings >= order
          const style: Record<string, unknown> = {}
          const rect = input.rect
          const width = rect?.width ?? entry.insert.width
          const height = rect?.height ?? entry.insert.height
          style.position = 'absolute'
          style.left = rect ? Math.round(rect.left) : 24
          style.top = rect ? Math.round(rect.top) : 24
          style.width = Math.round(width as number)
          if (typeof height === 'number') style.height = Math.round(height)
          const node: ProjectNode = {
            id,
            screenId: input.screenId,
            parentId: input.parentId ?? null,
            type: input.type,
            order,
            props: input.props ? { ...input.props } : {},
            style
          }
          if (input.impl !== undefined) node.impl = input.impl
          commit((st) => {
            // bump orders of siblings after insertion point
            const nodes: Record<string, ProjectNode> = {}
            for (const nid in st.data.nodes) nodes[nid] = st.data.nodes[nid]
            for (const nid in nodes) {
              const n = nodes[nid]
              if (n.screenId === input.screenId && n.parentId === (input.parentId ?? null) && n.order >= order) {
                nodes[nid] = { ...n, order: n.order + 1 }
              }
            }
            nodes[id] = node
            return {
              data: { ...st.data, nodes },
              selection: { kind: 'node', nodeId: id, screenId: input.screenId },
              activeScreenId: input.screenId
            }
          })
          return id
        },

        deleteNode: (id) =>
          commit((st) => {
            const ids = collectSubtree(st.data, id)
            const screenId = st.data.nodes[id]?.screenId
            const nodes: Record<string, ProjectNode> = {}
            for (const nid in st.data.nodes) {
              if (!ids.includes(nid)) nodes[nid] = st.data.nodes[nid]
            }
            // dense reindex within the affected parent buckets (copy-on-write)
            for (const parent of new Set(ids.map((x) => st.data.nodes[x]?.parentId ?? null))) {
              const bucket = reindexed(
                Object.values(nodes)
                  .filter((n) => n.screenId === screenId && n.parentId === parent)
                  .sort((a, b) => a.order - b.order)
              )
              bucket.forEach((n) => (nodes[n.id] = n))
            }
            return {
              data: { ...st.data, nodes },
              selection: null
            }
          }),

        moveNode: (id, parentId, order) =>
          commit((st) => {
            const node = st.data.nodes[id]
            if (!node) return {}
            // cycle guard: parentId must not be inside the subtree
            if (collectSubtree(st.data, id).includes(parentId ?? '')) return {}
            const nodes: Record<string, ProjectNode> = {}
            for (const nid in st.data.nodes) nodes[nid] = st.data.nodes[nid]
            // dense reindex old bucket without the node (copy-on-write clones)
            const oldBucket = reindexed(
              Object.values(nodes)
                .filter((n) => n.screenId === node.screenId && n.parentId === node.parentId && n.id !== id)
                .sort((a, b) => a.order - b.order)
            )
            oldBucket.forEach((n) => (nodes[n.id] = n))
            // insert into new bucket at order
            const newBucket = Object.values(nodes)
              .filter((n) => n.screenId === node.screenId && n.parentId === parentId && n.id !== id)
              .sort((a, b) => a.order - b.order)
            const insertAt = Math.max(0, Math.min(newBucket.length, order))
            newBucket.splice(insertAt, 0, { ...node, parentId, order: 0 })
            reindexed(newBucket).forEach((n) => (nodes[n.id] = n))
            return { data: { ...st.data, nodes } }
          }),

        setNodeProps: (id, patch) =>
          commit((st) => ({
            data: {
              ...st.data,
              nodes: {
                ...st.data.nodes,
                [id]: {
                  ...st.data.nodes[id],
                  props: { ...st.data.nodes[id].props, ...patch }
                }
              }
            }
          })),

        setNodeStyle: (id, patch) =>
          commit((st) => {
            const node = st.data.nodes[id]
            if (!node) return {}
            const style: Record<string, unknown> = { ...node.style }
            for (const k in patch) {
              const v = patch[k]
              if (v === undefined) delete style[k]
              else style[k] = v
            }
            return { data: { ...st.data, nodes: { ...st.data.nodes, [id]: { ...node, style } } } }
          }),

        setNodeName: (id, name) =>
          commit((st) => ({
            data: { ...st.data, nodes: { ...st.data.nodes, [id]: { ...st.data.nodes[id], name } } }
          })),

        toggleNodeHidden: (id) =>
          commit((st) => ({
            data: {
              ...st.data,
              nodes: { ...st.data.nodes, [id]: { ...st.data.nodes[id], hidden: !st.data.nodes[id].hidden } }
            }
          })),

        setNodeImpl: (id, implId) =>
          commit((st) => {
            const node = st.data.nodes[id]
            const entry = node ? getEntry(node.type) : undefined
            if (!node || !entry || !entry.implementations || !entry.implementations.some((i) => i.id === implId)) return {}
            const currentImpl =
              entry.implementations.find((i) => i.id === (node.impl ?? entry.implementations?.[0]?.id)) ?? entry.implementations[0]
            const nextImpl = entry.implementations.find((i) => i.id === implId)!
            // Keep prop values whose key exists in BOTH implementations.
            const currentKeys = new Set([...entry.props, ...currentImpl.props].map((p) => p.key))
            const nextKeys = new Set([...entry.props, ...nextImpl.props].map((p) => p.key))
            const props: Record<string, unknown> = {}
            for (const [key, value] of Object.entries(node.props)) {
              if (currentKeys.has(key) && nextKeys.has(key)) props[key] = value
            }
            return {
              data: { ...st.data, nodes: { ...st.data.nodes, [id]: { ...node, impl: implId, props } } }
            }
          }),

        /* ── interactions (Phase 4, P0-1) ───────────────────────────────── */
        setNodeInteraction: (id, hook, action) =>
          commit((st) => {
            const node = st.data.nodes[id]
            if (!node) return {}
            // Only hooks the node's registry entry declares are wireable —
            // the same validation surface the inspector offers.
            const entry = getEntry(node.type)
            if (!entry || !entry.hooks?.some((h) => h.hook === hook)) return {}
            const prev = node.interactions ?? {}
            let next: NodeInteractions
            if (action) next = { ...prev, [hook]: action }
            else {
              next = { ...prev }
              delete next[hook]
            }
            const hasAny = Object.keys(next).length > 0
            return {
              data: {
                ...st.data,
                nodes: {
                  ...st.data.nodes,
                  [id]: hasAny ? { ...node, interactions: next } : { ...node, interactions: undefined }
                }
              }
            }
          }),

        /* ── screen state (Phase 4 slice 2) ─────────────────────────────── */
        setScreenState: (screenId, entries) =>
          commit((st) => {
            const screen = st.data.screens.find((s) => s.id === screenId)
            if (!screen) return {}
            const normalized = normalizeStateEntries(entries)
            const screens = st.data.screens.map((s) =>
              s.id === screenId
                ? normalized.length > 0
                  ? { ...s, state: normalized }
                  : { ...s, state: undefined }
                : s
            )
            return { data: { ...st.data, screens } }
          }),

        patchNodeAnimations: (id, patch) =>
          commit((st) => {
            const node = st.data.nodes[id]
            if (!node) return {}
            const next: NodeAnimations = { ...node.animations }
            for (const [key, value] of Object.entries(patch) as Array<[keyof NodeAnimations, AnimationSpec | undefined]>) {
              if (value === undefined) delete next[key]
              else next[key] = value
            }
            const hasAny = next.entering != null || next.exiting != null
            return {
              data: {
                ...st.data,
                nodes: {
                  ...st.data.nodes,
                  [id]: hasAny ? { ...node, animations: next } : { ...node, animations: undefined }
                }
              }
            }
          }),

        setNodeListRole: (id, role) =>
          commit((st) => {
            const node = st.data.nodes[id]
            if (!node) return {}
            // Only DIRECT children of a list participate (any node type — a
            // nested list can play a role too); anything else is a no-op (the
            // inspector only shows the control for that case).
            const listId = node.parentId
            const parent = listId ? st.data.nodes[listId] : undefined
            if (!parent || !isListEntryType(parent.type)) return {}
            return {
              data: {
                ...st.data,
                nodes: {
                  ...st.data.nodes,
                  [id]: role === 'item' ? { ...node, listRole: undefined } : { ...node, listRole: role }
                }
              }
            }
          }),

        setNodeRawCodeProps: (id, raw) =>
          commit((st) => {
            const node = st.data.nodes[id]
            if (!node) return {}
            return {
              data: {
                ...st.data,
                nodes: { ...st.data.nodes, [id]: { ...node, rawCodeProps: raw && Object.keys(raw).length > 0 ? raw : undefined } }
              }
            }
          }),

        applyCodePatches: (screenId, patches) =>
          commit((st) => {
            const nodes: Record<string, ProjectNode> = { ...st.data.nodes }
            for (const patch of patches) {
              const node = nodes[patch.nodeId]
              if (!node || node.screenId !== screenId) continue
              const props = { ...node.props }
              for (const [key, value] of Object.entries(patch.props)) {
                if (value === undefined) delete props[key]
                else props[key] = value
              }
              nodes[patch.nodeId] = {
                ...node,
                props,
                style: patch.style,
                rawCodeProps: Object.keys(patch.rawCodeProps).length > 0 ? patch.rawCodeProps : undefined
              }
            }
            return { data: { ...st.data, nodes } }
          }),

        /* ── selection & view ──────────────────────────────────────────────── */
        select: (selection) => set({ selection }),
        setActiveScreen: (id) => set({ activeScreenId: id }),
        setExpanded: (id, expanded) => set({ ui: { ...get().ui, expanded: { ...get().ui.expanded, [id]: expanded } } }),

        /* ── project ──────────────────────────────────────────────────────── */
        setProjectName: (name) => commit((st) => ({ data: { ...st.data, name } })),

        /* ── simulation ───────────────────────────────────────────────────── */
        setSim: (on) => {
          const s = get()
          if (on) {
            const history: Record<string, string[]> = {}
            for (const sc of s.data.screens) history[sc.id] = [firstScreenOf(s.data, sc) ?? sc.id]
            set({ sim: { on: true, history }, revision: s.revision + 1 })
          } else {
            set({ sim: { on: false, history: {} }, revision: s.revision + 1 })
          }
        },

        simNavigate: (artboardScreenId, targetScreenId, mode) => {
          const s = get()
          if (!s.sim.on) return
          const stack = [...(s.sim.history[artboardScreenId] ?? [artboardScreenId])]
          if (mode === 'push') stack.push(targetScreenId)
          else {
            stack.pop()
            stack.push(targetScreenId)
          }
          set({
            sim: { ...s.sim, history: { ...s.sim.history, [artboardScreenId]: stack } },
            revision: s.revision + 1
          })
        },

        simBack: (artboardScreenId) => {
          const s = get()
          if (!s.sim.on) return
          const stack = s.sim.history[artboardScreenId] ?? [artboardScreenId]
          if (stack.length <= 1) return
          set({
            sim: { ...s.sim, history: { ...s.sim.history, [artboardScreenId]: stack.slice(0, -1) } },
            revision: s.revision + 1
          })
        },

        simSetState: (screenId, name, value) => {
          const s = get()
          if (!s.sim.on) return
          // Only DECLARED entries are writable — resolveStateValues semantics.
          const screen = s.data.screens.find((x) => x.id === screenId)
          const entry = stateEntry(screen, name)
          if (!entry) return
          if (value === 'toggle' && entry.type !== 'boolean') return
          const current = { ...resolveStateValues(screen, s.sim.values?.[screenId]) }
          if (value === 'toggle') {
            current[name] = !current[name]
          } else {
            current[name] = value
          }
          set({
            sim: {
              ...s.sim,
              values: { ...(s.sim.values ?? {}), [screenId]: current }
            },
            revision: s.revision + 1
          })
        }
      }
    },
    {
      name: 'expoforge:project:v2',
      version: 3,
      /* v2 → v3 migration: drop per-screen platform (single global ui.platform),
       * seed tabs impl/custom defaults, strip node fields that no longer exist. */
      migrate: (persisted: unknown) => {
        const p = persisted as {
          data?: Partial<ProjectData>
          ui?: Partial<EditorUiState> & { lastPlatform?: PlatformId }
        }
        const data = p.data ?? {}
        const ui = p.ui ?? {}
        const screens = (data.screens ?? []).map((s) => {
          const { platform: _platform, ...rest } = s as typeof s & { platform?: PlatformId }
          return rest as Screen
        })
        const groups = (data.groups ?? []).map((g) => {
          if (g?.nav?.kind !== 'tabs') return g
          const tabs = g.nav.tabs
          const nextTabs: TabsNavConfig = {
            ...defaultTabsConfig([]),
            ...tabs,
            impl: tabs.impl ?? 'native',
            custom: { ...defaultCustomTabBarConfig(tabs), ...(tabs.custom ?? {}) }
          }
          return { ...g, nav: { kind: 'tabs' as const, tabs: nextTabs } }
        })
        const nodes: Record<string, ProjectNode> = {}
        for (const [id, node] of Object.entries(data.nodes ?? {})) {
          nodes[id] = {
            ...node,
            props: node.props ?? {},
            style: node.style ?? {}
          }
        }
        const platform: PlatformId = ui.platform ?? ui.lastPlatform ?? 'ios'
        // Phase-1 paint/theme migration: seed the default palette when the
        // persisted project predates themes, and default the preview mode to
        // light. Existing solid color values keep working verbatim.
        const theme = data.theme?.colors ? data.theme : { colors: { ...DEFAULT_THEME_COLORS } }
        // zustand's migrate must return the full store shape; the persisted
        // partial is merged over the initial state on rehydrate.
        return {
          data: { name: data.name ?? 'Untitled app', groups, screens, nodes, theme },
          ui: { expanded: ui.expanded ?? {}, lastDeviceId: ui.lastDeviceId ?? DEVICE_PRESETS[0].id, platform, themeMode: ui.themeMode ?? 'light' },
          selection: null,
          activeScreenId: null
        } as unknown as ProjectState
      },
      partialize: (s) =>
        ({
          data: s.data,
          ui: s.ui,
          selection: s.selection,
          activeScreenId: s.activeScreenId
        }) as unknown as ProjectState
    }
  )
)

/* ────────────────────────────────────────────────────────────────────────────
 * Derived helpers (free functions over the store)
 * ──────────────────────────────────────────────────────────────────────────── */

function reindexAndFilter(groups: ScreenGroup[], removedId: string): ScreenGroup[] {
  const kept = groups.filter((g) => g.id !== removedId).sort((a, b) => a.order - b.order)
  const dense = reindexed(kept) // copy-on-write: never mutate shared group objects
  const out: ScreenGroup[] = []
  for (const g of groups) {
    const match = dense.find((x) => x.id === g.id)
    if (match) out.push(match)
  }
  return out
}

/** Dense-reindex one bucket's screens without mutating inputs (copy-on-write). */
function reindexedInBucket(screens: Screen[], groupId: string | null): Screen[] {
  const dense = reindexed(screens.filter((s) => s.groupId === groupId).sort((a, b) => a.order - b.order))
  const byOrder = new Map(dense.map((s) => [s.id, s.order]))
  return screens.map((s) => (byOrder.has(s.id) && byOrder.get(s.id) !== s.order ? { ...s, order: byOrder.get(s.id)! } : s))
}

/** The screen an artboard currently shows in simulation (or the screen itself). */
export function simShownScreen(sim: SimState, artboardScreenId: string): string {
  const stack = sim.history[artboardScreenId]
  return stack?.[stack.length - 1] ?? artboardScreenId
}

/** Ordered groups (root level). */
export function sortedGroups(data: ProjectData): ScreenGroup[] {
  return [...data.groups].sort((a, b) => a.order - b.order)
}

export type { InsertTool }
