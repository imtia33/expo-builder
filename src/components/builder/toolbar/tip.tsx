'use client'
/*
 * One-line tooltip, ported from open-pencil's Tip (src/components/ui/overlay/Tip.vue)
 * — styling from theme/overlay.ts `tooltipSurface`, motion per doc §7: fade 120ms
 * in, 300ms hover delay. Reduced motion (dual gate) renders it instantly.
 */

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

import { tooltipSurface } from '@/app/theme/overlay'
import { cn } from '@/lib/utils'
import { useReducedMotionPref } from './use-reduced-motion'

export interface TipProps {
  label: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Hover delay in ms (doc §7: 300ms). */
  delayDuration?: number
  children: ReactNode
  className?: string
}

export function Tip({
  label,
  side = 'top',
  delayDuration = 300,
  children,
  className
}: TipProps) {
  const reduced = useReducedMotionPref()

  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={100}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content side={side} sideOffset={6} collisionPadding={8}>
            {/* Animated inner element: the positioned Radix wrapper keeps its
                floating-ui transform untouched (same pattern as the flyout menus). */}
            <motion.span
              className={cn(
                'px-2 py-1 text-[11px] whitespace-nowrap select-none',
                tooltipSurface,
                className
              )}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduced ? 0 : 0.12, ease: 'easeOut' }}
            >
              {label}
            </motion.span>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
