'use client'

/*
 * Code tab (all selection kinds) — read-only view of the generated project:
 * generateProjectFiles(data) memoized on the store data (every commit bumps
 * it), the file list as codegenFileList(files) in a path-picker popover
 * (compact tree, dirs first), and the file body through react-syntax-highlighter
 * (Prism + vscDarkPlus — the only theme registered). The picker auto-follows
 * the selection (group → its _layout.tsx, screen/node → the screen file,
 * nothing → the root layout); a manual pick sticks until the selection moves.
 */

import { useState, useMemo, type Dispatch, type SetStateAction } from 'react'
import { tv } from 'tailwind-variants'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus'
import { SlotIcon } from '@/components/builder/icons/slots'

import iconButtonTheme from '@/app/theme/button/icon-button'
import { floatingSurface } from '@/app/theme/overlay'
import { codegenFileList, generateProjectFiles, type FileTreeNode } from '@/lib/codegen'
import { useProjectStore } from '@/lib/project/store'
import type { ProjectData, Selection } from '@/lib/project/types'
import { cn } from '@/lib/utils'
import { QuietHint } from '../shared'

const iconButtonStyles = tv(iconButtonTheme)

const COPY_RESET_MS = 1500

/** Language per file extension (generated projects are tsx/ts/json only). */
function languageOf(path: string): string {
  if (path.endsWith('.tsx')) return 'tsx'
  if (path.endsWith('.ts')) return 'typescript'
  if (path.endsWith('.json')) return 'json'
  return 'text'
}

/**
 * The file the current selection should show. Routes are globally unique, so
 * a suffix match is unambiguous; standalone screens live at app/<route>.tsx,
 * group screens under app/(<dir>)/<route>.tsx.
 */
export function autoPickFile(files: Map<string, string>, selection: Selection, data: ProjectData): string | null {
  if (selection?.kind === 'group') {
    const group = data.groups.find((g) => g.id === selection.groupId)
    if (group) {
      const layout = `(${group.dirName})/_layout.tsx`
      const hit = [...files.keys()].find((path) => path.endsWith(layout))
      if (hit) return hit
    }
  }
  if (selection?.kind === 'screen' || selection?.kind === 'node') {
    const screen = data.screens.find((s) => s.id === selection.screenId)
    if (screen) {
      const hit = [...files.keys()].find((path) => path === `app/${screen.route}.tsx` || path.endsWith(`/${screen.route}.tsx`))
      if (hit) return hit
    }
  }
  return files.has('app/_layout.tsx') ? 'app/_layout.tsx' : ([...files.keys()][0] ?? null)
}

export interface CodeTabProps {
  selection: Selection
  className?: string
}

export function CodeTab({ selection, className }: CodeTabProps) {
  const data = useProjectStore((s) => s.data)
  const revision = useProjectStore((s) => s.revision)

  // Memo on the committed data (revision bumps on every commit / undo / redo).
  const files = useMemo(() => generateProjectFiles(data), [data, revision])
  const tree = useMemo(() => codegenFileList(files), [files])

  const autoPick = useMemo(() => autoPickFile(files, selection, data), [files, selection, data])
  const [manualPick, setManualPick] = useState<string | null>(null)
  // A manual pick sticks until the selection changes…
  const [lastSelectionKey, setLastSelectionKey] = useState(selectionKey(selection))
  const selectionChanged = selectionKey(selection) !== lastSelectionKey
  if (selectionChanged) {
    setLastSelectionKey(selectionKey(selection))
    setManualPick(null)
  }
  // …or until it stops resolving (renames regenerate the file map).
  const effective = manualPick && files.has(manualPick) ? manualPick : autoPick

  const [pickerOpen, setPickerOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const content = effective ? (files.get(effective) ?? '') : ''
  const isEmptyProject = data.groups.length === 0 && data.screens.length === 0

  async function copy() {
    if (!effective) return
    try {
      await navigator.clipboard.writeText(files.get(effective) ?? '')
    } catch {
      // Clipboard unavailable (permissions / non-secure context) — flip anyway.
    }
    setCopied(true)
    setTimeout(() => setCopied(false), COPY_RESET_MS)
  }

  if (isEmptyProject) {
    return (
      <QuietHint
        icon="inspector.file-code"
        title="Nothing to generate yet"
        description="Add a group or screen from the left panel — the generated Expo Router files appear here."
        className={className}
      />
    )
  }

  return (
    <div className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
      {/* File path header + copy */}
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border px-1.5">
        <FilePickerTrigger path={effective} open={pickerOpen} onOpenChange={setPickerOpen} />
        <button
          type="button"
          data-slot="icon-button"
          onClick={copy}
          disabled={!effective}
          aria-label={copied ? 'Copied' : 'Copy file'}
          className={cn(iconButtonStyles({ size: 'xs' }), copied && 'text-success')}
        >
          {copied ? <SlotIcon slot="inspector.check" aria-hidden="true" className="size-3" /> : <SlotIcon slot="inspector.copy" aria-hidden="true" className="size-3" />}
        </button>
        <span role="status" className="sr-only">
          {copied ? 'Code copied to clipboard' : ''}
        </span>
      </div>

      {/* Code viewer */}
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin bg-panel-secondary">
        {effective ? (
          <SyntaxHighlighter
            language={languageOf(effective)}
            style={vscDarkPlus}
            customStyle={{ background: 'transparent', margin: 0, padding: '12px', fontSize: '11px', lineHeight: '1.5' }}
            codeTagProps={{ style: { fontFamily: 'var(--font-mono, ui-monospace, monospace)' } }}
          >
            {content}
          </SyntaxHighlighter>
        ) : (
          <p className="px-3 py-6 text-center text-[11px] text-muted">No file selected.</p>
        )}
      </div>

      {/* The picker itself (popover) */}
      <FilePickerPopover
        tree={tree}
        selected={effective}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(path) => {
          setManualPick(path)
          setPickerOpen(false)
        }}
      />
    </div>
  )
}

function selectionKey(selection: Selection): string {
  if (!selection) return 'none'
  if (selection.kind === 'group' || selection.kind === 'nav') return `group:${selection.groupId}`
  if (selection.kind === 'screen') return `screen:${selection.screenId}`
  return `node:${selection.nodeId}`
}

/* ─── File path trigger (opens the tree popover) ───────────────────────────── */

function FilePickerTrigger({
  path,
  open,
  onOpenChange
}: {
  path: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => onOpenChange(!open)}
      className="flex h-6 min-w-0 flex-1 items-center gap-1 rounded border border-transparent bg-panel-field px-1.5 text-[11px] text-surface outline-none hover:bg-panel-field-hover focus-visible:border-panel-focus"
    >
      <SlotIcon slot="inspector.file-code" aria-hidden="true" className="size-3 shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate text-left font-mono">{path ?? '—'}</span>
      <SlotIcon slot="inspector.chevron-down" aria-hidden="true" className="size-3 shrink-0 text-muted" />
    </button>
  )
}

/* ─── Compact tree popover (dirs first, alphabetical — codegenFileList order) ─ */

function FilePickerPopover({
  tree,
  selected,
  open,
  onOpenChange,
  onPick
}: {
  tree: FileTreeNode[]
  selected: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (path: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Generated files"
      className={cn(
        floatingSurface,
        'absolute inset-x-1.5 top-9 z-50 max-h-72 overflow-y-auto scrollbar-thin p-1',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-150 motion-reduce:animate-none'
      )}
    >
      {tree.length === 0 ? <p className="px-2 py-3 text-center text-[11px] text-muted">No files.</p> : null}
      <TreeRows nodes={tree} depth={0} selected={selected} collapsed={collapsed} setCollapsed={setCollapsed} onPick={onPick} />
    </div>
  )
}

function TreeRows({
  nodes,
  depth,
  selected,
  collapsed,
  setCollapsed,
  onPick
}: {
  nodes: FileTreeNode[]
  depth: number
  selected: string | null
  collapsed: Record<string, boolean>
  setCollapsed: Dispatch<SetStateAction<Record<string, boolean>>>
  onPick: (path: string) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.type === 'dir') {
          const isCollapsed = collapsed[node.path] ?? false
          return (
            <div key={node.path}>
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => setCollapsed((prev) => ({ ...prev, [node.path]: !isCollapsed }))}
                className="flex h-6 w-full min-w-0 cursor-pointer items-center gap-1 rounded px-1 text-left text-[11px] text-muted outline-none hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus"
                style={{ paddingLeft: 4 + depth * 12 }}
              >
                <SlotIcon
                  slot="inspector.section-collapse"
                  aria-hidden="true"
                  className={cn('size-3 shrink-0 transition-transform motion-reduce:transition-none', !isCollapsed && 'rotate-90')}
                />
                <span className="truncate">{node.name}</span>
              </button>
              {!isCollapsed && node.children && node.children.length > 0 ? (
                <TreeRows
                  nodes={node.children}
                  depth={depth + 1}
                  selected={selected}
                  collapsed={collapsed}
                  setCollapsed={setCollapsed}
                  onPick={onPick}
                />
              ) : null}
            </div>
          )
        }
        const active = node.path === selected
        return (
          <button
            key={node.path}
            type="button"
            onClick={() => onPick(node.path)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex h-6 w-full min-w-0 cursor-pointer items-center gap-1 rounded px-1 text-left text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-panel-focus',
              active ? 'bg-accent/15 text-surface' : 'text-surface hover:bg-hover'
            )}
            style={{ paddingLeft: 4 + depth * 12 + 14 }}
          >
            <SlotIcon slot="inspector.file-code" aria-hidden="true" className="size-3 shrink-0 text-muted" />
            <span className="truncate font-mono">{node.name}</span>
          </button>
        )
      })}
    </>
  )
}
