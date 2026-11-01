'use client'

/*
 * ColorField (doc §5.6.1, Phase-1 scope): a small swatch button opening a popover with
 * the floatingSurface chrome — hex input, alpha slider, token presets, and "clear".
 * The full OKLCH control (hue/chroma/lightness rails, recent colors, project token
 * list) lands with the Phase-2 style system.
 *
 * Slider slot classes mirror @/app/theme/color-slider.ts verbatim. That port currently
 * imports `@/theme/paint/checkerboard`, which does not exist in the app tree yet, so
 * the slot strings are inlined here to keep the import graph resolvable — swap them
 * for the theme import once the theme folder ships the paint module.
 *
 * Color values are data (hex literals the RN style object will hold), not chrome
 * styling: the swatch and preview render the value itself via inline backgroundColor.
 */

import { useId, useState } from 'react'
import { tv } from 'tailwind-variants'

import inputTheme from '@/app/theme/input/input'
import { floatingSurface } from '@/app/theme/overlay'
import { panelFieldBase } from '@/app/theme/panel/field/base'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { isMixed, type ColorFieldSpec } from '../schema'

const inputStyles = tv(inputTheme)

/* color-slider.ts slots (inlined — see header comment). */
const sliderRowClass = 'flex items-center gap-2'
const sliderLabelClass = 'w-7 shrink-0 text-[10px] font-medium text-muted'
const sliderTrackClass =
  'relative flex h-3 flex-1 touch-none items-center rounded-md select-none appearance-none bg-transparent ' +
  '[&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:rounded-md ' +
  '[&::-moz-range-track]:h-3 [&::-moz-range-track]:rounded-md ' +
  '[&::-webkit-slider-thumb]:mt-[-2px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:block [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow-sm ' +
  '[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-surface [&::-moz-range-thumb]:shadow-sm'

/** Token checkerboard (transparent-color pattern) built from tokens.css colors. */
const CHECKERBOARD =
  '[background-image:repeating-conic-gradient(var(--color-checkerboard)_0%_25%,var(--color-checkerboard-muted)_0%_50%)] [background-size:8px_8px]'

/*
 * Preset swatches styled with theme tokens; values mirror tokens.css (data for the RN
 * style object — Phase 2 replaces this list with per-project design tokens).
 */
const COLOR_PRESETS = [
  { label: 'Surface', value: '#f0f0f0' },
  { label: 'Muted', value: '#a6a6a6' },
  { label: 'Accent', value: '#2563eb' },
  { label: 'Primary', value: '#60a5fa' },
  { label: 'Component', value: '#bb8cff' },
  { label: 'Slot', value: '#f45cc4' },
  { label: 'Success', value: '#4ade80' },
  { label: 'Error', value: '#fa8585' },
] as const

const HEX_PATTERN = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

interface ParsedColor {
  /** 6-digit rgb hex. */
  hex: string
  /** 0–100. */
  alpha: number
}

function parseColor(value: string): ParsedColor | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const candidate = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  if (!HEX_PATTERN.test(candidate)) return null
  let hex = candidate.toLowerCase()
  if (hex.length === 4 || hex.length === 5) {
    hex = `#${[...hex.slice(1)].map((char) => char + char).join('')}`
  }
  const rgb = hex.slice(1, 7)
  const alphaHex = hex.length === 9 ? hex.slice(7, 9) : null
  return { hex: `#${rgb}`, alpha: alphaHex ? Math.round((parseInt(alphaHex, 16) / 255) * 100) : 100 }
}

function withAlpha(color: ParsedColor, alpha: number): string {
  if (alpha >= 100) return color.hex
  const alphaHex = Math.round((alpha / 100) * 255)
    .toString(16)
    .padStart(2, '0')
  return `${color.hex}${alphaHex}`
}

export interface ColorFieldProps {
  field: ColorFieldSpec
  labelId?: string
  disabled?: boolean
  onChange: (value: string) => void
  /** Brackets slider drags so they collapse into one undo entry (§5.6). */
  onScrubStart?: () => void
  onScrubEnd?: () => void
  className?: string
}

export function ColorField({
  field,
  labelId,
  disabled = false,
  onChange,
  onScrubStart,
  onScrubEnd,
  className,
}: ColorFieldProps) {
  const mixed = isMixed(field.value)
  const value = !mixed && typeof field.value === 'string' ? field.value : ''
  // Ghost: the effective default hex, shown muted while the value is unset.
  const ghost = !mixed && value === '' ? (field.placeholder ?? '') : ''
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const fieldLabelId = useId()

  // Re-seed the editor each time the popover opens so external edits show up.
  // React's derive-during-render pattern (no setState-in-effect).
  const [prevSeed, setPrevSeed] = useState({ open, value })
  if (prevSeed.open !== open || prevSeed.value !== value) {
    setPrevSeed({ open, value })
    if (open) setDraft(value)
  }

  const parsed = parseColor(draft)
  const ariaLabel = mixed ? `${field.label}, mixed values` : field.label

  function commit(next: string) {
    setDraft(next)
    if (next !== value) onChange(next)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setDraft(value)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-labelledby={mixed ? undefined : labelId}
          aria-label={ariaLabel}
          className={cn(panelFieldBase, 'flex w-full items-center gap-1.5 px-1 text-[11px]', (mixed || (!value && !ghost)) && 'text-muted', className)}
        >
          <span
            aria-hidden="true"
            className={cn('size-3.5 shrink-0 rounded-sm border border-border', CHECKERBOARD, !value && !ghost && 'opacity-60')}
            style={value || ghost ? { backgroundColor: value || ghost } : undefined}
          />
          <span className={cn('min-w-0 flex-1 truncate text-left', (mixed || ghost) && 'text-muted')}>
            {mixed ? '—' : value || ghost || 'None'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          floatingSurface,
          'w-52 border-0 p-2',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'duration-150 motion-reduce:animate-none data-[state=closed]:animate-none'
        )}
      >
        <div className="flex flex-col gap-2">
          {/* Preview over the transparency checkerboard. */}
          <div className={cn('h-6 w-full overflow-hidden rounded border border-border', CHECKERBOARD)}>
            <div
              className="size-full"
              style={
                parsed
                  ? {
                      backgroundColor: withAlpha(parsed, parsed.alpha),
                    }
                  : undefined
              }
            />
          </div>

          {/* Hex entry. */}
          <div className="flex items-center gap-1.5">
            <label id={fieldLabelId} className="text-[10px] font-medium text-muted" htmlFor={`${fieldLabelId}-input`}>
              Hex
            </label>
            <input
              id={`${fieldLabelId}-input`}
              type="text"
              value={draft}
              placeholder="#rrggbb"
              spellCheck={false}
              autoComplete="off"
              aria-label={`${ariaLabel}, hex value`}
              className={cn(inputStyles({ tone: 'panel', size: 'xs' }), 'min-w-0 flex-1')}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                if (parsed) commit(withAlpha(parsed, parsed.alpha))
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  if (parsed) commit(withAlpha(parsed, parsed.alpha))
                  event.currentTarget.blur()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  setDraft(value)
                  event.currentTarget.blur()
                }
              }}
            />
          </div>

          {/* Alpha (color-slider slots; drag brackets one undo entry). */}
          <div className={sliderRowClass}>
            <span className={sliderLabelClass} aria-hidden="true">
              A
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={parsed ? parsed.alpha : 100}
              disabled={!parsed}
              aria-label={`${ariaLabel}, opacity percent`}
              className={cn(sliderTrackClass, CHECKERBOARD)}
              onPointerDown={() => onScrubStart?.()}
              onPointerUp={() => onScrubEnd?.()}
              onPointerCancel={() => onScrubEnd?.()}
              onChange={(event) => {
                if (parsed) commit(withAlpha(parsed, Number(event.target.value)))
              }}
            />
            <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-muted">
              {parsed ? parsed.alpha : 100}%
            </span>
          </div>

          {/* Token presets (Phase 2: project design tokens). */}
          <div className="grid grid-cols-8 gap-1">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                title={preset.label}
                aria-label={`${ariaLabel}: ${preset.label}`}
                className={cn(
                  'size-4 rounded-sm border border-border outline-none hover:border-muted focus-visible:ring-1 focus-visible:ring-panel-focus'
                )}
                style={{ backgroundColor: preset.value }}
                onClick={() => commit(preset.value)}
              />
            ))}
          </div>

          {/* Clear → transparent / unset. */}
          <button
            type="button"
            className="self-start rounded px-1 py-0.5 text-[11px] text-muted hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus"
            onClick={() => commit('')}
          >
            Clear
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
