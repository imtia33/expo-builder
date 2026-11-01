'use client'

/*
 * Project tab — the document-level inspector shown when nothing is selected:
 * project name, counts, the THEME palette (Phase 1: plain-TS tokens, light/
 * dark pairs — every color field can bind to them; codegen emits
 * constants/theme.ts + hooks/useTheme.ts), a nav overview (each group row
 * selects the group), the routes summary, and the "add structure" hint.
 */

import { useState } from 'react'

import { SlotIcon, type IconSlot } from '@/components/builder/icons/slots'

import { panelFieldBase } from '@/app/theme/panel/field/base'
import inputTheme from '@/app/theme/input/input'
import { tv } from 'tailwind-variants'
import { screensInBucket, sortedGroups, useProjectStore } from '@/lib/project/store'
import type { NavKind } from '@/lib/project/types'
import { cn } from '@/lib/utils'
import { ColorField } from '../fields/color-field'
import { SectionStack } from './props-tab'
import type { FieldChangeValue, PanelSection } from '../schema'

const inputStyles = tv(inputTheme)

const NAV_KIND_META: Record<NavKind, { label: string; icon: IconSlot }> = {
  tabs: { label: 'Tabs', icon: 'inspector.project-grid' },
  stack: { label: 'Stack', icon: 'inspector.project-stack' },
  none: { label: 'None', icon: 'inspector.project-rows' }
}

export interface ProjectTabProps {
  className?: string
}

export function ProjectTab({ className }: ProjectTabProps) {
  const data = useProjectStore((s) => s.data)
  const setProjectName = useProjectStore((s) => s.setProjectName)
  const select = useProjectStore((s) => s.select)

  const componentCount = Object.keys(data.nodes).length
  const groups = sortedGroups(data)
  const routes = [...data.screens].sort((a, b) => a.route.localeCompare(b.route))

  function handleFieldChange(_sectionId: string, fieldId: string, value: FieldChangeValue) {
    if (fieldId === '__projectName' && typeof value === 'string' && value.trim()) {
      setProjectName(value)
    }
  }

  const generalSection: PanelSection = {
    id: 'project-general',
    title: 'Project',
    entries: [
      { kind: 'text', id: '__projectName', label: 'Name', value: data.name, placeholder: 'Untitled app' }
    ]
  }

  const isEmpty = data.groups.length === 0 && data.screens.length === 0

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin', className)}>
      <SectionStack sections={[generalSection]} onFieldChange={handleFieldChange} />

      {/* ── Stats ── */}
      <section className="border-b border-border px-3 pb-3" aria-label="Project stats">
        <p className="flex h-8 min-w-0 items-center gap-1.5 text-[11px] font-semibold text-surface">Stats</p>
        <div className="grid grid-cols-3 gap-1.5">
          <StatBlock label="Groups" value={data.groups.length} />
          <StatBlock label="Screens" value={data.screens.length} />
          <StatBlock label="Components" value={componentCount} />
        </div>
      </section>

      {/* ── Theme (Phase 1: plain-TS palette; tokens bind color fields) ── */}
      <ThemeSection />

      {/* ── Nav overview ── */}
      <section className="border-b border-border px-3 pb-3" aria-label="Navigation overview">
        <p className="flex h-8 min-w-0 items-center gap-1.5 text-[11px] font-semibold text-surface">
          <SlotIcon slot="inspector.project-layers" aria-hidden="true" className="size-3 text-muted" />
          Navigation
        </p>
        {groups.length === 0 ? (
          <p className="px-1 text-[11px] text-muted">No groups yet — create one from the left panel.</p>
        ) : (
          <div className="flex min-w-0 flex-col gap-1">
            {groups.map((group) => {
              const meta = NAV_KIND_META[group.nav.kind]
              const count = screensInBucket(data, group.id).length
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => select({ kind: 'group', groupId: group.id })}
                  className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-panel-field px-2 py-1.5 text-left outline-none transition-colors hover:bg-panel-field-hover focus-visible:ring-1 focus-visible:ring-panel-focus"
                >
                  <SlotIcon slot={meta.icon} aria-hidden="true" className="size-3.5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-surface">{group.name}</span>
                  <span className="shrink-0 text-[10px] text-muted">
                    {meta.label} · {count} screen{count === 1 ? '' : 's'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Routes ── */}
      <section className="border-b border-border px-3 pb-3" aria-label="Routes">
        <p className="flex h-8 min-w-0 items-center gap-1.5 text-[11px] font-semibold text-surface">
          <SlotIcon slot="inspector.project-routes" aria-hidden="true" className="size-3 text-muted" />
          Routes
        </p>
        {routes.length === 0 ? (
          <p className="px-1 text-[11px] text-muted">No screens yet.</p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-0.5">
            {routes.map((screen) => (
              <li key={screen.id} className="flex min-w-0 items-center gap-1.5 px-1 text-[11px]">
                <span aria-hidden="true" className="text-muted">
                  →
                </span>
                <span className="min-w-0 truncate font-mono text-muted">/{screen.route}</span>
                <span className="ml-auto min-w-0 shrink-0 truncate text-[10px] text-muted" title={screen.name}>
                  {screen.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Add-structure hint (always visible; the empty state gets the bigger treatment) ── */}
      {isEmpty ? (
        <section className="flex flex-col items-center gap-1.5 px-6 py-10 text-center" aria-label="Getting started">
          <SlotIcon slot="inspector.folder-new" aria-hidden="true" className="size-4 text-muted" />
          <p className="text-[11px] font-medium text-surface">Start building</p>
          <p className="max-w-52 text-[11px] leading-relaxed text-muted">
            Create a group (a tabs or stack navigator) or a screen from the panel on the left — the inspector follows your selection.
          </p>
        </section>
      ) : (
        <section className="flex flex-col items-center gap-1 px-6 py-6 text-center" aria-label="Add structure hint">
          <p className="max-w-52 text-[11px] leading-relaxed text-muted">
            Add groups and screens from the panel on the left — selecting one shows its inspector here.
          </p>
        </section>
      )}

      <div className="h-6 shrink-0" aria-hidden="true" />
    </div>
  )
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className={cn(panelFieldBase, 'flex h-auto flex-col items-center gap-0.5 border-border px-1.5 py-2')}>
      <span className="text-sm font-semibold tabular-nums text-surface" aria-label={`${label}: ${value}`}>
        {value}
      </span>
      <span className="text-[10px] text-muted">{label}</span>
    </div>
  )
}

/* ── Theme palette editor ───────────────────────────────────────────────── */

/**
 * Theme tokens — light/dark pairs (the reference-app pattern: TravelMate
 * constants/theme.js, Expo default template). Color fields bind to tokens via
 * the picker's "Theme tokens" row; codegen emits constants/theme.ts +
 * hooks/useTheme.ts (plain TS, NO NativeWind/uniwind).
 */
function ThemeSection() {
  const colors = useProjectStore((s) => s.data.theme?.colors) ?? {}
  const setThemeToken = useProjectStore((s) => s.setThemeToken)
  const deleteThemeToken = useProjectStore((s) => s.deleteThemeToken)
  const themeMode = useProjectStore((s) => s.ui.themeMode)
  const [draftName, setDraftName] = useState('')
  const names = Object.keys(colors).sort()
  const validName = /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(draftName.trim())

  return (
    <section className="border-b border-border px-3 pb-3" aria-label="Theme palette">
      <p className="flex h-8 min-w-0 items-center gap-1.5 text-[11px] font-semibold text-surface">Theme</p>
      <p className="mb-1.5 px-1 text-[10px] leading-relaxed text-muted">
        Color tokens for the whole app. Bind any color field to a token from its picker; generated code uses them via useTheme() (no NativeWind). The top-bar Light/Dark toggle previews each mode.
      </p>
      {names.length === 0 ? (
        <p className="px-1 text-[11px] text-muted">No tokens — add one below.</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-1">
          {names.map((name) => {
            const pair = colors[name]
            return (
              <div key={name} className="flex min-w-0 items-center gap-1">
                <span className="min-w-0 flex-1 truncate px-1 text-[11px] text-surface" title={name}>
                  {name}
                </span>
                <ColorField
                  field={{ kind: 'color', id: `theme-${name}-light`, label: `${name} light`, value: pair.light }}
                  className="w-16 shrink-0"
                  onChange={(value) => {
                    if (typeof value === 'string' && value) setThemeToken(name, { light: value, dark: pair.dark })
                  }}
                />
                <ColorField
                  field={{ kind: 'color', id: `theme-${name}-dark`, label: `${name} dark`, value: pair.dark }}
                  className="w-16 shrink-0"
                  onChange={(value) => {
                    if (typeof value === 'string' && value) setThemeToken(name, { light: pair.light, dark: value })
                  }}
                />
                <button
                  type="button"
                  aria-label={`Delete token ${name}`}
                  title={`Delete token ${name}`}
                  onClick={() => deleteThemeToken(name)}
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted outline-none hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus"
                >
                  <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                    <path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
      {/* Add token: name + default light/dark pair. */}
      <div className="mt-1.5 flex items-center gap-1">
        <input
          type="text"
          value={draftName}
          placeholder="newTokenName"
          spellCheck={false}
          aria-label="New token name"
          className={cn(inputStyles({ tone: 'panel', size: 'xs' }), 'min-w-0 flex-1')}
          onChange={(event) => setDraftName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (validName) {
                setThemeToken(draftName.trim(), { light: '#E5E7EB', dark: '#1F2937' })
                setDraftName('')
              }
            }
          }}
        />
        <button
          type="button"
          disabled={!validName}
          className="flex h-6 shrink-0 cursor-pointer items-center rounded bg-panel-field px-2 text-[11px] text-muted outline-none transition-colors hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus disabled:opacity-40"
          onClick={() => {
            if (validName) {
              setThemeToken(draftName.trim(), { light: '#E5E7EB', dark: '#1F2937' })
              setDraftName('')
            }
          }}
        >
          Add
        </button>
      </div>
      {themeMode === 'dark' && <p className="mt-1 px-1 text-[9px] text-muted">Previewing the dark palette (top bar).</p>}
    </section>
  )
}
