'use client'
/*
 * ExpoForge bottom toolbar (the Figma-style pill), reworked for task 10-F:
 * tools only. The platform toggle, Sim button, SIMULATING chip, and zoom
 * dropdown moved out (platform + sim + history now live in the top bar; zoom
 * controls are gone product-wide — keyboard zoom stays, wired by page.tsx).
 *
 * Groups, left→right with dividers: [Select, Hand] | [Screen] | [Text, View,
 * Button, Input, Image — registry-driven, unknown ids skipped gracefully] |
 * [More flyout: REGISTRY_FLYOUT_ORDER]. The pill keeps its entrance motion
 * (150ms from 8px below, opacity 0; dual-gated reduced motion), roving
 * tabindex, letter shortcuts, flyout memory, and Tip tooltips.
 */

import { motion } from 'framer-motion'
import { useRef } from 'react'

import { cn } from '@/lib/utils'
import { Tip } from './tip'
import { ToolButton } from './tool-button'
import { ToolFlyout } from './tool-flyout'
import { VariantToolGroup } from './tool-variants'
import {
  FIXED_TOOLS,
  fixedToolValue,
  getFlyoutTools,
  getPillComponentTools,
  isComponentToolActive,
  toolTip,
  type FixedToolDef,
  type ToolbarTool
} from './tool-registry'
import { useFlyoutSelections } from './use-flyout-selections'
import { useReducedMotionPref } from './use-reduced-motion'
import { useRovingTabindex } from './use-roving-tabindex'
import { useToolbarShortcuts } from './use-toolbar-shortcuts'

const PILL_DIVIDER = 'mx-1 h-5 w-px bg-border'

export interface BuilderToolbarProps {
  tool: ToolbarTool
  onToolChange: (tool: ToolbarTool) => void
  className?: string
}

/** Active test for a fixed tool (Select/Hand are string literals; Screen is an object). */
function fixedActive(tool: ToolbarTool, id: FixedToolDef['id']): boolean {
  if (id === 'screen') return typeof tool === 'object' && tool.kind === 'screen'
  return tool === id
}

/** One fixed (non-registry) tool button with its tooltip. */
function FixedToolButton({
  def,
  tool,
  onToolChange
}: {
  def: FixedToolDef
  tool: ToolbarTool
  onToolChange: (tool: ToolbarTool) => void
}) {
  return (
    <Tip label={toolTip(def.label, def.shortcut)}>
      <ToolButton
        icon={def.icon}
        label={def.label}
        active={fixedActive(tool, def.id)}
        onClick={() => onToolChange(fixedToolValue(def.id))}
      />
    </Tip>
  )
}

export function BuilderToolbar({ tool, onToolChange, className }: BuilderToolbarProps) {
  const pillRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotionPref()

  const pillTools = getPillComponentTools()
  const flyoutMembers = getFlyoutTools()
  const flyoutRemembered = useFlyoutSelections(flyoutMembers, tool)

  useRovingTabindex(pillRef)
  useToolbarShortcuts(onToolChange)

  const [select, hand, screen] = FIXED_TOOLS

  return (
    // Entrance: 150ms from bottom-6 (8px below) with opacity 0, dual-gated
    // reduced motion. The pill stays bottom-center.
    <motion.div
      className={cn('absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center', className)}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.15, ease: 'easeOut' }}
    >
      <div
        ref={pillRef}
        role="toolbar"
        aria-orientation="horizontal"
        aria-label="ExpoForge tools"
        className={cn(
          'flex gap-0.5 rounded-xl bg-panel p-1 shadow-[0_8px_30px_rgb(0_0_0/0.4)]'
        )}
      >
        {/* Navigation: Select (V), Hand (H). */}
        <FixedToolButton def={select} tool={tool} onToolChange={onToolChange} />
        <FixedToolButton def={hand} tool={tool} onToolChange={onToolChange} />

        <div aria-hidden="true" className={PILL_DIVIDER} />

        {/* Screen placement mode (S). */}
        <FixedToolButton def={screen} tool={tool} onToolChange={onToolChange} />

        {/* Registry-driven component tools — skipped per type until the
            registry fills in, so the divider only renders with content.
            Phase 2: tools with insertion options render the dual-button
            [main][caret] group (VariantToolGroup); the rest stay plain. */}
        {pillTools.length > 0 ? (
          <>
            <div aria-hidden="true" className={PILL_DIVIDER} />
            {pillTools.map((c) =>
              c.variants && c.variants.length > 0 ? (
                <VariantToolGroup key={c.type} def={c} tool={tool} onSelect={onToolChange} />
              ) : (
                <Tip key={c.type} label={toolTip(c.label, c.shortcut)}>
                  <ToolButton
                    icon={c.icon}
                    label={c.label}
                    active={isComponentToolActive(tool, c.type)}
                    onClick={() => onToolChange({ kind: 'component', type: c.type })}
                  />
                </Tip>
              )
            )}
          </>
        ) : null}

        {/* More flyout — only when at least one member exists. */}
        {flyoutMembers.length > 0 ? (
          <>
            <div aria-hidden="true" className={PILL_DIVIDER} />
            <ToolFlyout
              members={flyoutMembers}
              tool={tool}
              rememberedType={flyoutRemembered.current}
              onSelect={onToolChange}
            />
          </>
        ) : null}
      </div>
    </motion.div>
  )
}
