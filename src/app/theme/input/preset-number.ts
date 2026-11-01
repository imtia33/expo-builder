/*
 * Ported verbatim from open-pencil (https://github.com/open-pencil/open-pencil) — MIT License.
 * Copyright (c) 2026 Danila Poyarkov & OpenPencil contributors.
 * Source: src/theme/input/preset-number.ts
 */
/** Control widths are plain strings so they can be forwarded to child UI props. */
export const presetNumberSizes = {
  select: 'w-full sm:w-44',
  field: 'w-full sm:w-32'
} as const

const presetNumberTheme = {
  slots: {
    root: 'flex flex-col gap-1',
    row: 'flex flex-wrap items-center gap-2',
    error: 'text-xs text-error'
  }
} as const

export type PresetNumberTheme = typeof presetNumberTheme

export default presetNumberTheme
