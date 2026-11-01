/**
 * Tree model — the pure projection from ProjectData to hierarchy rows.
 *
 * Structure (docs/03 §4, reworked): groups (root order) → their screens → the
 * screen's layer tree (only mounted while the screen row is expanded, or while
 * a search is active) → standalone screens at root level.
 *
 * Search: filters screens + layers by name (text nodes also match their
 * content); groups always render. A layer renders when it matches or is an
 * ancestor of a match, so matches stay attached to their parent chain.
 */
import { getEntry } from '@/expoforge/registry'
import { childNodes, screensInBucket, sortedGroups } from '@/lib/project/store'
import type { ProjectData, ProjectNode, Screen } from '@/lib/project/types'
import type { IconSlot } from '@/components/builder/icons/slots'
import { layerIconSlot } from './kind-icons'
import type { TreeRow } from './types'

const TEXT_SNIPPET_MAX = 24

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/* ── Layer display (registry-driven, with fallbacks) ─────────────────── */

/**
 * Layers label. Precedence: explicit override → registry entry name, with
 * text nodes showing their content snippet (`Text “Welcome”`).
 */
export function nodeDisplayName(node: ProjectNode): string {
  const override = node.name?.trim()
  if (override) return override
  const entry = getEntry(node.type)
  if (node.type === 'text') {
    const raw = node.props.content
    const fallback = entry?.props.find((p) => p.key === 'content')?.default
    const content =
      typeof raw === 'string' && raw.trim().length > 0
        ? raw.trim()
        : typeof fallback === 'string' && fallback.length > 0
          ? fallback
          : 'Text'
    return `Text “${truncate(content, TEXT_SNIPPET_MAX)}”`
  }
  return entry?.name ?? node.type
}

/** Icon slot for a layer row (registry id → tool.* slot; fallback tree.layer). */
export function nodeIconSlot(node: ProjectNode): IconSlot {
  return layerIconSlot(node.type)
}

/** Container policy for 'inside' drops: registry `children === 'any'` only. */
export function nodeAcceptsChildren(data: ProjectData, node: ProjectNode): boolean {
  const entry = getEntry(node.type)
  if (entry) return entry.children === 'any'
  return childNodes(data, node.screenId, node.id).length > 0
}

/* ── Search matching ─────────────────────────────────────────────────── */

function nodeMatches(node: ProjectNode, q: string): boolean {
  const parts = [node.name ?? '', node.type, getEntry(node.type)?.name ?? '']
  if (node.type === 'text' && typeof node.props.content === 'string') parts.push(node.props.content)
  return parts.join(' ').toLowerCase().includes(q)
}

function subtreeMatches(
  data: ProjectData,
  screenId: string,
  parentId: string | null,
  q: string
): boolean {
  for (const child of childNodes(data, screenId, parentId)) {
    if (nodeMatches(child, q) || subtreeMatches(data, screenId, child.id, q)) return true
  }
  return false
}

/** A screen matches by name/route, or when any of its layers matches. */
function screenMatches(data: ProjectData, screen: Screen, q: string): boolean {
  if (`${screen.name} ${screen.route}`.toLowerCase().includes(q)) return true
  return subtreeMatches(data, screen.id, null, q)
}

/* ── Row building ────────────────────────────────────────────────────── */

function pushNodeRows(
  data: ProjectData,
  screenId: string,
  parentId: string | null,
  depth: number,
  q: string | null,
  out: TreeRow[]
): void {
  for (const node of childNodes(data, screenId, parentId)) {
    if (q === null) {
      out.push({ kind: 'node', id: node.id, screenId, depth })
      pushNodeRows(data, screenId, node.id, depth + 1, q, out)
    } else {
      const include = nodeMatches(node, q) || subtreeMatches(data, screenId, node.id, q)
      if (include) {
        out.push({ kind: 'node', id: node.id, screenId, depth })
        pushNodeRows(data, screenId, node.id, depth + 1, q, out)
      }
    }
  }
}

export interface TreeModel {
  /** Rendered rows in visual order (group → screens → layers, then standalone). */
  rows: TreeRow[]
  /** True while a non-empty search query is active. */
  searching: boolean
  /** True when the project has any group or screen at all (drives the empty CTA). */
  hasContent: boolean
}

export function buildTreeModel(
  data: ProjectData,
  expanded: Record<string, boolean>,
  query: string
): TreeModel {
  const q = query.trim().toLowerCase()
  const searching = q.length > 0
  const rows: TreeRow[] = []

  for (const group of sortedGroups(data)) {
    rows.push({ kind: 'group', id: group.id, depth: 0 })
    if (searching || expanded[group.id]) {
      for (const screen of screensInBucket(data, group.id)) {
        if (searching && !screenMatches(data, screen, q)) continue
        rows.push({ kind: 'screen', id: screen.id, groupId: group.id, depth: 1 })
        if (searching || expanded[screen.id]) {
          pushNodeRows(data, screen.id, null, 2, searching ? q : null, rows)
        }
      }
    }
  }

  for (const screen of screensInBucket(data, null)) {
    if (searching && !screenMatches(data, screen, q)) continue
    rows.push({ kind: 'screen', id: screen.id, groupId: null, depth: 1 })
    if (searching || expanded[screen.id]) {
      pushNodeRows(data, screen.id, null, 2, searching ? q : null, rows)
    }
  }

  return {
    rows,
    searching,
    hasContent: data.groups.length > 0 || data.screens.length > 0
  }
}

/** Total layer count of a screen (drives the screen row's chevron affordance). */
export function nodeCountOf(data: ProjectData, screenId: string): number {
  let count = 0
  for (const id in data.nodes) {
    if (data.nodes[id].screenId === screenId) count += 1
  }
  return count
}

/**
 * True when `nodeId` is `ancestorId` or a descendant of it — used to block
 * drops that would create a cycle (dropping a parent into its own subtree).
 */
export function isInSubtree(data: ProjectData, nodeId: string, ancestorId: string): boolean {
  let cursor: string | null = nodeId
  while (cursor) {
    if (cursor === ancestorId) return true
    cursor = data.nodes[cursor]?.parentId ?? null
  }
  return false
}
