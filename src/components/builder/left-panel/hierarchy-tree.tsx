'use client'

/**
 * HierarchyTree — the left panel's single tree (Figma layers-panel feel, IDE
 * file-explorer familiarity): groups → screens → layers, then a divider and
 * the standalone screens.
 *
 * Everything reads from the project store; the only props are UI orchestration
 * (the live search query, the panel's focus state for two-state selection, and
 * CTA callbacks for the empty state).
 *
 * Interactions:
 *  - click selects (screens also become the active screen); double-click
 *    renames inline (Enter/Esc/blur); chevrons expand/collapse via the
 *    persisted `ui.expanded` map.
 *  - Drag & drop (HTML5, adapted from the ported layers-tree instructions):
 *      · group → group edge zones reorder root groups (`moveGroup`);
 *      · screen → screen edge zones reorder within/across buckets
 *        (`moveScreen`), screen → group row (whole row = inside) appends to
 *        that group, screen → the bottom drop zone makes it standalone;
 *      · layer → layer three-zone (above/below/inside; inside only for
 *        registry `children === 'any'` containers) reorders/reparents
 *        (`moveNode`), layer → its own screen row (inside) moves it to the
 *        screen root. Layers never leave their screen; cycles are blocked.
 *  - Auto-expand: selecting/activating a screen expands its group + screen
 *    rows (never layer rows). Newly created groups scroll into view.
 *  - Keyboard: Enter/Space select, F2 rename, Alt+↑/↓ reorder within
 *    siblings, ←/→ collapse/expand (or focus parent/first child).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { SlotIcon } from '@/components/builder/icons/slots'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { floatingSurface } from '@/app/theme/overlay'
import buttonTheme from '@/app/theme/button/button'
import {
  childNodes,
  screensInBucket,
  sortedGroups,
  useProjectStore
} from '@/lib/project/store'
import { cn } from '@/lib/utils'
import { tv } from 'tailwind-variants'
import { buildTreeModel, isInSubtree, nodeAcceptsChildren, nodeCountOf, nodeDisplayName } from './tree-model'
import { TreeRow } from './tree-row'
import hierarchyTreeTheme from './tree-theme'
import { useReducedMotionPref } from './use-reduced-motion'
import type { DeleteRequest, DragPayload, DropTarget, DropZone, TreeRow as Row } from './types'

const treeStyles = tv(hierarchyTreeTheme)()

const btnSubtle = tv(buttonTheme)({ color: 'neutral', variant: 'subtle', size: 'sm' }).base()
const btnPrimary = tv(buttonTheme)({ color: 'primary', variant: 'solid', size: 'sm' }).base()
const btnError = tv(buttonTheme)({ color: 'error', variant: 'solid', size: 'sm' }).base()
const btnOutline = tv(buttonTheme)({ color: 'neutral', variant: 'outline', size: 'sm' }).base()

const STANDALONE_DROP_KEY = '__standalone__'

export interface HierarchyTreeProps {
  query: string
  /** Whether the panel (not the canvas) holds focus — drives two-state selection. */
  panelFocused: boolean
  onNewGroup: () => void
  onNewScreen: () => void
  className?: string
}

export function HierarchyTree({
  query,
  panelFocused,
  onNewGroup,
  onNewScreen,
  className
}: HierarchyTreeProps) {
  const reducedMotion = useReducedMotionPref()
  const data = useProjectStore((s) => s.data)
  const expanded = useProjectStore((s) => s.ui.expanded)
  const selection = useProjectStore((s) => s.selection)
  const activeScreenId = useProjectStore((s) => s.activeScreenId)

  const [drag, setDrag] = useState<DragPayload | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null)

  const viewportRef = useRef<HTMLUListElement>(null)

  const model = useMemo(() => buildTreeModel(data, expanded, query), [data, expanded, query])

  /** Scroll a row into view (used for fresh groups and canvas-side selections). */
  function revealRow(id: string) {
    requestAnimationFrame(() => {
      viewportRef.current
        ?.querySelector(`[data-tree-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
    })
  }

  /* ── auto-expand: reveal the selected/active screen's chain ─────────── */
  useEffect(() => {
    const s = useProjectStore.getState()
    let screenId: string | null = null
    if (s.selection?.kind === 'screen') screenId = s.selection.screenId
    else if (s.selection?.kind === 'node') screenId = s.selection.screenId
    else if (s.selection?.kind === 'group') {
      if (!s.ui.expanded[s.selection.groupId]) s.setExpanded(s.selection.groupId, true)
      return
    }
    if (!screenId) screenId = s.activeScreenId
    if (!screenId) return
    const screen = s.data.screens.find((x) => x.id === screenId)
    if (!screen) return
    if (screen.groupId && !s.ui.expanded[screen.groupId]) s.setExpanded(screen.groupId, true)
    if (!s.ui.expanded[screenId]) s.setExpanded(screenId, true)
  }, [selection, activeScreenId])

  /* ── reveal: newly created groups scroll into view ──────────────────── */
  const knownGroupsRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    const ids = data.groups.map((g) => g.id)
    if (knownGroupsRef.current === null) {
      knownGroupsRef.current = new Set(ids)
      return
    }
    const fresh = ids.filter((id) => !knownGroupsRef.current!.has(id))
    knownGroupsRef.current = new Set(ids)
    for (const id of fresh) revealRow(id)
  }, [data.groups])

  /* ── reveal: canvas-side selections scroll into view (Figma-like) ───── */
  const lastRevealRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selection) return
    const key =
      selection.kind === 'group' || selection.kind === 'nav'
        ? selection.groupId
        : selection.kind === 'screen'
          ? selection.screenId
          : selection.nodeId
    if (lastRevealRef.current === key) return
    lastRevealRef.current = key
    if (!panelFocused) revealRow(key)
  }, [selection, panelFocused])

  /* ── selection ──────────────────────────────────────────────────────── */
  function handleSelect(row: Row) {
    const s = useProjectStore.getState()
    if (row.kind === 'group') s.select({ kind: 'group', groupId: row.id })
    else if (row.kind === 'screen') {
      s.select({ kind: 'screen', screenId: row.id })
      s.setActiveScreen(row.id)
    } else {
      s.select({ kind: 'node', nodeId: row.id, screenId: row.screenId })
      s.setActiveScreen(row.screenId)
    }
  }

  function isSelected(row: Row): boolean {
    if (!selection) return false
    if (row.kind === 'group') return selection.kind === 'group' && selection.groupId === row.id
    if (row.kind === 'screen') return selection.kind === 'screen' && selection.screenId === row.id
    return selection.kind === 'node' && selection.nodeId === row.id
  }

  /* ── expand / rename ────────────────────────────────────────────────── */
  function handleToggleExpand(row: Row) {
    const s = useProjectStore.getState()
    s.setExpanded(row.id, !s.ui.expanded[row.id])
  }

  function handleCommitRename(row: Row, value: string) {
    setRenamingId(null)
    const clean = value.trim()
    if (!clean) return
    const s = useProjectStore.getState()
    if (row.kind === 'group') {
      const group = s.data.groups.find((g) => g.id === row.id)
      if (group && group.name !== clean) s.renameGroup(row.id, clean)
    } else if (row.kind === 'screen') {
      const screen = s.data.screens.find((x) => x.id === row.id)
      if (screen && screen.name !== clean) s.renameScreen(row.id, clean)
    } else {
      // layers: skip no-op commits so an unchanged Enter creates no undo entry
      const node = s.data.nodes[row.id]
      const initial = node?.name?.trim() ? node.name : node ? nodeDisplayName(node) : ''
      if (node && initial !== clean) s.setNodeName(row.id, clean)
    }
  }

  /* ── drag & drop ────────────────────────────────────────────────────── */

  /** Which drop zone the pointer is over, or null when the target is invalid. */
  function computeZone(row: Row, event: DragEvent): DropZone | null {
    if (!drag) return null
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientY - rect.top) / Math.max(1, rect.height)

    if (drag.kind === 'group') {
      if (row.kind !== 'group' || row.id === drag.id) return null
      return ratio < 0.5 ? 'above' : 'below'
    }

    if (drag.kind === 'screen') {
      if (row.kind === 'group') return 'inside' // whole group row = move into it
      if (row.kind === 'screen' && row.id !== drag.id) return ratio < 0.5 ? 'above' : 'below'
      return null
    }

    // node drag: same screen only, never into its own subtree
    if (row.kind === 'node') {
      if (row.id === drag.id || row.screenId !== drag.screenId) return null
      if (isInSubtree(useProjectStore.getState().data, row.id, drag.id)) return null
      const node = useProjectStore.getState().data.nodes[row.id]
      if (node && nodeAcceptsChildren(useProjectStore.getState().data, node)) {
        if (ratio < 0.25) return 'above'
        if (ratio > 0.75) return 'below'
        return 'inside'
      }
      return ratio < 0.5 ? 'above' : 'below'
    }
    if (row.kind === 'screen' && row.id === drag.screenId) return 'inside' // to screen root
    return null
  }

  function handleDragStart(row: Row, event: DragEvent) {
    if (!event.dataTransfer) return
    event.dataTransfer.setData('application/x-expoforge-tree', row.id)
    event.dataTransfer.effectAllowed = 'move'
    setDrag({
      kind: row.kind,
      id: row.id,
      screenId: row.kind === 'node' ? row.screenId : undefined
    })
  }

  function handleDragOver(row: Row, event: DragEvent) {
    if (!drag) return
    const zone = computeZone(row, event)
    if (!zone) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget((current) =>
      current && current.id === row.id && current.zone === zone ? current : { id: row.id, zone }
    )
  }

  function handleDrop(row: Row, event: DragEvent) {
    const zone = dropTarget?.id === row.id ? dropTarget.zone : computeZone(row, event)
    const payload = drag
    resetDrag()
    if (!payload || !zone) return
    event.preventDefault()
    const s = useProjectStore.getState()
    const d = s.data

    if (payload.kind === 'group' && row.kind === 'group') {
      const groups = sortedGroups(d).filter((g) => g.id !== payload.id)
      const idx = groups.findIndex((g) => g.id === row.id)
      if (idx >= 0) s.moveGroup(payload.id, zone === 'above' ? idx : idx + 1)
      return
    }

    if (payload.kind === 'screen') {
      if (row.kind === 'group') {
        const bucket = screensInBucket(d, row.id).filter((x) => x.id !== payload.id)
        s.moveScreen(payload.id, row.id, bucket.length)
      } else if (row.kind === 'screen') {
        const bucket = screensInBucket(d, row.groupId).filter((x) => x.id !== payload.id)
        const idx = bucket.findIndex((x) => x.id === row.id)
        if (idx >= 0) s.moveScreen(payload.id, row.groupId, zone === 'above' ? idx : idx + 1)
      }
      return
    }

    if (payload.kind === 'node') {
      if (row.kind === 'node') {
        const target = d.nodes[row.id]
        if (!target) return
        if (zone === 'inside') {
          if (!nodeAcceptsChildren(d, target)) return
          const children = childNodes(d, row.screenId, row.id).filter((n) => n.id !== payload.id)
          s.moveNode(payload.id, row.id, children.length)
        } else {
          const siblings = childNodes(d, row.screenId, target.parentId).filter(
            (n) => n.id !== payload.id
          )
          const idx = siblings.findIndex((n) => n.id === row.id)
          if (idx >= 0) s.moveNode(payload.id, target.parentId, zone === 'above' ? idx : idx + 1)
        }
      } else if (row.kind === 'screen' && row.id === payload.screenId) {
        const roots = childNodes(d, row.id, null).filter((n) => n.id !== payload.id)
        s.moveNode(payload.id, null, roots.length)
      }
    }
  }

  function handleStandaloneDragOver(event: DragEvent) {
    if (drag?.kind !== 'screen') return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget((current) =>
      current && current.id === STANDALONE_DROP_KEY ? current : { id: STANDALONE_DROP_KEY, zone: 'inside' }
    )
  }

  function handleStandaloneDrop(event: DragEvent) {
    const payload = drag
    resetDrag()
    if (payload?.kind !== 'screen') return
    event.preventDefault()
    const s = useProjectStore.getState()
    const bucket = screensInBucket(s.data, null).filter((x) => x.id !== payload.id)
    s.moveScreen(payload.id, null, bucket.length)
  }

  function resetDrag() {
    setDrag(null)
    setDropTarget(null)
  }

  /* ── keyboard ───────────────────────────────────────────────────────── */
  function moveWithinSiblings(row: Row, dir: -1 | 1) {
    const s = useProjectStore.getState()
    if (row.kind === 'group') {
      const list = sortedGroups(s.data)
      const idx = list.findIndex((g) => g.id === row.id)
      const to = idx + dir
      if (idx >= 0 && to >= 0 && to < list.length) s.moveGroup(row.id, to)
    } else if (row.kind === 'screen') {
      const bucket = screensInBucket(s.data, row.groupId)
      const idx = bucket.findIndex((x) => x.id === row.id)
      const to = idx + dir
      if (idx >= 0 && to >= 0 && to < bucket.length) s.moveScreen(row.id, row.groupId, to)
    } else {
      const node = s.data.nodes[row.id]
      if (!node) return
      const siblings = childNodes(s.data, row.screenId, node.parentId)
      const idx = siblings.findIndex((n) => n.id === row.id)
      const to = idx + dir
      if (idx >= 0 && to >= 0 && to < siblings.length) s.moveNode(row.id, node.parentId, to)
    }
  }

  function focusRow(id: string) {
    const el = viewportRef.current?.querySelector<HTMLLIElement>(
      `[data-tree-id="${CSS.escape(id)}"]`
    )
    el?.focus()
  }

  function handleKeyDown(row: Row, event: ReactKeyboardEvent) {
    if (renamingId === row.id) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleSelect(row)
    } else if (event.key === 'F2') {
      event.preventDefault()
      setRenamingId(row.id)
    } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      moveWithinSiblings(row, event.key === 'ArrowUp' ? -1 : 1)
    } else if (event.key === 'ArrowRight') {
      const s = useProjectStore.getState()
      const isExpandable =
        row.kind === 'group' || (row.kind === 'screen' && nodeCountOf(s.data, row.id) > 0)
      if (!model.searching && isExpandable && !s.ui.expanded[row.id]) {
        event.preventDefault()
        s.setExpanded(row.id, true)
      } else {
        const idx = model.rows.findIndex((r) => r.id === row.id)
        const next = model.rows[idx + 1]
        if (next && next.depth > row.depth) {
          event.preventDefault()
          focusRow(next.id)
        }
      }
    } else if (event.key === 'ArrowLeft') {
      const s = useProjectStore.getState()
      const isExpandable =
        row.kind === 'group' || (row.kind === 'screen' && nodeCountOf(s.data, row.id) > 0)
      if (!model.searching && isExpandable && s.ui.expanded[row.id]) {
        event.preventDefault()
        s.setExpanded(row.id, false)
      } else if (row.depth > 0) {
        const idx = model.rows.findIndex((r) => r.id === row.id)
        for (let i = idx - 1; i >= 0; i -= 1) {
          if (model.rows[i].depth === row.depth - 1) {
            event.preventDefault()
            focusRow(model.rows[i].id)
            break
          }
        }
      }
    }
  }

  /* ── delete confirmations ───────────────────────────────────────────── */
  const deleteTarget = deleteRequest
    ? deleteRequest.kind === 'group'
      ? data.groups.find((g) => g.id === deleteRequest.id)
      : data.screens.find((x) => x.id === deleteRequest.id)
    : null
  const deleteTargetCount =
    deleteRequest?.kind === 'group'
      ? screensInBucket(data, deleteRequest.id).length
      : 0

  function confirmDelete() {
    if (!deleteRequest) return
    const s = useProjectStore.getState()
    if (deleteRequest.kind === 'group') s.deleteGroup(deleteRequest.id)
    else s.deleteScreen(deleteRequest.id)
  }

  /* ── render ─────────────────────────────────────────────────────────── */
  const items: ReactNode[] = []
  let standaloneDividerShown = false
  for (const row of model.rows) {
    if (row.kind === 'screen' && row.groupId === null && !standaloneDividerShown) {
      standaloneDividerShown = true
      items.push(
        <li
          key="divider-standalone"
          role="presentation"
          aria-hidden
          className={treeStyles.divider()}
        >
          <span className="shrink-0 pr-1.5 text-[10px] text-muted">Standalone</span>
          <span className={treeStyles.dividerLine()} />
        </li>
      )
    }

    const expandable =
      row.kind === 'group'
        ? !model.searching
        : row.kind === 'screen' && !model.searching && nodeCountOf(data, row.id) > 0

    items.push(
      <TreeRow
        key={row.id}
        row={row}
        selected={isSelected(row)}
        panelFocused={panelFocused}
        expandable={expandable}
        expanded={Boolean(expanded[row.id])}
        dropZone={dropTarget?.id === row.id ? dropTarget.zone : null}
        dragging={drag?.id === row.id}
        renaming={renamingId === row.id}
        onSelect={handleSelect}
        onToggleExpand={handleToggleExpand}
        onStartRename={(r) => setRenamingId(r.id)}
        onCommitRename={handleCommitRename}
        onCancelRename={() => setRenamingId(null)}
        onDeleteRequest={(r) =>
          setDeleteRequest(r.kind === 'node' ? null : { kind: r.kind, id: r.id })
        }
        onKeyDown={handleKeyDown}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={resetDrag}
      />
    )
  }

  return (
    <section aria-label="Screens and layers" className={cn('flex min-h-0 flex-col', className)}>
      {!model.hasContent ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <SlotIcon slot="tree.empty-groups" className={treeStyles.emptyIcon()} aria-hidden />
          <div>
            <p className="text-[11px] font-semibold text-surface">Nothing here yet</p>
            <p className="mx-auto mt-1 max-w-48 text-[10px] leading-relaxed text-muted">
              Create a group to organize screens with navigation — or start with a standalone
              screen.
            </p>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <button
              type="button"
              onClick={onNewGroup}
              className={btnPrimary}
            >
              <SlotIcon slot="panel.new-group" className="size-3" aria-hidden />
              New group…
            </button>
            <button
              type="button"
              onClick={onNewScreen}
              className={btnOutline}
            >
              <SlotIcon slot="panel.new-screen" className="size-3" aria-hidden />
              New screen
            </button>
          </div>
        </div>
      ) : model.rows.length === 0 ? (
        <div className="px-3 py-6 text-center text-[11px] text-muted">
          No matches for “{query}”.
          <span className="ml-1 text-muted/70">Groups are always shown by name.</span>
        </div>
      ) : (
        <motion.ul
          ref={viewportRef}
          role="tree"
          aria-label="Screens and layers"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.15, ease: 'easeOut' }}
          className={treeStyles.viewport()}
          onDragLeave={(event) => {
            // clear the stale three-zone indicator once the pointer leaves the list
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDropTarget(null)
            }
          }}
        >
          {items}
          {drag?.kind === 'screen' ? (
            <li role="presentation" className="mt-1 px-1">
              <div
                onDragOver={handleStandaloneDragOver}
                onDrop={handleStandaloneDrop}
                className={treeStyles.dropZone({
                  dropZoneActive: dropTarget?.id === STANDALONE_DROP_KEY
                })}
              >
                <SlotIcon slot="tree.screen" className="size-3 shrink-0" aria-hidden />
                Drop here to make standalone
              </div>
            </li>
          ) : null}
        </motion.ul>
      )}

      {deleteRequest && deleteTarget ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteRequest(null)
          }}
        >
          <AlertDialogContent
            className={cn(
              floatingSurface,
              'w-[min(24rem,92vw)] gap-0 overflow-hidden border-none p-0'
            )}
          >
            <AlertDialogHeader className="px-4 pt-4 text-left">
              <AlertDialogTitle className="text-sm font-semibold text-surface">
                {deleteRequest.kind === 'group'
                  ? `Delete group “${deleteTarget.name}”?`
                  : `Delete screen “${deleteTarget.name}”?`}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs leading-relaxed text-muted">
                {deleteRequest.kind === 'group'
                  ? `This removes the group and its ${deleteTargetCount} ${
                      deleteTargetCount === 1 ? 'screen' : 'screens'
                    }, including all layers.`
                  : 'This removes the screen and all of its layers.'}{' '}
                You can undo with ⌘Z.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="border-t border-border px-4 py-3">
              <AlertDialogCancel className={btnSubtle}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className={btnError}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </section>
  )
}
