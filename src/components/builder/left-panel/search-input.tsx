'use client'

/**
 * Compact search/filter input for panel sections — `panel-field` styling from
 * the ported `panel/field/base` theme (doc §4.4 search row), with a muted
 * leading glyph and a forwarded ref so shortcuts can focus it.
 */
import type { Ref } from 'react'
import { SlotIcon } from '@/components/builder/icons/slots'
import { panelFieldBase } from '@/app/theme/panel/field/base'
import { cn } from '@/lib/utils'

export interface PanelSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  inputRef?: Ref<HTMLInputElement>
  className?: string
}

export function PanelSearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  inputRef,
  className
}: PanelSearchInputProps) {
  return (
    <div className={cn('relative min-w-0 flex-1', className)}>
      <SlotIcon
        slot="panel.search"
        aria-hidden
        className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted"
      />
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        aria-label={ariaLabel ?? 'Search'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className={cn(
          panelFieldBase,
          'w-full pl-7 pr-2 text-[11px] text-surface placeholder:text-muted'
        )}
      />
    </div>
  )
}
