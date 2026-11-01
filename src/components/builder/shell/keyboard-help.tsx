'use client'

import { SlotIcon } from '@/components/builder/icons/slots'
import { tv } from 'tailwind-variants'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { floatingSurface } from '@/app/theme/overlay'
import buttonTheme from '@/app/theme/button/button'
import { cn } from '@/lib/utils'

import { formatShortcut } from './shortcut-format'

const buttonStyles = tv(buttonTheme)
const closeButtonClasses = buttonStyles({ color: 'neutral', variant: 'subtle', size: 'sm' })

export interface ShortcutItem {
  label: string
  /** Combos in tinykeys notation (`"$mod+Shift+Z"`); each renders as its own key cap. */
  keys: string[]
}

export interface ShortcutGroup {
  title: string
  items: ShortcutItem[]
}

/**
 * The builder's keyboard map, regenerated for the task 10-F rework — every
 * listed binding is live: tool letters (V/H/S/T/B/I, toolbar-owned), global
 * history (shell-owned), canvas zoom (⌘0/⌘1/⇧1, wired by page.tsx), and the
 * interface keys. As shown by {@link KeyboardHelp}.
 */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Tools',
    items: [
      { label: 'Select', keys: ['V'] },
      { label: 'Hand', keys: ['H'] },
      { label: 'Screen (place a new one)', keys: ['S'] },
      { label: 'Text', keys: ['T'] },
      { label: 'View', keys: ['B'] },
      { label: 'Input', keys: ['I'] }
    ]
  },
  {
    title: 'History',
    items: [
      { label: 'Undo', keys: ['$mod+Z'] },
      { label: 'Redo', keys: ['$mod+Shift+Z', '$mod+Y'] }
    ]
  },
  {
    title: 'Canvas',
    items: [
      { label: 'Zoom to 100%', keys: ['$mod+0'] },
      { label: 'Zoom to fit', keys: ['$mod+1'] },
      { label: 'Zoom to selection', keys: ['Shift+Digit1'] }
    ]
  },
  {
    title: 'Interface',
    items: [
      { label: 'Toggle top bar and panels', keys: ['$mod+\\'] },
      { label: 'Keyboard shortcuts', keys: ['?'] }
    ]
  }
]

/** One key cap, in the command palette's `font-mono text-[10px]` cap style (§1.3). */
export function ShortcutKbd({ combo, className }: { combo: string; className?: string }) {
  return (
    <kbd
      className={cn(
        'flex h-5 min-w-5 shrink-0 items-center justify-center rounded border border-border bg-panel-field px-1 font-mono text-[10px] text-muted',
        className
      )}
    >
      {formatShortcut(combo)}
    </kbd>
  )
}

export interface KeyboardHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
}

/**
 * The keyboard map dialog (docs/03-design.md §3.10). Built on the shadcn Dialog — focus trap,
 * Escape, and aria wiring come from it — with its surface restyled to open-pencil's dialog
 * look at the call site (the ported `@/app/theme/dialog` theme can't be imported as-is, so
 * the surface uses the overlay theme's `floatingSurface` plus the same header/body/footer
 * slot classes). Motion per §7: fade/zoom 180ms ease-out in, 120ms ease-in out, killed by
 * the tokens' `motion-reduce` variant (prefers-reduced-motion + `data-motion='off'`).
 */
export function KeyboardHelp({ open, onOpenChange, className }: KeyboardHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          floatingSurface,
          'flex max-h-[min(90vh,48rem)] w-[min(32rem,92vw)] flex-col gap-0 overflow-hidden border-none p-0',
          'duration-[180ms] ease-out data-[state=closed]:duration-[120ms] data-[state=closed]:ease-in motion-reduce:duration-0',
          className
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <DialogTitle className="text-sm font-semibold text-surface">
              Keyboard shortcuts
            </DialogTitle>
            <DialogDescription className="text-xs text-muted">
              Every binding here is live — hold focus out of text fields.
            </DialogDescription>
          </div>
          <DialogClose
            aria-label="Close"
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent text-muted outline-none hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus"
          >
            <SlotIcon slot="dialog.close" className="size-3.5" aria-hidden />
          </DialogClose>
        </header>

        <div className="scrollbar-thin grid min-h-0 flex-1 content-start gap-x-8 overflow-y-auto p-4 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3 className="px-1 pt-1 pb-1.5 text-[11px] font-semibold text-surface">
                {group.title}
              </h3>
              <ul>
                {group.items.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-6 py-0.5"
                  >
                    <span className="min-w-0 truncate text-[11px] text-surface">{item.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {item.keys.map((combo) => (
                        <ShortcutKbd key={combo} combo={combo} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <DialogFooter className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
          <p className="text-[11px] text-muted">Esc closes this dialog.</p>
          <DialogClose
            className={closeButtonClasses.base()}
          >
            Close
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
