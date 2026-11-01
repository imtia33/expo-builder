/**
 * Shared types for the left-panel hierarchy tree (groups → screens → layers).
 *
 * The tree is a projection of the project store (`@/lib/project/store`) — rows
 * carry only identity + geometry (kind, id, depth, ownership); every entity is
 * read back from the store at render time, so there is zero data duplication
 * and zero props drilling.
 */

/** Drop instruction for the three-zone indicator: top edge / bottom edge / inside. */
export type DropZone = 'above' | 'below' | 'inside'

export type TreeRowKind = 'group' | 'screen' | 'node'

/** A group row (root level in v1; `parentId` reserved for nesting). */
export interface GroupRow {
  kind: 'group'
  id: string
  depth: 0
}

/** A screen row; `groupId === null` means standalone (root level). */
export interface ScreenRow {
  kind: 'screen'
  id: string
  groupId: string | null
  depth: 1
}

/** A layer row (one ProjectNode of the owning screen's component tree). */
export interface NodeRow {
  kind: 'node'
  id: string
  screenId: string
  depth: number
}

export type TreeRow = GroupRow | ScreenRow | NodeRow

/** Active drag, tracked in React state (dataTransfer payloads are unreadable in dragover). */
export interface DragPayload {
  kind: TreeRowKind
  id: string
  /** For node drags: the owning screen — layers only move within one screen. */
  screenId?: string
}

/** The row currently under the pointer + which zone of it the drop would land in. */
export interface DropTarget {
  id: string
  zone: DropZone
}

/** A pending destructive action awaiting its AlertDialog confirmation. */
export interface DeleteRequest {
  kind: 'group' | 'screen'
  id: string
}
