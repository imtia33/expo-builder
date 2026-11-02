'use client'
/*
 * VariantToolGroup (Phase 2) — one pill tool that has insertion options,
 * rendered as the ported open-pencil dual-button group: [main][caret].
 *
 *  - Main click inserts the DEFAULT variant (the plain component — identical
 *    to the pre-Phase 2 behavior; existing muscle memory and shortcuts keep
 *    working).
 *  - The caret opens a radio menu of the tool's variants (impl / props /
 *    cross-type forms). Selection memory: the menu re-opens with a check on
 *    the last-used variant (per-tool ref, the same pattern the More flyout
 *    uses via useFlyoutSelections).
 *
 * Surfaces follow tool-flyout.tsx: the §1.7 menu theme, 100ms opacity + 2px
 * slide from the anchor, instant close, reduced-motion aware. The caret
 * suppresses aria-pressed and lets Radix's aria-expanded speak for the popup.
 */
import { useRef } from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { motion } from 'framer-motion'
import { tv } from 'tailwind-variants'

import { SlotIcon } from '@/components/builder/icons/slots'
import toolbarTheme from '@/app/theme/toolbar'
import { menu } from './menu'
import { Tip } from './tip'
import { ToolButton } from './tool-button'
import {
  isComponentToolActive,
  toolTip,
  type ComponentTool,
  type ToolbarTool,
  type ToolVariant
} from './tool-registry'
import { useReducedMotionPref } from './use-reduced-motion'

const toolbar = tv(toolbarTheme)
const menuStyles = menu()

/** The caret segment's icon slot (shared with the inspector's chevron). */
const CARET_SLOT = 'inspector.chevron-down' as const

export interface VariantToolGroupProps {
  /** The tool definition (type + label + icon + variants). */
  def: ComponentTool
  tool: ToolbarTool
  onSelect: (tool: ToolbarTool) => void
}

/** The default variant of a tool = its plain insert (no impl/props override). */
function defaultVariantOf(def: ComponentTool): ToolVariant {
  return def.variants?.[0] ?? { id: 'default', label: def.label, icon: def.icon }
}

export function VariantToolGroup({ def, tool, onSelect }: VariantToolGroupProps) {
  const reduced = useReducedMotionPref()
  const rememberedRef = useRef<string>(defaultVariantOf(def).id)
  const styles = toolbar({ active: false })
  const active = isComponentToolActive(tool, def.type)
  const radioValue = rememberedRef.current

  /** Insert one variant: cross-type / impl / insert-time props ride along. */
  const insert = (v: ToolVariant): void => {
    rememberedRef.current = v.id
    onSelect({
      kind: 'component',
      type: v.type ?? def.type,
      ...(v.impl ? { impl: v.impl } : {}),
      ...(v.props ? { props: v.props } : {})
    })
  }

  return (
    <>
      <Tip label={toolTip(def.label, def.shortcut)}>
        <ToolButton
          icon={def.icon}
          label={def.label}
          active={active}
          onClick={() => insert(defaultVariantOf(def))}
        />
      </Tip>
      <DropdownMenuPrimitive.Root>
        <Tip label={`${def.label} options`}>
          <DropdownMenuPrimitive.Trigger asChild>
            <ToolButton
              icon={CARET_SLOT}
              label={`${def.label} options`}
              active={active}
              aria-pressed={undefined}
            />
          </DropdownMenuPrimitive.Trigger>
        </Tip>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content side="top" sideOffset={8} align="start">
            {/* Same entry motion as the More flyout: 100ms opacity + 2px slide;
                close is instant (unmount, no exit animation). */}
            <motion.div
              className={menuStyles.content({ class: 'min-w-56' })}
              initial={reduced ? false : { opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.1, ease: 'easeOut' }}
            >
              <DropdownMenuPrimitive.RadioGroup value={radioValue}>
                {(def.variants ?? []).map((v) => (
                  <DropdownMenuPrimitive.RadioItem
                    key={v.id}
                    value={v.id}
                    className={menuStyles.item({ justify: 'start' })}
                    onSelect={() => insert(v)}
                  >
                    <span aria-hidden="true" className={styles.flyoutItemIndicator()}>
                      <DropdownMenuPrimitive.ItemIndicator>
                        <SlotIcon aria-hidden="true" slot="inspector.check" className="size-3.5" />
                      </DropdownMenuPrimitive.ItemIndicator>
                    </span>
                    <SlotIcon aria-hidden="true" slot={v.icon} className={styles.flyoutItemIcon()} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{v.label}</span>
                      {v.hint ? (
                        <span className="block truncate text-[10px] leading-tight text-muted">{v.hint}</span>
                      ) : null}
                    </span>
                  </DropdownMenuPrimitive.RadioItem>
                ))}
              </DropdownMenuPrimitive.RadioGroup>
            </motion.div>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    </>
  )
}
