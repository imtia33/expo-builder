'use client'

/**
 * TreeRow — one row of the hierarchy tree, dispatched by kind (group | screen
 * | layer). Each sub-view reads its own entity straight from the project
 * store (no data props beyond identity) and renders kind-specific content:
 *
 *  - group:  nav-kind glyph + name + kind label + screen-count badge; hover
 *            actions: add screen / inspect (select) / delete (confirm).
 *  - screen: device glyph + name + live route (→ /slug) + platform·device
 *            chips; hover action: delete (confirm).
 *  - layer:  registry glyph + label (text nodes show their content snippet);
 *            hover actions: visibility toggle + delete (no confirm — undo).
 *
 * Shared behavior (selection, expand, inline rename, DnD zones, keyboard) is
 * delegated to the parent HierarchyTree so zone math and drop resolution stay
 * centralized; the RowShell renders the common anatomy.
 */
import { useState } from 'react'
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent, ReactNode } from 'react'
import { SlotIcon } from '@/components/builder/icons/slots'
import { deviceById } from '@/components/builder/screens/device-presets'
import { useProjectStore } from '@/lib/project/store'
import { cn } from '@/lib/utils'
import { tv } from 'tailwind-variants'
import { NAV_ICON, NAV_LABEL, SCREEN_ICON } from './kind-icons'
import { isListEntryType, LIST_ROLE_LABEL } from '@/lib/lists/bindings'
import { nodeDisplayName, nodeIconSlot } from './tree-model'
import hierarchyTreeTheme from './tree-theme'
import type { DropZone, TreeRow as Row } from './types'

const treeStyles = tv(hierarchyTreeTheme)()

/* ── interaction contract shared by every row ─────────────────────────── */

export interface RowHandlers {
  onSelect: (row: Row) => void
  onToggleExpand: (row: Row) => void
  onStartRename: (row: Row) => void
  onCommitRename: (row: Row, value: string) => void
  onCancelRename: () => void
  onDeleteRequest: (row: Row) => void
  onKeyDown: (row: Row, event: ReactKeyboardEvent) => void
  onDragStart: (row: Row, event: DragEvent) => void
  onDragOver: (row: Row, event: DragEvent) => void
  onDrop: (row: Row, event: DragEvent) => void
  onDragEnd: (event: DragEvent) => void
}

interface RowVisuals {
  selected: boolean
  panelFocused: boolean
  expandable: boolean
  expanded: boolean
  dropZone: DropZone | null
  dragging: boolean
  renaming: boolean
  dimmed?: boolean
}

/* ── inline rename input: Enter commits, Escape cancels, blur commits ── */

function InlineRename({
  initial,
  onCommit,
  onCancel
}: {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <input
      autoFocus
      aria-label="Rename"
      value={value}
      spellCheck={false}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          onCommit(value)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
      onBlur={() => onCommit(value)}
      className={treeStyles.renameInput()}
    />
  )
}

/* ── shared row anatomy (chevron · icon · [rename | content] · indicator) ─ */

function RowShell({
  row,
  label,
  icon,
  renameInitial,
  handlers,
  visuals,
  children
}: {
  row: Row
  label: string
  icon: ReactNode
  renameInitial: string
  handlers: RowHandlers
  visuals: RowVisuals
  children: ReactNode
}) {
  const { selected, panelFocused, expandable, expanded, dropZone, dragging, renaming } = visuals
  return (
    <li
      data-tree-id={row.id}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={expandable ? expanded : undefined}
      tabIndex={renaming ? -1 : 0}
      draggable={!renaming}
      style={{ paddingLeft: 4 + row.depth * 12 }}
      className={cn(
        treeStyles.row({
          selected,
          focused: panelFocused,
          dragging,
          dimmed: visuals.dimmed ?? false,
          expanded: expandable ? expanded : undefined,
          insideTarget: dropZone === 'inside'
        }),
        'outline-none focus-visible:ring-1 focus-visible:ring-panel-focus'
      )}
      onClick={() => {
        if (!renaming) handlers.onSelect(row)
      }}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('button, input, [role="radio"]')) return
        handlers.onStartRename(row)
      }}
      onKeyDown={(event) => handlers.onKeyDown(row, event)}
      onDragStart={(event) => handlers.onDragStart(row, event)}
      onDragOver={(event) => handlers.onDragOver(row, event)}
      onDrop={(event) => handlers.onDrop(row, event)}
      onDragEnd={handlers.onDragEnd}
    >
      {expandable ? (
        <button
          type="button"
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          className={cn(
            treeStyles.chevron({ expanded: expanded || undefined }),
            'outline-none focus-visible:ring-1 focus-visible:ring-panel-focus'
          )}
          onClick={(event) => {
            event.stopPropagation()
            handlers.onToggleExpand(row)
          }}
        >
          <SlotIcon slot="tree.collapse" className="size-3" aria-hidden />
        </button>
      ) : (
        <span className={treeStyles.chevronSpacer()} aria-hidden />
      )}

      {icon}

      {renaming ? (
        <InlineRename
          initial={renameInitial}
          onCommit={(value) => handlers.onCommitRename(row, value)}
          onCancel={handlers.onCancelRename}
        />
      ) : (
        children
      )}

      {dropZone ? (
        <span aria-hidden className={treeStyles.dropIndicator({ dropPosition: dropZone })} />
      ) : null}
    </li>
  )
}

function stopAndRun(event: MouseEvent, run: () => void) {
  event.stopPropagation()
  run()
}

/* ── group row ────────────────────────────────────────────────────────── */

function GroupRowContent({
  row,
  handlers,
  visuals
}: {
  row: Extract<Row, { kind: 'group' }>
  handlers: RowHandlers
  visuals: RowVisuals
}) {
  const group = useProjectStore((s) => s.data.groups.find((g) => g.id === row.id))
  const screenCount = useProjectStore((s) => s.data.screens.filter((x) => x.groupId === row.id).length)
  const addScreen = useProjectStore((s) => s.addScreen)
  const select = useProjectStore((s) => s.select)
  if (!group) return null

  return (
    <RowShell
      row={row}
      label={group.name}
      renameInitial={group.name}
      handlers={handlers}
      visuals={{ ...visuals, expandable: true }}
      icon={<SlotIcon slot={NAV_ICON[group.nav.kind]} className={treeStyles.icon()} aria-hidden />}
    >
      <span className={treeStyles.label()}>
        <span className="min-w-0 truncate">{group.name}</span>
        <span className={cn(treeStyles.secondary(), 'hidden max-w-24 sm:inline')}>
          {NAV_LABEL[group.nav.kind]}
        </span>
      </span>
      <span className={treeStyles.countBadge()} title={`${screenCount} ${screenCount === 1 ? 'screen' : 'screens'}`}>
        {screenCount}
      </span>
      <div className={treeStyles.actions({ actionsVisible: false })}>
        <button
          type="button"
          aria-label={`Add screen to ${group.name}`}
          title="Add screen to this group"
          className={treeStyles.action()}
          onClick={(event) => stopAndRun(event, () => addScreen({ groupId: group.id }))}
        >
          <SlotIcon slot="tree.add-screen" className={treeStyles.actionIcon()} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Inspect ${group.name}`}
          title="Select group (inspector)"
          className={treeStyles.action()}
          onClick={(event) => stopAndRun(event, () => select({ kind: 'group', groupId: group.id }))}
        >
          <SlotIcon slot="tree.inspect" className={treeStyles.actionIcon()} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Delete ${group.name}`}
          title="Delete group"
          className={treeStyles.action()}
          onClick={(event) => stopAndRun(event, () => handlers.onDeleteRequest(row))}
        >
          <SlotIcon slot="tree.delete" className={treeStyles.actionIcon()} aria-hidden />
        </button>
      </div>
    </RowShell>
  )
}

/* ── screen row ───────────────────────────────────────────────────────── */

function ScreenRowContent({
  row,
  handlers,
  visuals
}: {
  row: Extract<Row, { kind: 'screen' }>
  handlers: RowHandlers
  visuals: RowVisuals
}) {
  const screen = useProjectStore((s) => s.data.screens.find((x) => x.id === row.id))
  const layerCount = useProjectStore((s) => {
    let count = 0
    for (const id in s.data.nodes) if (s.data.nodes[id].screenId === row.id) count += 1
    return count
  })
  if (!screen) return null

  const device = deviceById(screen.deviceId)

  return (
    <RowShell
      row={row}
      label={screen.name}
      renameInitial={screen.name}
      handlers={handlers}
      visuals={{ ...visuals, expandable: layerCount > 0 }}
      icon={<SlotIcon slot={SCREEN_ICON} className={treeStyles.icon()} aria-hidden />}
    >
      <span className={treeStyles.label()}>
        <span className="min-w-0 truncate">{screen.name}</span>
        <span className={cn(treeStyles.secondary(), 'max-w-[45%]')} title={`Route /${screen.route}`}>
          → /{screen.route}
        </span>
      </span>
      <span className={treeStyles.chips()} title={device.label}>
        <span className="max-w-20 truncate">{device.label}</span>
      </span>
      <div className={treeStyles.actions({ actionsVisible: false })}>
        <button
          type="button"
          aria-label={`Delete ${screen.name}`}
          title="Delete screen"
          className={treeStyles.action()}
          onClick={(event) => stopAndRun(event, () => handlers.onDeleteRequest(row))}
        >
          <SlotIcon slot="tree.delete" className={treeStyles.actionIcon()} aria-hidden />
        </button>
      </div>
    </RowShell>
  )
}

/* ── layer (node) row ─────────────────────────────────────────────────── */

function NodeRowContent({
  row,
  handlers,
  visuals
}: {
  row: Extract<Row, { kind: 'node' }>
  handlers: RowHandlers
  visuals: RowVisuals
}) {
  const node = useProjectStore((s) => s.data.nodes[row.id])
  const parent = useProjectStore((s) => (row.id ? s.data.nodes[s.data.nodes[row.id]?.parentId ?? ''] ?? null : null))
  const toggleNodeHidden = useProjectStore((s) => s.toggleNodeHidden)
  const deleteNode = useProjectStore((s) => s.deleteNode)
  if (!node) return null

  const label = nodeDisplayName(node)
  const hidden = Boolean(node.hidden)
  // List role chip (Phase 2): non-item roles get a muted tag so list chrome
  // reads at a glance in the tree (item = the default template, no chip).
  const roleLabel =
    parent && isListEntryType(parent.type) && node.listRole && node.listRole !== 'item'
      ? LIST_ROLE_LABEL[node.listRole]
      : null

  return (
    <RowShell
      row={row}
      label={label}
      renameInitial={node.name?.trim() ? node.name : label}
      handlers={handlers}
      visuals={{ ...visuals, dimmed: hidden, expandable: false }}
      icon={<SlotIcon slot={nodeIconSlot(node)} className={treeStyles.icon()} aria-hidden />}
    >
      <span className={treeStyles.label()}>
        <span className="min-w-0 truncate">{label}</span>
        {roleLabel ? (
          <span className="ml-1 shrink-0 rounded bg-panel-field px-1 py-px text-[10px] leading-4 text-muted">
            {roleLabel}
          </span>
        ) : null}
      </span>
      <div className={treeStyles.actions({ actionsVisible: false })}>
        <button
          type="button"
          aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
          aria-pressed={hidden}
          title={hidden ? 'Show layer' : 'Hide layer'}
          className={treeStyles.action()}
          onClick={(event) => stopAndRun(event, () => toggleNodeHidden(node.id))}
        >
          <SlotIcon
            slot={hidden ? 'tree.hidden' : 'tree.visible'}
            className={treeStyles.actionIcon({ actionActive: hidden })}
            aria-hidden
          />
        </button>
        <button
          type="button"
          aria-label={`Delete ${label}`}
          title="Delete layer"
          className={treeStyles.action()}
          onClick={(event) => stopAndRun(event, () => deleteNode(node.id))}
        >
          <SlotIcon slot="tree.delete" className={treeStyles.actionIcon()} aria-hidden />
        </button>
      </div>
    </RowShell>
  )
}

/* ── dispatcher ───────────────────────────────────────────────────────── */

export interface TreeRowProps extends RowHandlers, RowVisuals {
  row: Row
}

export function TreeRow({ row, ...rest }: TreeRowProps) {
  const handlers: RowHandlers = rest
  const visuals: RowVisuals = rest
  if (row.kind === 'group') return <GroupRowContent row={row} handlers={handlers} visuals={visuals} />
  if (row.kind === 'screen') return <ScreenRowContent row={row} handlers={handlers} visuals={visuals} />
  return <NodeRowContent row={row} handlers={handlers} visuals={visuals} />
}
