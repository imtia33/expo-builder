'use client'

/*
 * SliderField — a compact 0..N range row for style values that are naturally
 * percent-like (opacity, shadowOpacity): the panel-field look on the left, a
 * native range input styled with the ported color-slider slots, and a tabular
 * readout on the right. Drag brackets one undo entry via onScrubStart/End.
 */

import { useId } from 'react'
import { tv } from 'tailwind-variants'

import inputTheme from '@/app/theme/input/input'
import { cn } from '@/lib/utils'
import { isMixed, type SliderFieldSpec } from '../schema'

const inputStyles = tv(inputTheme)

/* color-slider.ts slots (same inlined strings the ColorField uses). */
const sliderTrackClass =
  'relative flex h-3 flex-1 touch-none items-center rounded-md select-none appearance-none bg-transparent ' +
  '[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-md [&::-webkit-slider-runnable-track]:bg-panel-field-hover ' +
  '[&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-md [&::-moz-range-track]:bg-panel-field-hover ' +
  '[&::-webkit-slider-thumb]:mt-[-3px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:block [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow-sm ' +
  '[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-surface [&::-moz-range-thumb]:shadow-sm'

export interface SliderFieldProps {
  field: SliderFieldSpec
  labelId?: string
  disabled?: boolean
  onChange: (value: number) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
  className?: string
}

export function SliderField({
  field,
  labelId,
  disabled = false,
  onChange,
  onScrubStart,
  onScrubEnd,
  className
}: SliderFieldProps) {
  const hintId = useId()
  const mixed = isMixed(field.value)
  const fallback = Number(field.defaultValue ?? field.min)
  const numeric = !mixed && typeof field.value === 'number' ? field.value : Number.isFinite(fallback) ? fallback : field.min
  const format = field.format ?? ((value: number) => String(Math.round(value * 100) / 100))

  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={numeric}
        disabled={disabled || mixed}
        aria-labelledby={mixed ? undefined : labelId}
        aria-label={mixed ? `${field.label}, mixed values` : field.label}
        aria-describedby={hintId}
        className={cn(sliderTrackClass, 'min-w-0 flex-1')}
        onPointerDown={() => onScrubStart?.()}
        onPointerUp={() => onScrubEnd?.()}
        onPointerCancel={() => onScrubEnd?.()}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span
        className={cn(
          inputStyles({ tone: 'panel', size: 'xs', state: mixed ? 'mixed' : 'idle' }),
          'w-11 shrink-0 text-center tabular-nums'
        )}
        aria-hidden="true"
      >
        {mixed ? '—' : format(numeric)}
      </span>
      <span id={hintId} className="sr-only">
        {field.label} slider.
      </span>
    </div>
  )
}
