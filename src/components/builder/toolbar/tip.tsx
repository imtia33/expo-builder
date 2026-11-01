'use client'
/*
 * One-line tooltip, ported from open-pencil's Tip (src/components/ui/overlay/Tip.vue)
 * — styling from theme/overlay.ts `tooltipSurface`, motion per open-pencil §6.
 *
 * Phase-1 alignment with open-pencil's timing model:
 *   - open delay 400ms (TOOLTIP_OPEN_DELAY_MS), skip window 300ms
 *     (TOOLTIP_SKIP_DELAY_MS): after any tooltip closes, a different tooltip
 *     opened within 300ms shows instantly — moving along a toolbar never
 *     waits twice. Radix implements this skip inside a single Provider, so the
 *     provider is hoisted to the app root (TipProvider, mounted once in
 *     page.tsx) instead of one per Tip — per-instance providers would isolate
 *     the skip state and re-apply the 400ms delay on every new trigger.
 *   - the content itself is pointer-events-none (Radix default for tooltips)
 *     and hides on pointerdown, matching open-pencil's flicker-free behavior.
 * Reduced motion (dual gate) renders it instantly.
 */

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

import { tooltipSurface } from '@/app/theme/overlay'
import { cn } from '@/lib/utils'
import { useReducedMotionPref } from './use-reduced-motion'

/** open-pencil TOOLTIP_OPEN_DELAY_MS. */
export const TOOLTIP_OPEN_DELAY_MS = 400
/** open-pencil TOOLTIP_SKIP_DELAY_MS — global "warmth" window across triggers. */
export const TOOLTIP_SKIP_DELAY_MS = 300

/**
 * Mount ONCE at the app root: owns the shared skip-delay state for every
 * <Tip> below it (open-pencil's global warmth state).
 */
export function TipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={TOOLTIP_OPEN_DELAY_MS} skipDelayDuration={TOOLTIP_SKIP_DELAY_MS}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

export interface TipProps {
  label: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Hover delay in ms (defaults to the provider's 400ms). */
  delayDuration?: number
  children: ReactNode
  className?: string
}

export function Tip({
  label,
  side = 'top',
  delayDuration,
  children,
  className
}: TipProps) {
  const reduced = useReducedMotionPref()

  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-[100]"
        >
          {/* Animated inner element: the positioned Radix wrapper keeps its
              floating-ui transform untouched (same pattern as the flyout menus). */}
          <motion.span
            className={cn(
              'max-w-80 px-2 py-1 text-[11px] break-words whitespace-nowrap select-none',
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
  )
}
