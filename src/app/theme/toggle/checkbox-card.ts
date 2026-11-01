/*
 * Ported verbatim from open-pencil (https://github.com/open-pencil/open-pencil) — MIT License.
 * Copyright (c) 2026 Danila Poyarkov & OpenPencil contributors.
 * Source: src/theme/toggle/checkbox-card.ts
 */
export default {
  slots: {
    root: 'flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-3 text-xs text-surface transition-colors hover:bg-hover has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-accent/5 focus-within:ring-2 focus-within:ring-accent/50 has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-50',
    text: 'flex min-w-0 flex-col',
    label: 'font-medium',
    description: 'mt-1 text-muted'
  }
}
