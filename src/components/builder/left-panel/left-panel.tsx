'use client'

/**
 * LeftPanel — the builder's left rail, reworked to a single hierarchy tree
 * (groups → screens → layers) over the project store. Zero data props: the
 * tree, the header count, and every action read from `useProjectStore`.
 *
 * Layout: SCREENS header (count + a "＋" menu for New group… / New screen),
 * a filter input (`/` focuses it while the panel holds focus), then the
 * HierarchyTree. The group-creation dialog lives here (opened from the header
 * menu and the tree's empty-state CTA).
 */
import { useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { SlotIcon } from '@/components/builder/icons/slots'
import { GroupDialog } from '@/components/builder/dialogs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useProjectStore } from '@/lib/project/store'
import { cn } from '@/lib/utils'
import { HierarchyTree } from './hierarchy-tree'
import { PanelSearchInput } from './search-input'
import { useFocusWithin } from './use-focus-within'

export interface LeftPanelProps {
  className?: string
}

export function LeftPanel({ className }: LeftPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelFocused = useFocusWithin(rootRef)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)

  const screenCount = useProjectStore((s) => s.data.screens.length)
  const addScreen = useProjectStore((s) => s.addScreen)

  /** `/` focuses the filter while the panel holds focus (and no field is active). */
  function handleKeyDown(event: ReactKeyboardEvent) {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
    if (!panelFocused) return
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return
    }
    event.preventDefault()
    searchInputRef.current?.focus()
  }

  return (
    <div
      ref={rootRef}
      aria-label="Screens and layers"
      onKeyDown={handleKeyDown}
      className={cn('flex min-w-0 flex-1 flex-col overflow-hidden bg-panel', className)}
      style={{ contain: 'paint layout style' } as CSSProperties}
    >
      <header className="grid min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 border-b border-border px-3 py-2 text-surface">
        <h2 className="min-w-0 truncate text-xs font-semibold tracking-wide text-surface">
          Screens
        </h2>
        <div className="flex min-w-0 items-center gap-1">
          <span
            className="text-[10px] leading-none text-muted tabular-nums"
            aria-label={`${screenCount} ${screenCount === 1 ? 'screen' : 'screens'}`}
            title={`${screenCount} ${screenCount === 1 ? 'screen' : 'screens'}`}
          >
            {screenCount}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Add group or screen"
              title="Add group or screen"
              className="flex size-5 cursor-pointer items-center justify-center rounded border-none bg-transparent text-muted outline-none hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus data-[state=open]:bg-hover data-[state=open]:text-surface"
            >
              <SlotIcon slot="panel.new" className="size-3.5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40 border-border bg-popover text-popover-foreground">
              <DropdownMenuItem
                className="gap-2 text-xs"
                onClick={() => setGroupDialogOpen(true)}
              >
                <SlotIcon slot="panel.new-group" className="size-3.5 text-muted" aria-hidden />
                New group…
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs" onClick={() => addScreen()}>
                <SlotIcon slot="panel.new-screen" className="size-3.5 text-muted" aria-hidden />
                New screen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-1.5 px-2 py-1.5">
        <PanelSearchInput
          value={query}
          onChange={setQuery}
          placeholder="Filter screens and layers…"
          ariaLabel="Filter screens and layers"
          inputRef={searchInputRef}
        />
        <kbd
          aria-hidden
          className="shrink-0 rounded border border-border bg-panel-field px-1 py-px font-sans text-[9px] leading-none text-muted"
          title="Press / to filter"
        >
          /
        </kbd>
      </div>

      <HierarchyTree
        query={query}
        panelFocused={panelFocused}
        onNewGroup={() => setGroupDialogOpen(true)}
        onNewScreen={() => addScreen()}
        className="min-h-0 flex-1 border-t border-border"
      />

      <GroupDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} />
    </div>
  )
}

export default LeftPanel
