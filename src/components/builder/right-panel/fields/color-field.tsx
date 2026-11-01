'use client'

/*
 * ColorField — the paint editor (Phase 1): a small swatch button opening a
 * Figma-like popover with three paint kinds over one value:
 *
 *   SOLID    HSV square + hue rail + alpha rail + hex input + eyedropper
 *   GRADIENT stops bar (draggable/add/remove stops), Linear⇄Radial, angle,
 *            and the same solid editor for the selected stop
 *   TOKEN    project theme tokens (swatch row) — binds { token } so the color
 *            follows the palette; a chip shows the binding with a detach link
 *
 * Gradient editing is offered only where RN can render it (field.gradient —
 * container backgroundColor); tokens are offered everywhere. The old hex-only
 * contract ('' = unset) is preserved: existing values and callers keep working.
 *
 * Color values are data (the RN style object will hold them), not chrome
 * styling: the swatch renders the value itself.
 */

import { useCallback, useId, useRef, useState } from 'react'
import { tv } from 'tailwind-variants'

import inputTheme from '@/app/theme/input/input'
import { floatingSurface } from '@/app/theme/overlay'
import { panelFieldBase } from '@/app/theme/panel/field/base'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useProjectStore } from '@/lib/project/store'
import { cn } from '@/lib/utils'
import {
  DEFAULT_THEME_COLORS,
  STARTER_GRADIENTS,
  gradientCss,
  isGradientPaint,
  isTokenPaint,
  normalizeGradient,
  normalizeStops,
  paintLabel,
  paintSwatchBackground,
  paletteResolver,
  type GradientPaint,
  type GradientStop,
  type PaintValue,
  type TokenPaint
} from '@/lib/paint'
import { hsvToHex, isValidHex, parseHex, rgbToHsv, splitAlpha, withAlpha, type Hsv } from '@/lib/paint/color-math'
import { isMixed, type ColorFieldSpec } from '../schema'

const inputStyles = tv(inputTheme)

/* color-slider.ts slots (inline — see the original header note). */
const sliderTrackClass =
  'relative h-3 flex-1 touch-none select-none appearance-none rounded-md bg-transparent ' +
  '[&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:rounded-md ' +
  '[&::-moz-range-track]:h-3 [&::-moz-range-track]:rounded-md ' +
  '[&::-webkit-slider-thumb]:mt-[-2px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:block [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow-sm ' +
  '[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-surface [&::-moz-range-thumb]:shadow-sm'

const CHECKERBOARD =
  '[background-image:repeating-conic-gradient(var(--color-checkerboard)_0%_25%,var(--color-checkerboard-muted)_0%_50%)] [background-size:8px_8px]'

const RECENT_KEY = 'expoforge:recent-colors'
const RECENT_MAX = 10

function readRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

function pushRecent(hex: string) {
  if (typeof window === 'undefined' || !isValidHex(hex)) return
  try {
    const next = [hex, ...readRecent().filter((x) => x.toLowerCase() !== hex.toLowerCase())].slice(0, RECENT_MAX)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — recents are a nicety, never a failure */
  }
}

/* ── solid draft ────────────────────────────────────────────────────────── */

interface SolidDraft {
  hex: string
  alpha: number
}

function solidFrom(value: PaintValue | undefined, resolvedGhost: string | null): SolidDraft {
  if (typeof value === 'string' && value) return splitAlpha(value)
  if (resolvedGhost) return splitAlpha(resolvedGhost)
  return { hex: '#000000', alpha: 100 }
}

/* ── shared drag rail (hue / alpha) ─────────────────────────────────────── */

interface RailProps {
  label: string
  value: number
  min: number
  max: number
  background: string
  className?: string
  onChange: (v: number) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
}

function Rail({ label, value, min, max, background, className, onChange, onScrubStart, onScrubEnd }: RailProps) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const apply = useCallback(
    (clientX: number) => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      onChange(Math.round((min + t * (max - min)) * 10) / 10)
    },
    [max, min, onChange]
  )

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      className={cn('relative h-3 cursor-pointer touch-none rounded', className)}
      style={{ background }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragging.current = true
        onScrubStart?.()
        apply(e.clientX)
      }}
      onPointerMove={(e) => {
        if (dragging.current) apply(e.clientX)
      }}
      onPointerUp={(e) => {
        dragging.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
        onScrubEnd?.()
      }}
      onPointerCancel={() => {
        dragging.current = false
        onScrubEnd?.()
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-surface shadow-sm"
        style={{ left: `${((value - min) / (max - min)) * 100}%` }}
      />
    </div>
  )
}

/* ── saturation/value square ────────────────────────────────────────────── */

interface SvSquareProps {
  hsv: Hsv
  onChange: (hsv: Hsv) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
}

function SvSquare({ hsv, onChange, onScrubStart, onScrubEnd }: SvSquareProps) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const apply = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const s = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const v = 1 - Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
      onChange({ h: hsv.h, s, v })
    },
    [onChange, hsv.h]
  )

  return (
    <div
      ref={ref}
      role="application"
      aria-label="Saturation and brightness"
      className="relative h-28 w-full cursor-crosshair touch-none rounded"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex({
          h: hsv.h,
          s: 1,
          v: 1
        })})`
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragging.current = true
        onScrubStart?.()
        apply(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (dragging.current) apply(e.clientX, e.clientY)
      }}
      onPointerUp={(e) => {
        dragging.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
        onScrubEnd?.()
      }}
      onPointerCancel={() => {
        dragging.current = false
        onScrubEnd?.()
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm"
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }}
      />
    </div>
  )
}

/* ── gradient stops bar ─────────────────────────────────────────────────── */

interface StopsBarProps {
  gradient: GradientPaint
  selected: number
  onSelect: (index: number) => void
  onChange: (stops: GradientStop[]) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
}

function StopsBar({ gradient, selected, onSelect, onChange, onScrubStart, onScrubEnd }: StopsBarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const dragIndex = useRef<number | null>(null)
  const stops = normalizeStops(gradient.stops)

  const positionAt = (clientX: number): number => {
    const el = ref.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  const moveStop = (index: number, clientX: number) => {
    const position = positionAt(clientX)
    const next = stops.map((s, i) => (i === index ? { ...s, position } : s))
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={ref}
        className={cn('relative h-5 w-full touch-none rounded border border-border', CHECKERBOARD)}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          const position = positionAt(e.clientX)
          // Clicking an existing stop selects it; elsewhere adds a stop at the
          // click position carrying the selected stop's color (Figma behavior).
          const hit = stops.findIndex((s) => Math.abs(s.position - position) < 0.04)
          if (hit >= 0) {
            onSelect(hit)
            e.currentTarget.setPointerCapture(e.pointerId)
            dragIndex.current = hit
            onScrubStart?.()
          } else if (stops.length < 10) {
            const next = normalizeStops([...stops, { color: stops[selected]?.color ?? '#FFFFFF', position }])
            const index = next.findIndex((s) => s.position === position)
            onChange(next)
            onSelect(index >= 0 ? index : next.length - 1)
            e.currentTarget.setPointerCapture(e.pointerId)
            dragIndex.current = index >= 0 ? index : next.length - 1
            onScrubStart?.()
          }
        }}
        onPointerMove={(e) => {
          if (dragIndex.current !== null) moveStop(dragIndex.current, e.clientX)
        }}
        onPointerUp={(e) => {
          if (dragIndex.current !== null) {
            dragIndex.current = null
            e.currentTarget.releasePointerCapture(e.pointerId)
            onScrubEnd?.()
          }
        }}
        onPointerCancel={() => {
          dragIndex.current = null
          onScrubEnd?.()
        }}
      >
        <div aria-hidden className="absolute inset-0 rounded" style={{ background: gradientCss(gradient) }} />
        {stops.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              'pointer-events-none absolute bottom-0 top-auto h-3 w-3 -translate-x-1/2 translate-y-full rounded-[2px] border',
              i === selected ? 'border-2 border-panel-focus shadow-sm' : 'border-white/70'
            )}
            style={{ left: `${s.position * 100}%`, background: s.color, marginTop: 2 }}
          />
        ))}
      </div>
      <p className="text-[9px] leading-tight text-muted">Click the bar to add a stop · drag to reposition</p>
    </div>
  )
}

/* ── the field ──────────────────────────────────────────────────────────── */

export interface ColorFieldProps {
  field: ColorFieldSpec
  labelId?: string
  disabled?: boolean
  onChange: (value: string | GradientPaint | TokenPaint) => void
  /** Brackets slider/square/stops drags so they collapse into one undo entry. */
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
  className
}: ColorFieldProps) {
  const mixed = isMixed(field.value)
  /* Narrow the MIXED sentinel out through the type guard so `value` is a
   * plain PaintValue for the rest of the component. */
  const value = isMixed(field.value) ? undefined : field.value
  const supportsGradient = field.gradient === true

  /* palette + preview mode (token swatches + ghost resolution) */
  const palette = useProjectStore((s) => s.data.theme?.colors)
  const themeMode = useProjectStore((s) => s.ui.themeMode)
  const resolveToken = paletteResolver(palette)

  const boundToken = isTokenPaint(value) ? value.token : null
  const resolvedGhost =
    field.placeholder && /^#[0-9a-f]{3,8}$/i.test(field.placeholder)
      ? field.placeholder
      : null

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'solid' | 'gradient'>(isGradientPaint(value) ? 'gradient' : 'solid')
  const [solid, setSolid] = useState<SolidDraft>(() => solidFrom(value, boundToken ? resolveToken(boundToken, themeMode) : resolvedGhost))
  const [grad, setGrad] = useState<GradientPaint>(() =>
    isGradientPaint(value) ? normalizeGradient(value) : normalizeGradient(STARTER_GRADIENTS[0])
  )
  const [stopIndex, setStopIndex] = useState(0)
  const [recent, setRecent] = useState<string[]>([])
  const fieldLabelId = useId()

  /* Re-seed the editors whenever the popover opens or the external value
   * changes (derive-during-render, no setState-in-effect). */
  const [prevSeed, setPrevSeed] = useState({ open, value })
  if (prevSeed.open !== open || prevSeed.value !== value) {
    setPrevSeed({ open, value })
    if (open) {
      setSolid(solidFrom(value, boundToken ? resolveToken(boundToken, themeMode) : resolvedGhost))
      if (isGradientPaint(value)) {
        setGrad(normalizeGradient(value))
        setTab('gradient')
      } else if (!isTokenPaint(value)) {
        setTab('solid')
      }
      setStopIndex(0)
      setRecent(readRecent())
    }
  }

  const hsv: Hsv = rgbToHsv(parseHex(solid.hex)?.rgb ?? { r: 0, g: 0, b: 0 })
  const ariaLabel = mixed ? `${field.label}, mixed values` : field.label

  const commitSolid = useCallback(
    (next: SolidDraft) => {
      setSolid(next)
      onChange(withAlpha(next.hex, next.alpha))
    },
    [onChange]
  )

  const commitGradient = useCallback(
    (next: GradientPaint) => {
      const normalized = normalizeGradient(next)
      setGrad(normalized)
      onChange(normalized)
    },
    [onChange]
  )

  const setSolidHsv = useCallback(
    (next: Hsv) => {
      commitSolid({ ...solid, hex: hsvToHex(next) })
    },
    [commitSolid, solid]
  )

  /* selected stop editing shares the solid editor (alpha per stop via hex8) */
  const stops = normalizeStops(grad.stops)
  const currentStop = stops[Math.min(stopIndex, stops.length - 1)]
  const stopSolid: SolidDraft = currentStop ? splitAlpha(currentStop.color) : { hex: '#FFFFFF', alpha: 100 }
  const stopHsv: Hsv = rgbToHsv(parseHex(stopSolid.hex)?.rgb ?? { r: 255, g: 255, b: 255 })

  const commitStopSolid = useCallback(
    (next: SolidDraft) => {
      const color = withAlpha(next.hex, next.alpha)
      const nextStops = stops.map((s, i) => (i === stopIndex ? { ...s, color } : s))
      commitGradient({ ...grad, stops: nextStops } as GradientPaint)
    },
    [commitGradient, grad, stopIndex, stops]
  )

  const deleteStop = useCallback(() => {
    if (stops.length <= 2) return
    const next = stops.filter((_, i) => i !== stopIndex)
    commitGradient({ ...grad, stops: next } as GradientPaint)
    setStopIndex((i) => Math.max(0, Math.min(i, next.length - 1)))
  }, [commitGradient, grad, stopIndex, stops])

  const pickEyedropper = useCallback(async () => {
    const EyeDropperAPI = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
    if (!EyeDropperAPI) return
    try {
      const result = await new EyeDropperAPI().open()
      if (isValidHex(result.sRGBHex)) {
        pushRecent(result.sRGBHex)
        setRecent(readRecent())
        commitSolid({ hex: result.sRGBHex, alpha: 100 })
      }
    } catch {
      /* user cancelled the eyedropper — no change */
    }
  }, [commitSolid])

  const swatchCss = mixed ? null : paintSwatchBackground(value, resolveToken, themeMode)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setSolid(solidFrom(value, boundToken ? resolveToken(boundToken, themeMode) : resolvedGhost))
          setRecent(readRecent())
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-labelledby={mixed ? undefined : labelId}
          aria-label={ariaLabel}
          className={cn(panelFieldBase, 'flex w-full items-center gap-1.5 px-1 text-[11px]', (mixed || value === undefined) && 'text-muted', className)}
        >
          <span
            aria-hidden="true"
            className={cn('size-3.5 shrink-0 rounded-sm border border-border', CHECKERBOARD, !swatchCss && 'opacity-60')}
            style={swatchCss ? { background: swatchCss } : undefined}
          />
          <span className={cn('min-w-0 flex-1 truncate text-left', (mixed || value === undefined) && 'text-muted')}>
            {mixed ? '—' : paintLabel(value) || 'None'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          floatingSurface,
          'w-64 border-0 p-2',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'duration-150 motion-reduce:animate-none data-[state=closed]:animate-none'
        )}
      >
        <div className="flex flex-col gap-2">
          {/* Mode tabs: Solid / Gradient (gradient only where RN supports it). */}
          {supportsGradient && (
            <div className="grid grid-cols-2 gap-1 rounded bg-panel-field p-0.5" role="tablist" aria-label="Paint type">
              {(['solid', 'gradient'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={cn(
                    'h-5 cursor-pointer rounded-sm px-1.5 text-[11px] capitalize transition-colors',
                    tab === t ? 'bg-hover text-surface' : 'text-muted hover:text-surface'
                  )}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {tab === 'solid' || !supportsGradient ? (
            <>
              {/* Token binding chip — the value follows the palette until detached. */}
              {boundToken && (
                <div className="flex items-center justify-between rounded bg-panel-field px-1.5 py-1 text-[10px] text-muted">
                  <span className="truncate">
                    Bound to <span className="font-semibold text-surface">{boundToken}</span>
                  </span>
                  <button
                    type="button"
                    className="ml-2 shrink-0 cursor-pointer rounded px-1 text-[10px] text-primary hover:bg-hover"
                    onClick={() => {
                      const resolved = resolveToken(boundToken, themeMode)
                      commitSolid(resolved ? { ...splitAlpha(resolved), alpha: 100 } : solid)
                    }}
                  >
                    Detach
                  </button>
                </div>
              )}

              {/* HSV square + hue rail */}
              <SvSquare hsv={hsv} onChange={setSolidHsv} onScrubStart={onScrubStart} onScrubEnd={onScrubEnd} />
              <Rail
                label="Hue"
                value={hsv.h}
                min={0}
                max={360}
                background="linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
                onChange={(h) => setSolidHsv({ ...hsv, h })}
                onScrubStart={onScrubStart}
                onScrubEnd={onScrubEnd}
              />

              {/* Hex + alpha + eyedropper */}
              <div className="flex items-center gap-1.5">
                <label id={fieldLabelId} className="text-[10px] font-medium text-muted" htmlFor={`${fieldLabelId}-input`}>
                  Hex
                </label>
                <input
                  id={`${fieldLabelId}-input`}
                  type="text"
                  value={solid.hex}
                  placeholder="#rrggbb"
                  spellCheck={false}
                  autoComplete="off"
                  aria-label={`${ariaLabel}, hex value`}
                  className={cn(inputStyles({ tone: 'panel', size: 'xs' }), 'min-w-0 flex-1')}
                  onChange={(event) => {
                    const next = event.target.value.startsWith('#') ? event.target.value : `#${event.target.value}`
                    setSolid({ ...solid, hex: next })
                    if (isValidHex(next)) commitSolid({ ...solid, hex: next.toLowerCase() })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      if (isValidHex(solid.hex)) {
                        pushRecent(solid.hex.toLowerCase())
                        commitSolid({ ...solid, hex: solid.hex.toLowerCase() })
                      }
                      event.currentTarget.blur()
                    }
                  }}
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={solid.alpha}
                  aria-label={`${ariaLabel}, opacity percent`}
                  className={cn(inputStyles({ tone: 'panel', size: 'xs' }), 'w-12 tabular-nums')}
                  onChange={(event) => {
                    const alpha = Math.max(0, Math.min(100, Number(event.target.value) || 0))
                    commitSolid({ ...solid, alpha })
                  }}
                />
                <button
                  type="button"
                  aria-label="Pick color from screen"
                  title="Pick color from screen"
                  onClick={pickEyedropper}
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted outline-none hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus"
                >
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                    <path d="M11 8m2.8-2.8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L9 20l-4.6 1.1L5.5 16.5Z" />
                    <path d="m14.5 4.5 5 5" />
                  </svg>
                </button>
              </div>

              {/* Alpha rail (checkerboard behind the color gradient). */}
              <div className="flex items-center gap-1.5">
                <span className="w-7 shrink-0 text-[10px] font-medium text-muted">A</span>
                <div className={cn('relative h-3 flex-1 rounded', CHECKERBOARD)}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={solid.alpha}
                    aria-label={`${ariaLabel}, opacity percent slider`}
                    className={cn(sliderTrackClass, 'absolute inset-0 w-full')}
                    style={{ background: `linear-gradient(to right, transparent, ${solid.hex})` }}
                    onPointerDown={() => onScrubStart?.()}
                    onPointerUp={() => {
                      onScrubEnd?.()
                      pushRecent(solid.hex.toLowerCase())
                    }}
                    onPointerCancel={() => onScrubEnd?.()}
                    onChange={(event) => commitSolid({ ...solid, alpha: Number(event.target.value) })}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Gradient editor: stops bar + type/angle + selected stop color. */}
              <StopsBar
                gradient={grad}
                selected={stopIndex}
                onSelect={setStopIndex}
                onChange={(stops) => commitGradient({ ...grad, stops } as GradientPaint)}
                onScrubStart={onScrubStart}
                onScrubEnd={onScrubEnd}
              />

              <div className="flex items-center gap-1.5">
                <div className="grid flex-1 grid-cols-2 gap-1 rounded bg-panel-field p-0.5">
                  {(['linear-gradient', 'radial-gradient'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={grad.type === t}
                      className={cn(
                        'h-5 cursor-pointer rounded-sm px-1.5 text-[11px] transition-colors',
                        grad.type === t ? 'bg-hover text-surface' : 'text-muted hover:text-surface'
                      )}
                      onClick={() => commitGradient({ ...grad, type: t } as GradientPaint)}
                    >
                      {t === 'linear-gradient' ? 'Linear' : 'Radial'}
                    </button>
                  ))}
                </div>
                {grad.type === 'linear-gradient' && (
                  <input
                    type="number"
                    min={0}
                    max={360}
                    step={1}
                    value={(grad as { angle: number }).angle}
                    aria-label="Gradient angle degrees"
                    className={cn(inputStyles({ tone: 'panel', size: 'xs' }), 'w-14 tabular-nums')}
                    onChange={(event) =>
                      commitGradient({
                        ...grad,
                        angle: Math.max(0, Math.min(360, Math.round(Number(event.target.value) || 0)))
                      } as GradientPaint)
                    }
                  />
                )}
                <span className="w-3 text-[10px] text-muted">°</span>
                <button
                  type="button"
                  aria-label="Delete selected stop"
                  title="Delete selected stop"
                  disabled={stops.length <= 2}
                  onClick={deleteStop}
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted outline-none hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                    <path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>

              {/* Selected stop color (same solid editor, compact). */}
              <p className="text-[10px] font-medium text-muted">Stop {stopIndex + 1} color</p>
              <SvSquare
                hsv={stopHsv}
                onChange={(next) => commitStopSolid({ ...stopSolid, hex: hsvToHex(next) })}
                onScrubStart={onScrubStart}
                onScrubEnd={onScrubEnd}
              />
              <Rail
                label="Stop hue"
                value={stopHsv.h}
                min={0}
                max={360}
                background="linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
                onChange={(h) => commitStopSolid({ ...stopSolid, hex: hsvToHex({ ...stopHsv, h }) })}
                onScrubStart={onScrubStart}
                onScrubEnd={onScrubEnd}
              />
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={stopSolid.hex}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Gradient stop hex value"
                  className={cn(inputStyles({ tone: 'panel', size: 'xs' }), 'min-w-0 flex-1')}
                  onChange={(event) => {
                    const next = event.target.value.startsWith('#') ? event.target.value : `#${event.target.value}`
                    if (isValidHex(next)) commitStopSolid({ ...stopSolid, hex: next.toLowerCase() })
                  }}
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(stopSolid.alpha)}
                  aria-label="Gradient stop opacity percent"
                  className={cn(inputStyles({ tone: 'panel', size: 'xs' }), 'w-12 tabular-nums')}
                  onChange={(event) =>
                    commitStopSolid({ ...stopSolid, alpha: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })
                  }
                />
              </div>

              {/* Starter gradients */}
              <div className="grid grid-cols-5 gap-1">
                {STARTER_GRADIENTS.map((g, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Starter gradient ${i + 1}`}
                    className="h-5 cursor-pointer rounded-sm border border-border outline-none hover:border-muted focus-visible:ring-1 focus-visible:ring-panel-focus"
                    style={{ background: gradientCss(g) }}
                    onClick={() => {
                      commitGradient(g)
                      setStopIndex(0)
                    }}
                  />
                ))}
              </div>

              {grad.type === 'radial-gradient' && (
                <p className="text-[9px] leading-tight text-muted">
                  Radial renders in the canvas; generated code uses expo-linear-gradient (linear) — the closest RN equivalent.
                </p>
              )}
            </>
          )}

          {/* Project theme tokens — click to BIND the field to the palette. */}
          {Object.keys(palette ?? DEFAULT_THEME_COLORS).length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-medium text-muted">Theme tokens</p>
              <div className="grid grid-cols-8 gap-1">
                {Object.entries(palette ?? DEFAULT_THEME_COLORS).map(([name, pair]) => (
                  <button
                    key={name}
                    type="button"
                    title={`${name} · ${pair[themeMode]}`}
                    aria-label={`${ariaLabel}: bind token ${name}`}
                    className={cn(
                      'size-4 cursor-pointer rounded-sm border outline-none hover:border-muted focus-visible:ring-1 focus-visible:ring-panel-focus',
                      boundToken === name ? 'border-panel-focus border-2' : 'border-border'
                    )}
                    style={{ backgroundColor: pair[themeMode] }}
                    onClick={() => onChange({ token: name })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent solid colors. */}
          {recent.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-medium text-muted">Recent</p>
              <div className="grid grid-cols-8 gap-1">
                {recent.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    title={hex}
                    aria-label={`${ariaLabel}: ${hex}`}
                    className={cn('size-4 cursor-pointer rounded-sm border border-border outline-none hover:border-muted focus-visible:ring-1 focus-visible:ring-panel-focus')}
                    style={{ backgroundColor: hex }}
                    onClick={() => {
                      setTab('solid')
                      commitSolid({ ...splitAlpha(hex), alpha: 100 })
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Clear → unset. */}
          <button
            type="button"
            className="self-start rounded px-1 py-0.5 text-[11px] text-muted hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus"
            onClick={() => onChange('')}
          >
            Clear
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
