/*
 * Ported verbatim from open-pencil (https://github.com/open-pencil/open-pencil) — MIT License.
 * Copyright (c) 2026 Danila Poyarkov & OpenPencil contributors.
 * Source: src/theme/panel/drill-in.ts
 */
export default {
  slots: {
    root: 'relative flex min-h-0 flex-1 flex-col',
    base: 'isolate flex min-h-0 flex-1 flex-col',
    detail: 'absolute inset-0 z-10 flex min-h-0 flex-col bg-panel',
    header: 'flex shrink-0 items-center gap-1 border-b border-border px-1.5 py-1',
    body: 'flex min-h-0 flex-1 flex-col'
  }
} as const
