'use client'

/*
 * Collapsible section (doc §5.2, ported panel/section.ts pattern): chevron + title —
 * the whole header toggles — plus an actions rail (drill-in chevron, reset-to-defaults).
 * The body expands/collapses via the grid-template-rows trick (150 ms open / 100 ms
 * close, ease-out) and is `inert` while closed so tab focus never enters hidden rows.
 * `motion-reduce:transition-none` is the ported dual gate (prefers-reduced-motion OR
 * [data-motion='off'], tokens.css).
 */

import { useId, useState, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'
import { SlotIcon } from '@/components/builder/icons/slots'

import iconButtonTheme from '@/app/theme/button/icon-button'
import panelSectionTheme from '@/app/theme/panel/section'
import { cn } from '@/lib/utils'

const sectionStyles = tv(panelSectionTheme)
const iconButtonStyles = tv(iconButtonTheme)

export interface CollapsibleSectionProps {
  id: string
  title: string
  defaultOpen?: boolean
  /** Not applicable / mixed selection: dims the section via data-[disabled]. */
  disabled?: boolean
  /** Renders the reset-to-defaults header action. */
  onReset?: () => void
  resetLabel?: string
  /** Extra header action rendered before the reset button (e.g. drill-in chevron). */
  headerAction?: ReactNode
  children: ReactNode
  className?: string
}

export function CollapsibleSection({
  id,
  title,
  defaultOpen = true,
  disabled = false,
  onReset,
  resetLabel = 'Reset to defaults',
  headerAction,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  const s = sectionStyles()

  return (
    <section
      role="group"
      aria-label={title}
      data-disabled={disabled || undefined}
      data-section-id={id}
      className={cn(s.root(), className)}
    >
      <div className={s.header()}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((previous) => !previous)}
          className="flex min-w-0 flex-1 cursor-default items-center gap-1.5 rounded text-left outline-none focus-visible:ring-1 focus-visible:ring-panel-focus"
        >
          <SlotIcon
            slot="inspector.section-collapse"
            aria-hidden="true"
            className={cn(
              'size-3 shrink-0 text-muted transition-transform duration-150 ease-out motion-reduce:transition-none',
              open && 'rotate-90'
            )}
          />
          <span className={s.title()}>{title}</span>
        </button>
        {headerAction || onReset ? (
          <div className={s.actions()}>
            {headerAction}
            {onReset ? (
              <button
                type="button"
                data-slot="icon-button"
                onClick={onReset}
                aria-label={resetLabel}
                title={resetLabel}
                className={iconButtonStyles({ size: 'xs' })}
              >
                <SlotIcon slot="inspector.section-reset" aria-hidden="true" className="size-3" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div
        id={bodyId}
        data-state={open ? 'open' : 'closed'}
        className={cn(
          'grid transition-[grid-template-rows] ease-out',
          '[grid-template-rows:1fr] data-[state=closed]:[grid-template-rows:0fr]',
          'data-[state=open]:duration-150 data-[state=closed]:duration-100',
          'motion-reduce:transition-none'
        )}
      >
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className="pt-1.5">{children}</div>
        </div>
      </div>
    </section>
  )
}
