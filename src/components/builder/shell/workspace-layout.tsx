'use client'

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { ImperativePanelHandle } from 'react-resizable-panels'
import { AnimatePresence, motion } from 'framer-motion'
import { SlotIcon } from '@/components/builder/icons/slots'
import { tv } from 'tailwind-variants'

import splitterTheme from '@/app/theme/splitter'
import { floatingSurface } from '@/app/theme/overlay'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

import { useBuilderChrome } from './chrome-store'
import { ShortcutKbd } from './keyboard-help'
import {
  DEFAULT_PANEL_SIZES,
  PANEL_LIMITS,
  loadBuilderLayout,
  sameLayout,
  savePanelSizes,
  type PanelSizes
} from './layout-storage'
import { useMotionEnabled } from './use-motion'
import { formatShortcut } from './shortcut-format'

const horizontalSplitter = tv(splitterTheme)({ direction: 'horizontal' })

// Static class sets, computed once at module level (tailwind-variants v4: slots are returned
// by calling the style factory, not read off it).

/** Chrome motion (docs/03-design.md §7): panels show 150ms ease-out, hide 100ms ease-in. */
const CHROME_IN_MS = 0.15
const CHROME_OUT_MS = 0.1
/** How long the panel width transition stays armed after a toggle (150ms + margin). */
const PANEL_MOTION_WINDOW_MS = 210

/** Splitter keyboard step with Shift (§9.1: arrows alone move 1%, Home/End min/max). */
const SHIFT_RESIZE_STEP = 5

const LEFT_HANDLE_ID = 'builder-shell-left-handle'
const RIGHT_HANDLE_ID = 'builder-shell-right-handle'

/**
 * react-resizable-panels exposes drag/hover on `data-resize-handle-state` where reka-ui used
 * `data-state`; the ported splitter theme keeps the reka selectors, so the active states are
 * re-mapped here to keep the accent behavior identical (§2.2).
 */
const RESIZE_STATE_DIVIDER =
  'group-data-[resize-handle-state=drag]:bg-accent group-data-[resize-handle-state=hover]:bg-accent'

function resizeSideBy(panel: ImperativePanelHandle | null, delta: number): void {
  if (!panel) return
  const next = Math.min(
    PANEL_LIMITS.sideMax,
    Math.max(PANEL_LIMITS.sideMin, panel.getSize() + delta)
  )
  panel.resize(next)
}

export interface WorkspaceLayoutProps {
  /** The top bar (TopBar); rendered inside the banner region of the layout. */
  topBar?: ReactNode
  /** Screens + layers panel content, dropped into the left, resizable panel. */
  leftPanel?: ReactNode
  /** The canvas stage; stays mounted across every chrome toggle. */
  canvas?: ReactNode
  /** Inspector content, dropped into the right, resizable panel. */
  rightPanel?: ReactNode
  className?: string
}

/**
 * The builder's full-screen shell (docs/03-design.md §2): a slim top bar (the row
 * is sized by content, so no height is hardcoded here) over a react-resizable-panels
 * group — left panel (default 20%, 10–30%), canvas (flex), right panel (default 20%,
 * 10–30%) — with sizes persisted to localStorage under `expoforge.layout.v1`
 * using open-pencil's tolerance-guarded save (the opening layout report is never re-saved).
 *
 * `$mod+\` hides the chrome (§2.3): the side panels collapse to zero and the top bar animates
 * shut, so the canvas goes full-bleed WITHOUT remounting — panel children keep their state —
 * and a floating "Show UI" pill (open-pencil's WorkspacePill pattern) brings it back.
 */
export function WorkspaceLayout({
  topBar,
  leftPanel,
  canvas,
  rightPanel,
  className
}: WorkspaceLayoutProps) {
  const isMobile = useIsMobile()
  const motionEnabled = useMotionEnabled()
  const uiHidden = useBuilderChrome((state) => state.uiHidden)

  const leftPanelRef = useRef<ImperativePanelHandle>(null)
  const rightPanelRef = useRef<ImperativePanelHandle>(null)
  /** The sizes the panels are meant to have while visible; onLayout diffs against these. */
  const sizesRef = useRef<PanelSizes>(DEFAULT_PANEL_SIZES)
  /** Timestamp until which the panel width transition is armed (chrome toggles only). */
  const motionUntilRef = useRef(0)
  /** Re-render once the motion window closes, so the transition class and `invisible` land. */
  const [, bumpMotionTick] = useReducer((tick: number) => tick + 1, 0)
  /**
   * Until the first frame, the top bar renders without AnimatePresence so a stored hidden
   * state applies instantly, with no exit animation on load.
   */
  const [chromeReady, setChromeReady] = useState(false)

  // --- persistence: open-pencil's saveResizedLayout port (EditorWorkspace.vue) ---
  const handleLayoutChange = useCallback((layout: number[]) => {
    // Collapsed panels report [0, 100, 0]; that is a chrome toggle, not a user resize.
    if (useBuilderChrome.getState().uiHidden) return
    if (layout.length !== 3 || layout.some((size) => !Number.isFinite(size) || size <= 0)) return
    const sizes = layout as PanelSizes
    // The splitter also reports the layout it opens with, which must not be saved.
    if (sameLayout(sizes, sizesRef.current)) return
    sizesRef.current = sizes
    savePanelSizes(sizes)
  }, [])

  // --- restore the stored layout + chrome before the first paint ---
  useLayoutEffect(() => {
    const stored = loadBuilderLayout()
    sizesRef.current = stored.sizes
    if (!sameLayout(stored.sizes, DEFAULT_PANEL_SIZES)) {
      leftPanelRef.current?.resize(stored.sizes[0])
      rightPanelRef.current?.resize(stored.sizes[2])
    }
    useBuilderChrome.getState().hydrate()
    if (stored.uiHidden) {
      leftPanelRef.current?.collapse()
      rightPanelRef.current?.collapse()
    }
    const raf = requestAnimationFrame(() => setChromeReady(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // --- react to $mod+\ toggles: collapse/expand the side panels with the width transition ---
  const prevHiddenRef = useRef(uiHidden)
  useEffect(() => {
    if (prevHiddenRef.current === uiHidden) return
    prevHiddenRef.current = uiHidden
    if (uiHidden) {
      leftPanelRef.current?.collapse()
      rightPanelRef.current?.collapse()
    } else {
      leftPanelRef.current?.expand()
      rightPanelRef.current?.expand()
    }
    // Arm the width transition for the toggle; the re-render that applies the new flexGrow
    // picks it up, and a timer re-renders once more to disarm it and drop hidden panels
    // from the a11y tree.
    motionUntilRef.current = Date.now() + PANEL_MOTION_WINDOW_MS
    const timer = window.setTimeout(bumpMotionTick, PANEL_MOTION_WINDOW_MS)
    return () => window.clearTimeout(timer)
  }, [uiHidden, bumpMotionTick])

  // --- splitter keyboard: Shift+arrows step 5% (§9.1); plain arrows (1%) and Home/End ---
  // --- come from the PanelGroup's own separator behavior (keyboardResizeBy={1}).        ---
  const handleKeyDownCapture = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || !event.shiftKey) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const target = event.target
    if (!(target instanceof HTMLElement) || !target.matches('[data-resize-handle]')) return
    event.preventDefault()
    const handleId = target.getAttribute('data-resize-handle-id')
    if (handleId == null) return
    const step = event.key === 'ArrowRight' ? SHIFT_RESIZE_STEP : -SHIFT_RESIZE_STEP
    if (handleId === LEFT_HANDLE_ID) resizeSideBy(leftPanelRef.current, step)
    else if (handleId === RIGHT_HANDLE_ID) resizeSideBy(rightPanelRef.current, -step)
  }, [])

  if (isMobile) {
    return (
      <div
        className={cn(
          'flex h-dvh w-full items-center justify-center overflow-hidden bg-canvas p-6 text-surface',
          className
        )}
      >
        <div
          className={cn(
            floatingSurface,
            'flex max-w-80 flex-col items-center gap-2 px-6 py-8 text-center'
          )}
        >
          <SlotIcon slot="canvas.wide-notice" className="size-6 text-muted" aria-hidden />
          <p className="text-[13px] font-semibold text-surface">
            ExpoForge needs a wider viewport
          </p>
          <p className="text-[11px] text-muted">
            The builder is a desktop tool. Give it at least 768px — resize the window or open
            it on a larger screen.
          </p>
        </div>
      </div>
    )
  }

  /** Panels stay reachable until their exit width animation has played out, then drop out of
   *  the a11y tree and the tab order entirely (§9.1). */
  const panelMotion = Date.now() < motionUntilRef.current
  const panelsHidden = uiHidden && !panelMotion
  const panelTransition =
    panelMotion && motionEnabled
      ? cn(
          'transition-[flex-grow]',
          uiHidden ? 'duration-100 ease-in' : 'duration-150 ease-out'
        )
      : ''

  const topBarNode = chromeReady ? (
    <AnimatePresence initial={false}>
      {uiHidden ? null : (
        <motion.div
          key="builder-top-bar"
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: 'auto',
            opacity: 1,
            transition: { duration: motionEnabled ? CHROME_IN_MS : 0, ease: 'easeOut' }
          }}
          exit={{
            height: 0,
            opacity: 0,
            transition: { duration: motionEnabled ? CHROME_OUT_MS : 0, ease: 'easeIn' }
          }}
          className="shrink-0 overflow-hidden"
        >
          {topBar}
        </motion.div>
      )}
    </AnimatePresence>
  ) : uiHidden ? null : (
    <div className="shrink-0 overflow-hidden">{topBar}</div>
  )

  return (
    <div
      className={cn(
        'flex h-dvh w-full flex-col overflow-hidden bg-canvas text-surface',
        className
      )}
    >
      {topBarNode}

      {/* The wrapper only exists to intercept Shift+arrows for the splitters (§9.1) in the
          capture phase, before react-resizable-panels' own separator handler runs. */}
      <div className="flex min-h-0 flex-1 flex-col" onKeyDownCapture={handleKeyDownCapture}>
        <PanelGroup
          direction="horizontal"
          id="builder-shell"
          className="min-h-0 flex-1"
          onLayout={handleLayoutChange}
          keyboardResizeBy={1}
        >
        <Panel
          id="screens"
          order={1}
          ref={leftPanelRef}
          defaultSize={DEFAULT_PANEL_SIZES[0]}
          minSize={PANEL_LIMITS.sideMin}
          maxSize={PANEL_LIMITS.sideMax}
          collapsible
          collapsedSize={0}
          style={{ contain: 'paint layout style' }}
          className={cn(
            'flex min-w-0 flex-col overflow-hidden border-r border-border bg-panel',
            panelTransition,
            panelsHidden && 'invisible'
          )}
        >
          <aside aria-label="Screens and layers" className="flex h-full min-w-0 flex-1 flex-col">
            {leftPanel}
          </aside>
        </Panel>

        <PanelResizeHandle
          id={LEFT_HANDLE_ID}
          className={cn(
            horizontalSplitter.handle(),
            panelsHidden && 'invisible'
          )}
        >
          <div className={cn(horizontalSplitter.divider(), RESIZE_STATE_DIVIDER)} />
        </PanelResizeHandle>

        <Panel
          id="canvas"
          order={2}
          defaultSize={DEFAULT_PANEL_SIZES[1]}
          minSize={PANEL_LIMITS.canvasMin}
          className={cn('flex min-w-0 bg-canvas', panelTransition)}
        >
          <div className="relative flex h-full min-w-0 flex-1">
            {canvas}
            <AnimatePresence>
              {uiHidden ? (
                <motion.button
                  key="show-ui-pill"
                  type="button"
                  onClick={() => useBuilderChrome.getState().showUI()}
                  aria-label={`Show interface (${formatShortcut('$mod+\\')})`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    transition: { duration: motionEnabled ? CHROME_IN_MS : 0, ease: 'easeOut' }
                  }}
                  exit={{
                    opacity: 0,
                    x: -8,
                    transition: { duration: motionEnabled ? CHROME_OUT_MS : 0, ease: 'easeIn' }
                  }}
                  className="absolute top-7 left-7 z-10 flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-panel px-2 py-1 shadow-sm transition-colors outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-panel-focus"
                >
                  <SlotIcon slot="canvas.show-ui" className="size-3.5 text-muted" aria-hidden />
                  <span className="text-xs text-surface">Show UI</span>
                  <ShortcutKbd combo="$mod+\\" />
                </motion.button>
              ) : null}
            </AnimatePresence>
          </div>
        </Panel>

        <PanelResizeHandle
          id={RIGHT_HANDLE_ID}
          className={cn(
            horizontalSplitter.handle(),
            panelsHidden && 'invisible'
          )}
        >
          <div className={cn(horizontalSplitter.divider(), RESIZE_STATE_DIVIDER)} />
        </PanelResizeHandle>

        <Panel
          id="inspector"
          order={3}
          ref={rightPanelRef}
          defaultSize={DEFAULT_PANEL_SIZES[2]}
          minSize={PANEL_LIMITS.sideMin}
          maxSize={PANEL_LIMITS.sideMax}
          collapsible
          collapsedSize={0}
          style={{ contain: 'paint layout style' }}
          className={cn(
            'flex min-w-0 flex-col overflow-hidden border-l border-border bg-panel',
            panelTransition,
            panelsHidden && 'invisible'
          )}
        >
          <aside aria-label="Properties" className="flex h-full min-w-0 flex-1 flex-col">
            {rightPanel}
          </aside>
        </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}
