'use client'
/*
 * The "More" flyout — the pill's last group, holding every registry type that
 * is not a main-pill tool, per REGISTRY_FLYOUT_ORDER (task 10-F).
 *
 * Reworked from the ported open-pencil dual-button group ([member][chevron])
 * into a single trigger, per the spec: one dots-three button labeled "More",
 * highlighted while a member tool is active. The menu keeps the open-pencil
 * surface: radio items (check indicator + icon + label) over the §1.7 menu
 * theme, 100ms opacity + 2px slide from the anchor, close is instant,
 * reduced-motion aware. `useFlyoutSelections` supplies the member memory —
 * the menu re-opens with a check on the last-used member.
 */

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { motion } from 'framer-motion'
import { tv } from 'tailwind-variants'

import { SlotIcon, type IconSlot } from '@/components/builder/icons/slots'
import toolbarTheme from '@/app/theme/toolbar'
import { menu } from './menu'
import { Tip } from './tip'
import { ToolButton } from './tool-button'
import {
  isAnyComponentToolActive,
  isComponentToolActive,
  toolTip,
  type ComponentTool,
  type ToolbarTool
} from './tool-registry'
import { useReducedMotionPref } from './use-reduced-motion'

const toolbar = tv(toolbarTheme)
const menuStyles = menu()

/** The trigger's fixed presentation (More slot, "More"). */
const MORE_TRIGGER = { icon: 'tool.more' as IconSlot, label: 'More' }

export interface ToolFlyoutProps {
  /** Existence-gated members, in REGISTRY_FLYOUT_ORDER. */
  members: readonly ComponentTool[]
  tool: ToolbarTool
  /** Last-used member type from `useFlyoutSelections` (menu check memory). */
  rememberedType: string | undefined
  onSelect: (tool: ToolbarTool) => void
}

export function ToolFlyout({ members, tool, rememberedType, onSelect }: ToolFlyoutProps) {
  const reduced = useReducedMotionPref()
  // The trigger is highlighted while any of its members is the active tool.
  const activeMember = members.find((m) => isComponentToolActive(tool, m.type))
  const triggerActive = isAnyComponentToolActive(tool, members)
  // Radio value: the active member, else the remembered one, else none.
  const radioValue = activeMember?.type ?? rememberedType ?? ''
  const styles = toolbar({ active: false })

  return (
    <DropdownMenuPrimitive.Root>
      {/* Tooltip over the menu trigger: both asChild layers merge their props
          onto the final ToolButton (standard Radix composition). */}
      <Tip label={toolTip(MORE_TRIGGER.label)}>
        <DropdownMenuPrimitive.Trigger asChild>
          {/* aria-pressed is suppressed: Radix adds aria-expanded + data-state
              for the popup, so the trigger is not announced as a toggle. */}
          <ToolButton
            icon={MORE_TRIGGER.icon}
            label={MORE_TRIGGER.label}
            active={triggerActive}
            aria-pressed={undefined}
          />
        </DropdownMenuPrimitive.Trigger>
      </Tip>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content side="top" sideOffset={8} align="start">
          {/* Animated inner child: the positioned Radix wrapper keeps its
              floating-ui transform untouched. Open: 100ms opacity + 2px slide
              from the anchor; close is instant (unmount, no exit animation). */}
          <motion.div
            className={menuStyles.content({ class: 'min-w-40' })}
            initial={reduced ? false : { opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.1, ease: 'easeOut' }}
          >
            <DropdownMenuPrimitive.RadioGroup value={radioValue}>
              {members.map((m) => (
                <DropdownMenuPrimitive.RadioItem
                  key={m.type}
                  value={m.type}
                  className={menuStyles.item({ justify: 'start' })}
                  onSelect={() => onSelect({ kind: 'component', type: m.type })}
                >
                  <span aria-hidden="true" className={styles.flyoutItemIndicator()}>
                    <DropdownMenuPrimitive.ItemIndicator>
                      <SlotIcon aria-hidden="true" slot="inspector.check" className="size-3.5" />
                    </DropdownMenuPrimitive.ItemIndicator>
                  </span>
                  <SlotIcon aria-hidden="true" slot={m.icon} className={styles.flyoutItemIcon()} />
                  <span className={styles.flyoutItemLabel()}>{m.label}</span>
                  {m.shortcut ? (
                    <span className={menuStyles.shortcut()}>{m.shortcut}</span>
                  ) : null}
                </DropdownMenuPrimitive.RadioItem>
              ))}
            </DropdownMenuPrimitive.RadioGroup>
          </motion.div>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}
