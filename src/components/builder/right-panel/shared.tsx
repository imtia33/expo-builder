'use client'

/*
 * Shared right-panel bits: the per-tab quiet empty hint (§8). Every control in
 * the inspector is wired to the project store; hints only appear for genuinely
 * empty contexts (no props, no codegen output, …).
 */

import { SlotIcon, type IconSlot } from '@/components/builder/icons/slots'
import { cn } from '@/lib/utils'

export interface QuietHintProps {
  icon?: IconSlot
  title: string
  description?: string
  className?: string
}

/** Quiet empty state: muted icon, one-line title, one-line explanation. */
export function QuietHint({ icon, title, description, className }: QuietHintProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-6 py-10 text-center',
        className
      )}
    >
      {icon ? <SlotIcon slot={icon} aria-hidden="true" className="size-4 text-muted" /> : null}
      <p className="text-[11px] font-medium text-surface">{title}</p>
      {description ? (
        <p className="max-w-52 text-[11px] leading-relaxed text-muted">{description}</p>
      ) : null}
    </div>
  )
}
