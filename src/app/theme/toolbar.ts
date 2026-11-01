/*
 * Pill button + flyout-item styling for the ExpoForge bottom toolbar.
 * Ported from open-pencil (https://github.com/open-pencil/open-pencil) — MIT License.
 * Copyright (c) 2026 Danila Poyarkov & OpenPencil contributors.
 * Source: src/theme/toolbar.ts
 *
 * Task 10-F deviation: trimmed to the slots the reworked toolbar actually uses
 * (the dual-button flyout group became a single "More" trigger, so the
 * flyoutTrigger/flyoutGroup/navigation slots are gone). Hover still comes from
 * the inactive compound, so an active button keeps its accent fill on hover.
 */
const toolbarTheme = {
  slots: {
    button:
      'flex size-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted transition-colors outline-none focus-visible:ring-1 focus-visible:ring-panel-focus',
    icon: 'size-4',
    flyoutItemIndicator: 'flex size-3.5 shrink-0 items-center justify-center',
    flyoutItemIcon: 'size-3.5',
    flyoutItemLabel: 'flex-1'
  },
  variants: {
    active: {
      true: {
        button: 'bg-accent text-on-accent'
      },
      false: {}
    }
  },
  compoundVariants: [
    {
      active: false,
      class: {
        button: 'hover:bg-hover hover:text-surface'
      }
    }
  ],
  defaultVariants: {
    active: false
  }
}

export type ToolbarTheme = typeof toolbarTheme
export default toolbarTheme
