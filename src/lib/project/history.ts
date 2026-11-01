/*
 * Transactional history manager — the undo/redo engine behind the store.
 *
 * Why this exists (docs/12 §1.2): the v2 snapshot-undo used a bare gesture-depth
 * counter with two fatal failure modes:
 *   1. Gesture LEAKS. A second pointerdown during an active drag re-entered
 *      beginGesture; the first drag's endGesture was swallowed, the counter
 *      never reached 0, and every later commit coalesced into one history
 *      entry — Ctrl+Z then undid many actions at once ("deleted my screen").
 *   2. In-place mutations. reindex() mutated `order` on objects shared with
 *      earlier snapshots, so restored states were silently wrong.
 *
 * Design (docs/12 §5):
 *   - Gestures are OWNED by tokens: a pointerId for drags, 'keyboard' for the
 *     arrow-nudge batch, or anonymous nesting (scrub fields, placement blocks).
 *   - Leak-proofing: the store installs window-level watchdogs (pointerup,
 *     pointercancel, blur) that release pointer-owned gestures even when the
 *     capturing element never sees the event. `releaseAllGestures` is the
 *     hard reset (also exposed for tests and the watchdog).
 *   - Snapshots are REFERENCES to immutable data (structural sharing): the
 *     store's copy-on-write rule guarantees unchanged subtrees are shared, so
 *     history costs only the changed paths — no JSON deep clones (memory rule
 *     from the spec: no crude full-project snapshots per operation).
 *   - Coalescing: the FIRST commit inside a gesture pushes the pre-state;
 *     the rest of the gesture is one logical operation. Commits outside a
 *     gesture always push.
 *   - Redo invalidation: any push clears the future stack (enforced here so
 *     the store cannot forget it).
 */

/** One undo step: references to the pre-mutation editor state (store-typed). */
export interface HistorySnapshot {
  data: unknown
  ui: unknown
  selection: unknown
  activeScreenId: unknown
}

export type GestureToken = number | 'keyboard' | 'anonymous'

/** Max history entries per direction (structural sharing keeps each cheap). */
export const HISTORY_CAP = 100

export class HistoryManager<S extends HistorySnapshot> {
  private past: S[] = []
  private future: S[] = []

  /** pointerId → open drag/scrub gestures owned by that pointer. */
  private pointerGestures = new Set<number>()
  /** Arrow-key nudge batch (cleared when all held keys release / blur). */
  private keyboardGesture = false;
  /** Anonymous nesting depth (scrub fields, placement try/finally blocks). */
  private anonDepth = 0
  /** Whether the open gesture already pushed its pre-state. */
  private pushedInGesture = false

  /* ── gesture lifecycle ─────────────────────────────────────────────── */

  /** Open (or join) a gesture. `token`: pointerId | 'keyboard' | undefined(anonymous). */
  begin(token?: GestureToken): void {
    if (typeof token === 'number') this.pointerGestures.add(token)
    else if (token === 'keyboard') this.keyboardGesture = true
    else this.anonDepth += 1
  }

  /** Close a gesture. Unknown/already-closed tokens are a no-op (idempotent). */
  end(token?: GestureToken): void {
    if (typeof token === 'number') {
      this.pointerGestures.delete(token)
    } else if (token === 'keyboard') {
      this.keyboardGesture = false
    } else if (this.anonDepth > 0) {
      this.anonDepth -= 1
    }
    if (!this.inGesture) this.pushedInGesture = false
  }

  /** True while any gesture is open (commits coalesce into one entry). */
  get inGesture(): boolean {
    return this.pointerGestures.size > 0 || this.keyboardGesture || this.anonDepth > 0
  }

  /**
   * Hard release of every open gesture. Called by the window watchdogs
   * (blur / pointercancel storms), before external document swaps, and in
   * tests. A released gesture can never swallow later commits.
   */
  releaseAllGestures(): void {
    this.pointerGestures.clear()
    this.keyboardGesture = false
    this.anonDepth = 0
    this.pushedInGesture = false
  }

  /* ── commit protocol ───────────────────────────────────────────────── */

  /**
   * Whether the next commit must push the current state onto `past`.
   * First commit of a gesture: yes. Rest of the gesture: no. Outside a
   * gesture: always yes. Marks the gesture as pushed.
   */
  shouldPushOnCommit(): boolean {
    if (!this.inGesture) return true
    if (this.pushedInGesture) return false
    this.pushedInGesture = true
    return true
  }

  /** Push one pre-state snapshot (store owns immutability). Clears future. */
  push(snapshot: S): void {
    this.past.push(snapshot)
    if (this.past.length > HISTORY_CAP) this.past.shift()
    this.future = []
  }

  /* ── undo / redo ───────────────────────────────────────────────────── */

  canUndo(): boolean {
    return this.past.length > 0
  }

  canRedo(): boolean {
    return this.future.length > 0
  }

  /** Pop the previous state; `current` is parked for redo. Null when empty. */
  undo(current: S): S | null {
    const prev = this.past.pop()
    if (!prev) return null
    this.future.push(current)
    if (this.future.length > HISTORY_CAP) this.future.shift()
    return prev
  }

  /** Pop the redo state; `current` is parked for a subsequent undo. */
  redo(current: S): S | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push(current)
    if (this.past.length > HISTORY_CAP) this.past.shift()
    return next
  }

  /** Mirror arrays into store state (top-bar subscribes to their lengths). */
  pastView(): S[] {
    return this.past.slice()
  }

  futureView(): S[] {
    return this.future.slice()
  }

  /** Drop all history (external document load / reset). */
  clear(): void {
    this.past = []
    this.future = []
    this.releaseAllGestures()
  }

  /** Read-only views for debugging/tests. */
  depths(): { pointer: number; keyboard: boolean; anonymous: number } {
    return { pointer: this.pointerGestures.size, keyboard: this.keyboardGesture, anonymous: this.anonDepth }
  }
}

/**
 * Install the global leak watchdogs. Returns a disposer (used by tests; in the
 * app the listeners live for the session). Guarded for non-browser environments.
 *
 * - `pointerup` / `pointercancel` (capture, window): release that pointer's
 *   gesture — covers lost pointer capture, alt-tab, devtools focus steals.
 * - `blur` (window): release everything — no gesture can outlive the page
 *   losing focus.
 */
export function installHistoryWatchdog<S extends HistorySnapshot>(history: HistoryManager<S>): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {}
  const onPointerEnd = (e: PointerEvent) => {
    history.end(e.pointerId)
  }
  const onBlur = () => {
    history.releaseAllGestures()
  }
  window.addEventListener('pointerup', onPointerEnd, { capture: true })
  window.addEventListener('pointercancel', onPointerEnd, { capture: true })
  window.addEventListener('blur', onBlur)
  return () => {
    window.removeEventListener('pointerup', onPointerEnd, { capture: true })
    window.removeEventListener('pointercancel', onPointerEnd, { capture: true })
    window.removeEventListener('blur', onBlur)
  }
}
