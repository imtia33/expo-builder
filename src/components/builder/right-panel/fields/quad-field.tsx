'use client'

/*
 * QuadField — Figma-style linked quads for the four-sided style keys
 * (padding/margin/corner radius). One full-width "All" scrub field over a 2×2
 * grid of side fields:
 *
 *   Label  [    All    ]
 *          [ T  ] [ R  ]
 *          [ B  ] [ L  ]
 *
 * "All" reads the common value when all four sides are explicitly equal, and
 * writing it commits the value to every side key; individual sides override
 * afterwards. All four sides are independent style keys (paddingTop, …), so
 * codegen always emits exactly what the inspector shows.
 */

import { useId } from 'react'

import { cn } from '@/lib/utils'
import { NumberField } from './number-field'

export interface QuadValues {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface QuadFieldProps {
  id: string
  label: string
  values: QuadValues
  /**
   * Commits one patch of style keys → values. A value of `undefined` removes
   * the key (the store's setNodeStyle contract).
   */
  onChange: (patch: Record<string, number | undefined>) => void
  keys: { top: string; right: string; bottom: string; left: string }
  onScrubStart?: () => void
  onScrubEnd?: () => void
  step?: number
  min?: number
  /** Margins accept negative values; padding does not. */
  allowNegative?: boolean
  className?: string
}

export function QuadField({
  id,
  label,
  values,
  onChange,
  keys,
  onScrubStart,
  onScrubEnd,
  step = 1,
  min = 0,
  allowNegative = false,
  className
}: QuadFieldProps) {
  const labelId = useId()
  const sides: { key: keyof QuadValues; glyph: string; styleKey: string; sideLabel: string }[] = [
    { key: 'top', glyph: 'T', styleKey: keys.top, sideLabel: `${label} top` },
    { key: 'right', glyph: 'R', styleKey: keys.right, sideLabel: `${label} right` },
    { key: 'bottom', glyph: 'B', styleKey: keys.bottom, sideLabel: `${label} bottom` },
    { key: 'left', glyph: 'L', styleKey: keys.left, sideLabel: `${label} left` }
  ]

  const allDefined =
    values.top !== undefined && values.right !== undefined && values.bottom !== undefined && values.left !== undefined
  const allEqual = allDefined && values.top === values.right && values.right === values.bottom && values.bottom === values.left

  function commitAll(value: number) {
    onChange({ [keys.top]: value, [keys.right]: value, [keys.bottom]: value, [keys.left]: value })
  }

  return (
    <div className={cn('flex min-w-0 items-start gap-1.5', className)}>
      <label id={labelId} className="mt-1.5 w-16 shrink-0 truncate text-[11px] leading-none text-muted">
        {label}
      </label>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
        <div className="col-span-2">
          <NumberField
            field={{
              id: `${id}-all`,
              label: `All ${label.toLowerCase()}`,
              kind: 'number',
              value: allEqual ? values.top : undefined,
              defaultValue: allEqual ? values.top : 0,
              placeholder: allDefined ? '—' : '',
              glyph: '∗',
              step,
              min: allowNegative ? undefined : min
            }}
            labelId={labelId}
            onChange={commitAll}
            onScrubStart={onScrubStart}
            onScrubEnd={onScrubEnd}
          />
        </div>
        {sides.map((side) => (
          <NumberField
            key={side.key}
            field={{
              id: `${id}-${side.key}`,
              label: side.sideLabel,
              kind: 'number',
              value: values[side.key],
              glyph: side.glyph,
              step,
              min: allowNegative ? undefined : min
            }}
            onChange={(value) => onChange({ [side.styleKey]: value })}
            onScrubStart={onScrubStart}
            onScrubEnd={onScrubEnd}
          />
        ))}
      </div>
    </div>
  )
}
