/*
 * Tooltip engine — ported from open-pencil's custom implementation
 * (src/components/ui/overlay/Tip.vue + tooltip.ts; see
 * docs/research/open-pencil-study.md §6). Phase 3, Bug B root-cause fix.
 *
 * WHY custom, not Radix: our earlier Radix-Tooltip port carried the Radix
 * popper context across triggers — measurable churn (repeated reposition
 * writes per mount, open state left stuck after fast sweeps) and the flash
 * the user reported. Open Pencil hit the same class of problems and replaced
 * the primitive tooltip entirely; the study documents the full spec. This is
 * that port: per-instance lifecycle + THREE shared rules —
 *
 *   1. Open delay 400ms, global skip window 300ms: after any tooltip CLOSES,
 *      a different tooltip opened within 300ms shows instantly (global
 *      "warmth" — moving along a toolbar never waits twice).
 *   2. Claim event: when a tooltip starts opening, every OTHER open tooltip
 *      closes instantly — no overlap, no stale state.
 *   3. Nested triggers: an inner labeled control suppresses/claims over the
 *      outer one (same mechanism as 2).
 *
 * Hiding: on pointerdown (like open-pencil) and on pointer-leave.
 */

/** open-pencil TOOLTIP_OPEN_DELAY_MS. */
export const TOOLTIP_OPEN_DELAY_MS = 400
/** open-pencil TOOLTIP_SKIP_DELAY_MS — global "warmth" window across triggers. */
export const TOOLTIP_SKIP_DELAY_MS = 300

/** Claim event: an opening tooltip closes any other instantly. */
export const TOOLTIP_CLAIM_EVENT = 'expoforge:tooltip-claim'

/* Global "warmth" state (open-pencil: createGlobalState). Module scope — one
 * editor per page, so module-level is the shared state. */
let lastClosedAt = 0
let lastClaimId = 0

/** Timestamp of the last tooltip close (0 = none yet). */
export function tooltipLastClosedAt(): number {
  return lastClosedAt
}

/** Record a close (call from every tooltip that hides). */
export function noteTooltipClosed(): void {
  lastClosedAt = performance.now()
}

/**
 * True when the global skip window is active: a NEW tooltip may show
 * instantly instead of waiting the open delay.
 */
export function withinSkipWindow(now: number = performance.now()): boolean {
  return lastClosedAt > 0 && now - lastClosedAt < TOOLTIP_SKIP_DELAY_MS
}

/** The current claim id (monotonic; every opening tooltip takes a new one). */
export function nextTooltipClaim(): number {
  lastClaimId += 1
  return lastClaimId
}

/**
 * Effective open delay for a trigger hover: 0 (instant) inside the skip
 * window, else the delay (default 400ms). Reduced motion still uses the same
 * timing (the delay is intent detection, not an animation).
 */
export function effectiveOpenDelay(delayDuration: number = TOOLTIP_OPEN_DELAY_MS): number {
  return withinSkipWindow() ? 0 : delayDuration
}
