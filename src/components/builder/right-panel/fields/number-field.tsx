'use client'

/*
 * NumberField — open-pencil scrub-commit semantics (doc §5.6, ported from
 * node-props/helpers.ts + prop-scrub/use.ts):
 *
 * - pointer-down on the field + horizontal drag scrubs (1 px = 1 step; Shift ×10,
 *   Alt ×0.1), with live previews emitted between onScrubStart / onScrubEnd so the
 *   parent applies them without touching history;
 * - pointer-up commits ONE undo entry (the parent records the pre-scrub value at
 *   onScrubStart);
 * - Escape cancels back to the pre-scrub value; a plain click (no drag) enters edit
 *   mode — typing a MIXED field commits the typed value to all selected nodes;
 * - ArrowUp/Down steps by the field's step (Shift ×10, Alt ×0.1); Enter/blur commits
 *   the typed number, unit suffix optional.
 */

import { useId, useRef, useState } from 'react'
import { tv } from 'tailwind-variants'

import numberFieldTheme from '@/app/theme/input/number-field'
import { cn } from '@/lib/utils'
import { isMixed, type NumberFieldSpec } from '../schema'

const styles = tv(numberFieldTheme)

/** Movement below this many px counts as a click (edit), not a scrub. */
const DRAG_THRESHOLD_PX = 3

interface ScrubState {
  pointerId: number
  startX: number
  /** Value when the gesture started — restored on Escape/cancel. */
  startValue: number
  lastEmitted: number
  scrubbing: boolean
}

export interface NumberFieldProps {
  field: NumberFieldSpec
  /** Id of the row label element (aria-labelledby). */
  labelId?: string
  disabled?: boolean
  /** Fires for live scrub previews and discrete commits alike. */
  onChange: (value: number) => void
  /** Brackets a scrub gesture: live previews in between, one undo entry after. */
  onScrubStart?: () => void
  onScrubEnd?: () => void
  className?: string
}

export function NumberField({
  field,
  labelId,
  disabled = false,
  onChange,
  onScrubStart,
  onScrubEnd,
  className,
}: NumberFieldProps) {
  const scrubHintId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const scrubRef = useRef<ScrubState | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const step = field.step ?? 1
  const mixed = isMixed(field.value)
  const numeric = typeof field.value === 'number' ? field.value : null
  const fallback = typeof field.defaultValue === 'number' ? field.defaultValue : (field.min ?? 0)

  function clamp(value: number): number {
    let next = value
    if (field.min !== undefined) next = Math.max(field.min, next)
    if (field.max !== undefined) next = Math.min(field.max, next)
    return next
  }

  function round(value: number): number {
    return Math.round(value * 100) / 100
  }

  function format(value: number): string {
    return String(round(value))
  }

  function parseDraft(text: string): number | null {
    const trimmed = text.trim()
    if (trimmed === '') return null
    const withoutUnit =
      field.unit && trimmed.toLowerCase().endsWith(field.unit.toLowerCase())
        ? trimmed.slice(0, -field.unit.length)
        : trimmed
    const parsed = Number(withoutUnit)
    if (!Number.isFinite(parsed)) return null
    return clamp(round(parsed))
  }

  function enterEditMode() {
    setDraft(numeric === null ? '' : format(numeric))
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }

  function commitDraft() {
    setEditing(false)
    const parsed = parseDraft(draft)
    if (parsed === null) return
    if (parsed !== numeric) onChange(parsed)
  }

  function cancelEdit() {
    setEditing(false)
  }

  function stepValue(base: number, direction: 1 | -1, event: React.KeyboardEvent): number {
    const multiplier = event.shiftKey ? 10 : event.altKey ? 0.1 : 1
    return clamp(round(base + direction * step * multiplier))
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || editing || event.button !== 0) return
    scrubRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: numeric ?? fallback,
      lastEmitted: numeric ?? fallback,
      scrubbing: false,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // pointer already released — nothing to scrub
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const scrub = scrubRef.current
    if (!scrub || scrub.pointerId !== event.pointerId) return
    const dx = event.clientX - scrub.startX
    if (!scrub.scrubbing) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return
      scrub.scrubbing = true
      onScrubStart?.()
    }
    const multiplier = event.shiftKey ? 10 : event.altKey ? 0.1 : 1
    const next = clamp(round(scrub.startValue + dx * step * multiplier))
    if (next !== scrub.lastEmitted) {
      scrub.lastEmitted = next
      onChange(next)
    }
  }

  /** Ends the gesture; `commit === false` restores the pre-scrub value (Escape). */
  function endScrub(commit: boolean): boolean {
    const scrub = scrubRef.current
    scrubRef.current = null
    if (!scrub?.scrubbing) return false
    if (!commit) onChange(scrub.startValue)
    onScrubEnd?.()
    return true
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const scrub = scrubRef.current
    if (scrub && scrub.pointerId !== event.pointerId) return
    if (!endScrub(true)) {
      // Plain click: enter edit mode (typing a mixed field commits to all nodes).
      enterEditMode()
    }
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    const scrub = scrubRef.current
    if (scrub && scrub.pointerId !== event.pointerId) return
    endScrub(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (editing) return
    if (event.key === 'Escape') {
      endScrub(false)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      enterEditMode()
      return
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const direction = event.key === 'ArrowUp' ? 1 : -1
      onChange(stepValue(numeric ?? fallback, direction, event))
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEdit()
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const base = parseDraft(draft) ?? numeric ?? fallback
      setDraft(format(stepValue(base, event.key === 'ArrowUp' ? 1 : -1, event)))
    }
  }

  const ariaLabel = mixed ? `${field.label}, mixed values` : field.label
  const s = styles()

  return (
    <div
      role="spinbutton"
      tabIndex={disabled ? -1 : 0}
      data-disabled={disabled || undefined}
      data-editing={editing || undefined}
      aria-labelledby={mixed ? undefined : labelId}
      aria-label={ariaLabel}
      aria-describedby={scrubHintId}
      aria-valuemin={field.min}
      aria-valuemax={field.max}
      aria-valuenow={numeric ?? undefined}
      aria-valuetext={mixed ? 'mixed values' : undefined}
      className={cn(s.root(), className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
    >
      {editing ? (
        <input
          ref={inputRef}
          className={s.field()}
          value={draft}
          placeholder={mixed ? '—' : (field.placeholder ?? '')}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={handleInputKeyDown}
        />
      ) : (
        <div className={s.display()} data-ghost={numeric === null || undefined}>
          {field.glyph ? (
            <span className={s.leading()} aria-hidden="true">
              {field.glyph}
            </span>
          ) : null}
          {mixed ? (
            <span className={s.mixed()}>—</span>
          ) : (
            <span className={numeric === null ? s.mixed() : s.value()}>
              {numeric === null ? (field.placeholder ?? '') : format(numeric)}
            </span>
          )}
          {field.unit ? <span className={s.suffix()}>{field.unit}</span> : null}
        </div>
      )}
      <span id={scrubHintId} className="sr-only">
        Drag horizontally to scrub {field.label}. Hold Shift to move in larger steps, Alt for finer
        steps. Press Enter to type an exact value.
      </span>
    </div>
  )
}
