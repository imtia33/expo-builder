'use client'
/*
 * ExpoForge top bar, reworked for task 10-F. Everything reads from the project
 * store; the only props are the help trigger and a class hook (the integration
 * contract for page.tsx).
 *
 * Left→right: logo mark + editable project name (ghost inline input, commits
 * on blur/Enter via setProjectName, Esc reverts) + an autosave chip (honest:
 * persistence is synchronous localStorage through zustand persist); then the
 * center-right cluster — platform toggle (segmented, acts on the ACTIVE screen
 * via setScreenPlatform, else ui.lastPlatform for new screens; never disabled
 * during simulation) and the Sim toggle (accent → error-fill, SIMULATING chip
 * while running, disabled with a hint when the project has no screens); then
 * undo/redo (disabled from past/future lengths, tooltips carry the shortcuts)
 * and the help button.
 */

import { useEffect, useRef, useState } from 'react'
import { tv } from 'tailwind-variants'

import { SlotIcon, type IconSlot } from '@/components/builder/icons/slots'
import { Tip } from '@/components/builder/toolbar/tip'
import type { PlatformId } from '@/components/builder/screens/device-presets'
import { useProjectStore } from '@/lib/project/store'

import brandTheme from '@/app/theme/brand'
import iconButtonTheme from '@/app/theme/button/icon-button'
import segmentedControlTheme from '@/app/theme/select/segmented-control'
import { cn } from '@/lib/utils'

import { formatShortcut } from './shortcut-format'

// Static class sets, computed once at module level.
const iconButtons = tv(iconButtonTheme)
const segmented = tv(segmentedControlTheme)
const segStyles = segmented()
const segRootClasses = segStyles.root()
const segItemClasses = segStyles.item({ size: 'top' })

const LOGO_CLASSES = cn(brandTheme.base, 'text-accent')
const NAME_INPUT_CLASSES =
  'h-7 w-32 rounded-md border-none bg-transparent px-2 text-xs text-surface outline-none transition-colors ' +
  'placeholder:text-muted hover:bg-hover focus-visible:bg-panel-field focus-visible:ring-1 focus-visible:ring-panel-focus ' +
  'md:w-44 lg:w-52'
const AUTOSAVE_CHIP_CLASSES =
  'hidden h-6 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11px] text-muted lg:flex'
const SIM_BUTTON_BASE =
  'flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium outline-none transition-colors ' +
  'hover:brightness-110 focus-visible:ring-1 focus-visible:ring-panel-focus disabled:cursor-not-allowed disabled:opacity-50'
const SIMULATING_CHIP_CLASSES =
  'flex items-center gap-1.5 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-on-accent'
const UNDO_REDO_ICON_CLASSES = 'size-3.5'
const FOCUS_RING = 'focus-visible:ring-1 focus-visible:ring-panel-focus'

const PLATFORMS: ReadonlyArray<{ id: PlatformId; label: string; icon: IconSlot }> = [
  { id: 'ios', label: 'iOS', icon: 'platform.ios' },
  { id: 'android', label: 'Android', icon: 'platform.android' }
]

export interface TopBarProps {
  /** Opens the keyboard help dialog — `() => setHelpOpen(true)` from useBuilderShortcuts. */
  onHelp: () => void
  className?: string
}

export function TopBar({ onHelp, className }: TopBarProps) {
  /* ── store ── */
  const name = useProjectStore((s) => s.data.name)
  const setProjectName = useProjectStore((s) => s.setProjectName)
  const platform = useProjectStore((s) => s.ui.platform)
  const setGlobalPlatform = useProjectStore((s) => s.setGlobalPlatform)
  const simOn = useProjectStore((s) => s.sim.on)
  const setSim = useProjectStore((s) => s.setSim)
  const canSimulate = useProjectStore((s) => s.data.screens.length > 0)
  const canUndo = useProjectStore((s) => s.past.length > 0)
  const canRedo = useProjectStore((s) => s.future.length > 0)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)

  /* ── project name: ghost inline input, commits on blur/Enter, Esc reverts ── */
  const [draft, setDraft] = useState(name)
  // External changes (undo/redo, integration) always win.
  useEffect(() => {
    setDraft(name)
  }, [name])

  // Esc reverts AND exits the field: the blur that follows must not commit the
  // pre-revert draft, so the escape is flagged for the next commitName call.
  const escapedRef = useRef(false)

  function commitName() {
    if (escapedRef.current) {
      escapedRef.current = false
      setDraft(name)
      return
    }
    const next = draft.trim()
    if (!next || next === name) {
      setDraft(name)
      return
    }
    setProjectName(next)
    setDraft(next)
  }

  /* ── platform: ONE editor-global target — previews, props, defaults all follow ── */
  function handlePlatform(next: PlatformId) {
    setGlobalPlatform(next)
  }

  const simTooltip = simOn
    ? 'Stop simulation'
    : canSimulate
      ? 'Start simulation'
      : 'Add a screen first'

  return (
    <header
      className={cn('flex h-10 shrink-0 items-center gap-2 border-b border-border bg-panel px-3', className)}
    >
      {/* 1 — identity: logo mark, editable project name, autosave chip. */}
      <div className="flex min-w-0 flex-[2] items-center gap-2">
        <SlotIcon aria-hidden="true" slot="brand.logo" className={LOGO_CLASSES} />
        <span className="hidden text-xs font-semibold text-surface md:inline">ExpoForge</span>
        <input
          value={draft}
          aria-label="Project name"
          title="Project name"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitName()
            } else if (event.key === 'Escape') {
              escapedRef.current = true
              setDraft(name)
              event.currentTarget.blur()
            }
          }}
          className={NAME_INPUT_CLASSES}
        />
        <span title="Changes save automatically" className={AUTOSAVE_CHIP_CLASSES}>
          <SlotIcon aria-hidden="true" slot="topbar.saved" className="size-3" />
          Saved
        </span>
      </div>

      {/* 2 + 3 — center-right cluster: platform variants, then simulation. */}
      <div className="flex items-center gap-2">
        <div role="group" aria-label="Platform" className={segRootClasses}>
          {PLATFORMS.map((item) => {
            const on = item.id === platform
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                data-state={on ? 'on' : 'off'}
                onClick={() => handlePlatform(item.id)}
                className={segItemClasses}
              >
                <SlotIcon aria-hidden="true" slot={item.icon} className="size-3 shrink-0" />
                {item.label}
              </button>
            )
          })}
        </div>

        <Tip label={simTooltip}>
          {/* Wrapper span: tooltips must open on hover even while the button is
              disabled (disabled buttons swallow pointer events in some browsers). */}
          <span className="flex">
            <button
              type="button"
              onClick={() => setSim(!simOn)}
              disabled={!canSimulate}
              aria-pressed={simOn}
              className={cn(SIM_BUTTON_BASE, simOn ? 'bg-error-fill text-on-accent' : 'bg-accent text-on-accent')}
            >
              <SlotIcon
                aria-hidden="true"
                slot={simOn ? 'sim.stop' : 'sim.start'}
                className="size-3"
              />
              {simOn ? 'Stop' : 'Simulate'}
            </button>
          </span>
        </Tip>

        {simOn ? (
          <span role="status" className={SIMULATING_CHIP_CLASSES}>
            <span
              aria-hidden="true"
              className="size-1.5 animate-pulse rounded-full bg-on-accent motion-reduce:animate-none"
            />
            SIMULATING
          </span>
        ) : null}
      </div>

      {/* 4 + 5 — history, then help. */}
      <div className="flex flex-[1] items-center justify-end gap-1">
        <Tip label={`Undo (${formatShortcut('$mod+Z')})`}>
          <button
            type="button"
            onClick={() => undo()}
            disabled={!canUndo}
            aria-label="Undo"
            className={cn(iconButtons({ size: 'sm', disabled: !canUndo }), FOCUS_RING)}
          >
            <SlotIcon aria-hidden="true" slot="topbar.undo" className={UNDO_REDO_ICON_CLASSES} />
          </button>
        </Tip>
        <Tip label={`Redo (${formatShortcut('$mod+Shift+Z')})`}>
          <button
            type="button"
            onClick={() => redo()}
            disabled={!canRedo}
            aria-label="Redo"
            className={cn(iconButtons({ size: 'sm', disabled: !canRedo }), FOCUS_RING)}
          >
            <SlotIcon aria-hidden="true" slot="topbar.redo" className={UNDO_REDO_ICON_CLASSES} />
          </button>
        </Tip>

        <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />

        <Tip label="Keyboard shortcuts (?)">
          <button
            type="button"
            onClick={onHelp}
            aria-label="Keyboard shortcuts (?)"
            className={cn(iconButtons({ size: 'sm' }), FOCUS_RING)}
          >
            <SlotIcon aria-hidden="true" slot="topbar.help" className="size-3.5" />
          </button>
        </Tip>
      </div>
    </header>
  )
}
