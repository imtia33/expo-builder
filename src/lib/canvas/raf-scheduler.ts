/*
 * Ported verbatim from open-pencil (https://github.com/open-pencil/open-pencil) — MIT License.
 * Copyright (c) 2026 Danila Poyarkov & OpenPencil contributors.
 * Source: packages/vue/src/shared/input/raf-scheduler.ts
 * Framework-free; no changes needed for React.
 */

export function createRafScheduler(flush: () => void) {
  let rafId = 0

  function schedule() {
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      flush()
    })
  }

  function cancel() {
    if (!rafId) return
    cancelAnimationFrame(rafId)
    rafId = 0
  }

  return { schedule, cancel }
}
