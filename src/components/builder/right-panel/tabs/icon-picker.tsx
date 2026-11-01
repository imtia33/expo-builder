'use client'

/*
 * IconPicker — the tab-icon picker: a popover with a search box and a grid of
 * 48px icon cells. The default grid is the curated, name-verified catalog
 * (icons-catalog.ts); typing filters the FULL Phosphor set (Object.keys of
 * @iconify-json/ph's icons.json, aliases included) with rendering capped at 60
 * cells. The selected icon carries an accent ring.
 */

import { useMemo, useState } from 'react'
import phCollection from '@iconify-json/ph/icons.json'
import { tv } from 'tailwind-variants'

import inputTheme from '@/app/theme/input/input'
import { floatingSurface } from '@/app/theme/overlay'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { IconifyIcon } from '@/components/builder/icons'
import { cn } from '@/lib/utils'
import { CURATED_ICON_CATEGORIES } from '../icons-catalog'

const inputStyles = tv(inputTheme)

/** Search domain: every bare icon + alias name in the Phosphor collection. */
const ALL_PH_NAMES: string[] = (() => {
  const icons = phCollection.icons as Record<string, unknown>
  const aliases = (phCollection.aliases ?? {}) as Record<string, unknown>
  return [...Object.keys(icons), ...Object.keys(aliases)]
})()

/** Render cap for full-set search results (the curated grid is already bounded). */
const SEARCH_RENDER_CAP = 60

function searchIcons(query: string): string[] {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, '-')
  if (!normalized) return []
  return ALL_PH_NAMES.filter((name) => name.includes(normalized)).slice(0, SEARCH_RENDER_CAP)
}

export interface IconPickerProps {
  /** Current Iconify name ('ph:house'). */
  value: string
  onChange: (icon: string) => void
  /** Accessible label for the trigger button. */
  label: string
  className?: string
}

export function IconPicker({ value, onChange, label, className }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const results = useMemo(() => searchIcons(query), [query])

  function pick(name: string) {
    onChange(`ph:${name}`)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery('') }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={value}
          className={cn(
            'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded border border-border bg-panel-field text-surface outline-none hover:bg-panel-field-hover focus-visible:border-panel-focus',
            className
          )}
        >
          <IconifyIcon aria-hidden="true" icon={value} className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          floatingSurface,
          'w-72 border-0 p-2',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'duration-150 motion-reduce:animate-none data-[state=closed]:animate-none'
        )}
      >
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={query}
            placeholder="Search Phosphor icons…"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search icons"
            className={cn(inputStyles({ tone: 'panel', size: 'xs' }), 'w-full')}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="max-h-72 overflow-y-auto scrollbar-thin" role="listbox" aria-label="Icons">
            {query.trim() !== '' ? (
              results.length > 0 ? (
                <IconGrid icons={results} value={value} onPick={pick} />
              ) : (
                <p className="px-1 py-3 text-center text-[11px] text-muted">
                  No icons match “{query}”.
                </p>
              )
            ) : (
              CURATED_ICON_CATEGORIES.map((category) => (
                <section key={category.label} className="mb-1.5 last:mb-0">
                  <p className="px-1 pb-1 text-[10px] font-medium tracking-wide text-muted uppercase select-none">
                    {category.label}
                  </p>
                  <IconGrid icons={category.icons} value={value} onPick={pick} />
                </section>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function IconGrid({ icons, value, onPick }: { icons: string[]; value: string; onPick: (name: string) => void }) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {icons.map((name) => {
        const icon = `ph:${name}`
        const selected = icon === value
        return (
          <button
            key={name}
            type="button"
            role="option"
            aria-selected={selected}
            title={name}
            onClick={() => onPick(name)}
            className={cn(
              'flex size-12 cursor-pointer items-center justify-center rounded-md text-surface outline-none',
              'hover:bg-hover focus-visible:ring-1 focus-visible:ring-panel-focus',
              selected ? 'bg-accent/15 text-primary ring-1 ring-accent' : 'text-muted hover:text-surface'
            )}
          >
            <IconifyIcon aria-hidden="true" icon={icon} className="size-5" />
          </button>
        )
      })}
    </div>
  )
}
