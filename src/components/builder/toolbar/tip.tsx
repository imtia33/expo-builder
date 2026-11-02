'use client'
/*
 * Tip — one-line tooltip, ported from open-pencil's Tip.vue (study §6).
 * Phase 3, Bug B root-cause fix: this is now the CUSTOM implementation
 * (per-instance lifecycle + the shared engine in ./tooltip.ts), replacing the
 * Radix-Tooltip port whose popper context caused the reported flicker.
 *
 * Open-pencil semantics kept verbatim:
 *   - open on pointerover (400ms intent delay) and keyboard :focus-visible
 *     only; instant inside the 300ms global skip window;
 *   - hides on pointerdown/click and on pointer-leave (claim event closes any
 *     other open tooltip instantly — nested triggers included);
 *   - trigger wrapper is display:contents (no layout/hover-boundary changes);
 *   - content: pointer-events-none, teleported to body, `strategy: fixed,
 *     transform: false` positioning (left/top, so the mount animation owns
 *     transform), middleware offset(4) + flip + shift with 8px padding;
 *   - motion: animate-in fade-in zoom-in-95, ~150ms, motion-reduce: none.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'

import { tooltipSurface } from '@/app/theme/overlay'
import { cn } from '@/lib/utils'
import {
  effectiveOpenDelay,
  nextTooltipClaim,
  noteTooltipClosed,
  TOOLTIP_CLAIM_EVENT,
  TOOLTIP_OPEN_DELAY_MS
} from './tooltip'

export { TOOLTIP_OPEN_DELAY_MS, TOOLTIP_SKIP_DELAY_MS } from './tooltip'

export interface TipProps {
  label: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Hover delay in ms (defaults to 400). Instant inside the skip window. */
  delayDuration?: number
  children: ReactNode
  className?: string
}

interface ClaimEvent extends Event {
  detail?: { claimId: number }
}

export function Tip({
  label,
  side = 'top',
  delayDuration = TOOLTIP_OPEN_DELAY_MS,
  children,
  className
}: TipProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const openTimer = useRef<number | null>(null)
  const claimId = useRef<number>(0)

  const clearOpenTimer = (): void => {
    if (openTimer.current !== null) {
      window.clearTimeout(openTimer.current)
      openTimer.current = null
    }
  }

  const close = (fromClaim = false): void => {
    clearOpenTimer()
    if (!fromClaim) {
      // Another tooltip just claimed the stage: the close is the claimer's
      // doing — it already recorded nothing; only real closes bump the
      // "warmth" clock so the NEXT trigger can open instantly.
      noteTooltipClosed()
    }
    setOpen(false)
  }

  const scheduleOpen = (): void => {
    clearOpenTimer()
    // Claim the stage: every other open tooltip closes instantly.
    claimId.current = nextTooltipClaim()
    window.dispatchEvent(new CustomEvent(TOOLTIP_CLAIM_EVENT, { detail: { claimId: claimId.current } }))
    const delay = effectiveOpenDelay(delayDuration)
    if (delay <= 0) {
      setOpen(true)
      return
    }
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null
      setOpen(true)
    }, delay)
  }

  /* Another tooltip opening while we are open → close instantly (its claim). */
  useEffect(() => {
    if (!open) return
    const onClaim = (e: Event): void => {
      const claim = (e as ClaimEvent).detail
      if (claim && claim.claimId !== claimId.current) {
        clearOpenTimer()
        setOpen(false)
      }
    }
    window.addEventListener(TOOLTIP_CLAIM_EVENT, onClaim)
    return () => window.removeEventListener(TOOLTIP_CLAIM_EVENT, onClaim)
  }, [open])

  /* Positioning: fixed strategy, no transform (left/top), recompute while
   * open on resize/scroll (viewport padding 8, offset 4, flip + shift). */
  useEffect(() => {
    if (!open) return
    const triggerEl = triggerRef.current
    const contentEl = contentRef.current
    if (!triggerEl || !contentEl) return

    let raf = 0
    const position = (): void => {
      raf = 0
      computePosition(triggerEl, contentEl, {
        strategy: 'fixed',
        placement: side,
        middleware: [offset(4), flip(), shift({ padding: 8 })]
      }).then(({ x, y }) => {
        contentEl.style.left = `${Math.round(x)}px`
        contentEl.style.top = `${Math.round(y)}px`
      })
    }
    const schedulePosition = (): void => {
      if (raf === 0) raf = window.requestAnimationFrame(position)
    }
    schedulePosition()
    window.addEventListener('resize', schedulePosition)
    window.addEventListener('scroll', schedulePosition, true)
    return () => {
      if (raf !== 0) window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', schedulePosition)
      window.removeEventListener('scroll', schedulePosition, true)
    }
  }, [open, side])

  /* Clear pending timers on unmount. */
  useEffect(() => clearOpenTimer, [])

  const isWithinTrigger = (node: EventTarget | null): boolean => {
    const el = triggerRef.current
    return el !== null && node !== null && node instanceof Node && el.contains(node)
  }

  return (
    <span
      ref={triggerRef}
      style={{ display: 'contents' }}
      onPointerOver={(e) => {
        // Entering the trigger subtree (not an internal move): schedule.
        if (!isWithinTrigger(e.relatedTarget)) scheduleOpen()
      }}
      onPointerOut={(e) => {
        // Actually leaving the subtree (not an internal move).
        if (!isWithinTrigger(e.relatedTarget)) close()
      }}
      onFocus={(e) => {
        // Keyboard focus only (:focus-visible semantics): a focus event that
        // follows a pointer interaction is not keyboard focus.
        if (e.target instanceof HTMLElement && e.target.matches(':focus-visible')) scheduleOpen()
      }}
      onBlur={() => close()}
      onPointerDown={() => close()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close()
      }}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={contentRef}
            role="tooltip"
            className={cn('z-[100] pointer-events-none fixed left-0 top-0', className)}
          >
            <span
              className={cn(
                'block max-w-80 px-2 py-1 text-[11px] break-words whitespace-nowrap select-none',
                tooltipSurface,
                'animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none'
              )}
            >
              {label}
            </span>
          </div>,
          document.body
        )}
    </span>
  )
}
