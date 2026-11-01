'use client'
/*
 * One pill button. Reworked for task 10-F: the icon is an editor icon SLOT
 * (icons/slots.tsx — one icon system across the whole editor, swappable in
 * one file). Styling still rides the ported `@/app/theme/toolbar` theme via
 * tailwind-variants: active → bg-accent text-on-accent, hover per the
 * inactive compound, focus-visible ring.
 */

import type { ComponentProps } from 'react'

import { SlotIcon, type IconSlot } from '@/components/builder/icons/slots'
import { tv } from 'tailwind-variants'

import toolbarTheme from '@/app/theme/toolbar'

const toolbar = tv(toolbarTheme)

export interface ToolButtonProps extends ComponentProps<'button'> {
  /** Editor icon slot, e.g. 'tool.select'. */
  icon: IconSlot
  /** Accessible name; also drives the tooltip in most call sites. */
  label: string
  /** aria-pressed + data-active + `bg-accent text-on-accent` styling. */
  active?: boolean
}

export function ToolButton({ icon, label, active = false, className, ...rest }: ToolButtonProps) {
  const styles = toolbar({ active })
  return (
    <button
      // Before the spread: callers may override the derived semantics (the
      // flyout trigger suppresses aria-pressed and lets Radix's aria-expanded
      // speak for the popup).
      aria-pressed={active}
      aria-label={label}
      {...rest}
      type="button"
      data-active={active || undefined}
      className={styles.button({ class: className })}
    >
      <SlotIcon aria-hidden="true" slot={icon} className={styles.icon()} />
    </button>
  )
}
