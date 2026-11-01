/*
 * History manager unit tests — the leak scenarios that caused the critical
 * undo bug (docs/12 §1.2): a leaked gesture used to swallow every later
 * commit into one history entry, so Ctrl+Z undied many actions at once.
 */
import { describe, expect, it } from 'vitest'

import { HistoryManager, installHistoryWatchdog, type HistorySnapshot } from '@/lib/project/history'

interface Snap extends HistorySnapshot {
  data: { value: number }
}

function makeManager(): HistoryManager<Snap> {
  return new HistoryManager<Snap>()
}

function snap(value: number): Snap {
  return { data: { value }, ui: {}, selection: null, activeScreenId: null }
}

describe('HistoryManager — basic push/undo/redo', () => {
  it('pushes outside gestures and undoes one step at a time', () => {
    const h = makeManager()
    h.push(snap(1))
    h.push(snap(2))
    expect(h.canUndo()).toBe(true)
    const prev = h.undo(snap(3))!
    expect(prev.data.value).toBe(2)
    const prev2 = h.undo(snap(2))!
    expect(prev2.data.value).toBe(1)
    expect(h.undo(snap(1))).toBeNull()
  })

  it('redo restores the invalidated branch in order', () => {
    const h = makeManager()
    h.push(snap(1))
    h.push(snap(2))
    h.undo(snap(3)) // → 2
    h.undo(snap(2)) // → 1
    const again = h.redo(snap(1))!
    expect(again.data.value).toBe(2)
    const again2 = h.redo(snap(2))!
    expect(again2.data.value).toBe(3)
    expect(h.canRedo()).toBe(false)
  })

  it('a new push clears the redo branch (redo invalidation)', () => {
    const h = makeManager()
    h.push(snap(1))
    h.undo(snap(2))
    expect(h.canRedo()).toBe(true)
    h.push(snap(99))
    expect(h.canRedo()).toBe(false)
  })

  it('caps history at HISTORY_CAP entries', () => {
    const h = makeManager()
    for (let i = 0; i < 150; i++) h.push(snap(i))
    let count = 0
    let cur = snap(999)
    while (h.undo(cur)) {
      count++
      cur = h.undo(snap(0)) ?? cur
    }
    // count pushes that remain: at most 100 (each undo pops one)
    expect(count).toBeLessThanOrEqual(100)
    expect(h.canUndo()).toBe(false)
  })
})

describe('HistoryManager — gesture coalescing', () => {
  it('only the FIRST commit inside a gesture pushes', () => {
    const h = makeManager()
    h.begin(7) // pointer drag
    expect(h.shouldPushOnCommit()).toBe(true) // first move
    expect(h.shouldPushOnCommit()).toBe(false) // subsequent moves coalesce
    expect(h.shouldPushOnCommit()).toBe(false)
    h.end(7)
    expect(h.shouldPushOnCommit()).toBe(true) // outside gesture again
  })

  it('anonymous gestures nest and release together', () => {
    const h = makeManager()
    h.begin() // scrub field
    h.begin() // nested placement block
    expect(h.shouldPushOnCommit()).toBe(true)
    expect(h.shouldPushOnCommit()).toBe(false)
    h.end()
    expect(h.inGesture).toBe(true) // still one level open
    expect(h.shouldPushOnCommit()).toBe(false)
    h.end()
    expect(h.inGesture).toBe(false)
    expect(h.shouldPushOnCommit()).toBe(true)
  })

  it('end is idempotent for unknown/ended tokens', () => {
    const h = makeManager()
    h.end(42) // never began
    h.end('keyboard')
    h.end()
    expect(h.inGesture).toBe(false)
    h.begin(1)
    h.end(1)
    h.end(1) // double end
    expect(h.inGesture).toBe(false)
  })

  it('independent pointer gestures do not interfere', () => {
    const h = makeManager()
    h.begin(1)
    expect(h.shouldPushOnCommit()).toBe(true)
    h.begin(2) // a second finger starts its own gesture
    expect(h.shouldPushOnCommit()).toBe(false) // still inside gesture 1's entry
    h.end(1)
    expect(h.inGesture).toBe(true) // gesture 2 still open
    h.end(2)
    expect(h.inGesture).toBe(false)
  })
})

describe('HistoryManager — leak protection (the critical bug)', () => {
  it('releaseAllGestures ends a stuck gesture so later commits push again', () => {
    const h = makeManager()
    h.begin(9)
    expect(h.shouldPushOnCommit()).toBe(true)
    // ... pointerup is lost (capture stolen / alt-tab) — the watchdog fires:
    h.releaseAllGestures()
    expect(h.inGesture).toBe(false)
    // The very next commit MUST push again (this is the regression test for
    // "undo deleted my entire screen").
    expect(h.shouldPushOnCommit()).toBe(true)
  })

  it('window watchdog releases pointer gestures on pointerup/pointercancel/blur', () => {
    const g = globalThis as unknown as { window?: unknown }
    const hadWindow = 'window' in g
    const fakeWindow = {
      listeners: {} as Record<string, ((e: { pointerId: number }) => void)[]>,
      addEventListener(type: string, fn: (e: { pointerId: number }) => void) {
        ;(this.listeners[type] ??= []).push(fn)
      },
      removeEventListener() {
        /* noop */
      },
      dispatch(type: string, pointerId: number) {
        for (const fn of this.listeners[type] ?? []) fn({ pointerId })
      }
    }
    ;(g as { window?: unknown }).window = fakeWindow
    try {
      const h = makeManager()
      const dispose = installHistoryWatchdog(h)
      h.begin(3)
      expect(h.inGesture).toBe(true)
      fakeWindow.dispatch('pointercancel', 3)
      expect(h.inGesture).toBe(false)
      expect(h.shouldPushOnCommit()).toBe(true)

      h.begin(4)
      h.begin('keyboard')
      h.begin()
      fakeWindow.dispatch('blur', 0)
      expect(h.inGesture).toBe(false)
      dispose()
    } finally {
      if (!hadWindow) delete (g as { window?: unknown }).window
    }
  })
})
