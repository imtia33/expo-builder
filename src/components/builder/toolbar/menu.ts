'use client'
/*
 * Menu styling recreated from open-pencil (https://github.com/open-pencil/open-pencil) — MIT License.
 * Copyright (c) 2026 Danila Poyarkov & OpenPencil contributors.
 * Source: src/components/ui/menu/menu.ts — verbatim values per doc 03-design.md §1.7.
 * Deviation: open-pencil's `motionStyles.floating` open animation is replaced by
 * the task spec — framer-motion, 100ms, opacity + 2px slide from the anchor side
 * (applied by the menu components, not this theme); no close animation.
 */

import { tv } from 'tailwind-variants'

import { floatingSurface } from '@/app/theme/overlay'

export const menu = tv({
  slots: {
    content: `z-50 flex flex-col p-1 ${floatingSurface}`,
    item: 'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[11px] select-none data-[disabled]:text-muted/50 data-[highlighted]:bg-hover',
    separator: 'mx-1 my-1 h-px bg-border',
    shortcut: 'text-[11px] text-muted'
  },
  variants: {
    justify: {
      between: {
        item: 'justify-between gap-6'
      },
      start: {
        item: 'justify-start'
      }
    }
  },
  defaultVariants: {
    justify: 'between'
  }
})

export type MenuStyles = ReturnType<typeof menu>
