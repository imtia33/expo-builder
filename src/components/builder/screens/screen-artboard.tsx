'use client'
/*
 * ScreenArtboard — one artboard on the infinite canvas (v3 rework).
 *
 * Structure, top→bottom:
 *   frame       — device chrome (status bar, notch/punch, home indicator) around
 *                 the content region; still the fallback drag surface
 *   content     — [safe-area top inset] → optional top tab bar (+ nav strip)
 *                 → optional stack header (+ nav strip) → live RNW tree
 *                 (ScreenTreePreview, flex:1) → optional bottom tab bar
 *                 (+ nav strip) → [safe-area bottom inset]; screen background
 *                 on the region
 *
 * Chrome placement (v3): everything CONSTANT-SIZE lives in the screen-space
 * chrome layer (canvas/chrome-layer.tsx), rendered from here through a
 * React portal (`chromeTarget`, provided by CanvasHost):
 *   - the label row (name · device · platform chip · SIM chip) — crisp
 *     11px text at every zoom; also the drag handle (edit mode);
 *   - the selection overlay (outline/handles/guides/pills) — keeps its
 *     useNodeEdit wiring (guides, resizeLive, handle callbacks).
 * The group chip was removed — group identity lives on the group frame
 * (canvas/group-frame.tsx). The DOM/scene-graph artboard itself stays in
 * the scaled ViewportLayer and is wrapped in React.memo: it re-renders only
 * when its `screen` object identity changes (or its own store slices), so
 * pan/zoom (and other screens' mutations) never re-render the RNW tree.
 *
 * Edit mode (sim off): a transparent edit pane (data-canvas-hit-through)
 * sits above the content — clicks resolve through elementAtPoint to select
 * nodes, drags move absolute nodes, double-click drills into the parent.
 * Navigator chrome (tab bar / stack header areas) is selectable via
 * transparent overlay strips ABOVE the pane (pointerdown → select
 * {kind:'nav'} + setActiveScreen; hover shows a 1px accent outline).
 * Sim mode (sim on): no pane, no strips — the RNW tree, tab bar and header
 * back button are live; screen swaps crossfade (150ms, reduced-motion
 * aware); screens are not draggable.
 */

import { memo, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { cn } from '@/lib/utils'
import { useCanvasViewport } from '@/lib/canvas/viewport-store'
import { simShownScreen, useProjectStore } from '@/lib/project/store'
import { ScreenTreePreview, StackHeaderPreview, TabBarPreview } from '@/expoforge/preview'
import { SlotIcon } from '@/components/builder/icons/slots'
import type { Screen } from '@/lib/project/types'

import { isCanvasPanning } from '../canvas/input-mode'
import { InlineTextEditor } from '../canvas/inline-text-edit'
import { useNodeEdit } from '../canvas/node-edit'
import { SelectionOverlay } from '../canvas/selection-overlay'
import { SELECTION_COLOR } from './canvas-constants'
import { deviceById, type DevicePreset, type PlatformId } from './device-presets'

export interface ScreenArtboardProps {
  screen: Screen
  /** Screen-space chrome portal target (CanvasHost's ChromeLayer). When
   *  absent (first paint) the artboard renders without portal chrome. */
  chromeTarget?: HTMLDivElement | null
}

/** Label-row gap above the frame, in SCREEN px — constant at every zoom. */
const LABEL_GAP_PX = 22

/* ── device chrome ──────────────────────────────────────────────────────── */

function StatusBar({ preset, platform }: { preset: DevicePreset; platform: 'ios' | 'android' }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-[5] flex items-center justify-between px-6 text-[11px] font-semibold select-none',
        platform === 'ios' ? 'text-black/85' : 'text-black/80'
      )}
      style={{ height: preset.statusBar }}
    >
      <span className="tabular-nums">9:41</span>
      <span className="flex items-center gap-1.5">
        <SlotIcon slot="statusbar.signal" size={11} aria-hidden />
        <SlotIcon slot="statusbar.wifi" size={11} aria-hidden />
        <SlotIcon slot="statusbar.battery" size={11} aria-hidden />
      </span>
    </div>
  )
}

/* ── label chips (rendered in the screen-space chrome layer) ────────────── */

function PlatformChip({ platform }: { platform: 'ios' | 'android' }) {
  return (
    <span
      className={cn(
        'rounded px-1 text-[9px] uppercase tracking-wide',
        platform === 'ios' ? 'bg-surface/10 text-surface' : 'bg-component/20 text-component'
      )}
    >
      {platform}
    </span>
  )
}

/**
 * The artboard's label row — name · device · platform chip · SIM chip —
 * rendered through a portal into the screen-space chrome layer (unscaled:
 * 11px text at every zoom). Also the primary drag handle (edit mode); the
 * handlers are the artboard's shared surface-drag callbacks.
 */
function ArtboardLabelRow({
  target,
  screen,
  preset,
  platform,
  highlighted,
  simOn,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: {
  target: HTMLDivElement
  screen: Screen
  preset: DevicePreset
  platform: PlatformId
  highlighted: boolean
  simOn: boolean
  onPointerDown: React.PointerEventHandler<HTMLElement>
  onPointerMove: React.PointerEventHandler<HTMLElement>
  onPointerUp: React.PointerEventHandler<HTMLElement>
}) {
  /* Viewport subscription repositions the row (a handful of divs) — the
   * RNW artboard is a separate subtree and never re-renders for pan/zoom. */
  const panX = useCanvasViewport((s) => s.panX)
  const panY = useCanvasViewport((s) => s.panY)
  const zoom = useCanvasViewport((s) => s.zoom)

  return createPortal(
    <div
      className={cn(
        'pointer-events-auto absolute flex select-none items-center gap-2 whitespace-nowrap text-[11px]',
        highlighted ? 'text-surface' : 'text-muted'
      )}
      style={{
        left: screen.x * zoom + panX,
        top: screen.y * zoom + panY - LABEL_GAP_PX,
        cursor: simOn ? 'default' : 'grab'
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className="font-semibold">{screen.name}</span>
      <span className="text-muted">
        {preset.label} · {preset.width}×{preset.height}
      </span>
      <PlatformChip platform={platform} />
      {simOn && (
        <span className="flex items-center gap-1 rounded-full bg-accent px-1.5 py-[1px] text-[9px] font-semibold tracking-wide text-on-accent">
          <span aria-hidden className="size-1 rounded-full bg-white/90 motion-safe:animate-pulse" />
          SIM
        </span>
      )}
    </div>,
    target
  )
}

/* ── navigator chrome selection strips (edit mode) ──────────────────────── */

/**
 * Transparent strip over one navigator-chrome area (tab bar / stack header)
 * rendered wherever TabBarPreview / StackHeaderPreview render, ABOVE the
 * edit pane. Hover shows a 1px accent outline + pointer cursor; pointerdown
 * selects {kind:'nav'} and activates the screen. Never rendered in sim mode
 * (chrome is live there).
 */
function NavChromeStrip({ onPointerDown }: { onPointerDown: React.PointerEventHandler<HTMLDivElement> }) {
  return (
    <div
      className="absolute inset-0 z-20 cursor-pointer hover:shadow-[inset_0_0_0_1px_var(--color-accent)]"
      // pointerEvents:'auto' is REQUIRED: the tab-bar/header wrapper is
      // pointer-events:none in edit mode (the preview itself must not grab
      // hits), and without the explicit override this strip would inherit
      // it and never receive the selecting pointerdown.
      style={{ touchAction: 'none', pointerEvents: 'auto' }}
      onPointerDown={onPointerDown}
    />
  )
}

/* ── artboard ───────────────────────────────────────────────────────────── */

/**
 * One live artboard. memo'd: re-renders only when its `screen` object
 * identity changes (store mutations replace only the touched screen) or one
 * of its own store slices fires — pan/zoom and parent re-renders never do.
 */
export const ScreenArtboard = memo(function ScreenArtboard({ screen, chromeTarget = null }: ScreenArtboardProps) {
  const preset = deviceById(screen.deviceId)
  const rootRef = useRef<HTMLDivElement>(null)

  /* store reads */
  const nodes = useProjectStore((s) => s.data.nodes)
  const group = useProjectStore((s) => (screen.groupId ? (s.data.groups.find((g) => g.id === screen.groupId) ?? null) : null))
  const sim = useProjectStore((s) => s.sim)
  const selection = useProjectStore((s) => s.selection)
  const activeScreenId = useProjectStore((s) => s.activeScreenId)
  /* THE editor-global platform — artboard chrome + preview rendering follow it. */
  const platform = useProjectStore((s) => s.ui.platform) as PlatformId
  const hasNodes = useProjectStore((s) => {
    for (const id in s.data.nodes) if (s.data.nodes[id].screenId === screen.id) return true
    return false
  })
  const shownScreen = useProjectStore((s) => {
    if (!s.sim.on) return screen
    const shown = simShownScreen(s.sim, screen.id)
    return shown === screen.id ? screen : (s.data.screens.find((x) => x.id === shown) ?? screen)
  })

  const simOn = sim.on
  const selectedNodeId = selection?.kind === 'node' && selection.screenId === screen.id ? selection.nodeId : null
  const highlighted = activeScreenId === screen.id || (selection?.kind === 'screen' && selection.screenId === screen.id)
  const reducedMotion = useReducedMotion()

  const stackConfig = group?.nav.kind === 'stack' ? group.nav.stack : null
  const tabsConfig = group?.nav.kind === 'tabs' ? group.nav.tabs : null
  const tabsOnTop = tabsConfig?.position === 'top'

  /* ── node edit interactions (edit pane + portaled overlay) ── */
  const nodeEdit = useNodeEdit({
    screenId: screen.id,
    artboardRef: rootRef,
    panActive: isCanvasPanning
  })

  /* ── screen drag (label row / frame chrome; never in sim) ── */
  const screenDrag = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null)

  const onSurfacePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || simOnRef() || isCanvasPanning()) return
      const store = useProjectStore.getState()
      store.select({ kind: 'screen', screenId: screen.id })
      store.setActiveScreen(screen.id)
      // One gesture per pointer; a palm/stylus second press during an active
      // screen drag must never stack gestures (leak → swallowed history).
      if (screenDrag.current) return
      store.beginGesture(e.pointerId)
      screenDrag.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        baseX: screen.x,
        baseY: screen.y
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [screen.id, screen.x, screen.y]
  )

  const onSurfacePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const d = screenDrag.current
      if (!d || d.pointerId !== e.pointerId) return
      const { zoom } = useCanvasViewport.getState()
      useProjectStore
        .getState()
        .moveScreenCanvas(screen.id, d.baseX + (e.clientX - d.startX) / zoom, d.baseY + (e.clientY - d.startY) / zoom)
    },
    [screen.id]
  )

  const onSurfacePointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (screenDrag.current?.pointerId !== e.pointerId) return
    screenDrag.current = null
    useProjectStore.getState().endGesture(e.pointerId)
  }, [])

  /* ── navigator chrome selection (edit mode strips) ── */
  const onNavStripPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, part: 'tabbar' | 'header') => {
      if (e.button !== 0 || simOnRef() || isCanvasPanning()) return
      const groupId = screen.groupId
      if (!groupId) return
      // Own the click like the edit pane does: never let it reach the frame's
      // screen-drag surface or the canvas-root click bookkeeping below.
      e.stopPropagation()
      const store = useProjectStore.getState()
      store.select({ kind: 'nav', groupId, part })
      store.setActiveScreen(screen.id)
    },
    [screen.id, screen.groupId]
  )

  /* sim wiring (stable callbacks) */
  const simNavigate = useProjectStore((s) => s.simNavigate)
  const simBack = useProjectStore((s) => s.simBack)
  const onTabSelect = useCallback(
    (target: string) => {
      if (useProjectStore.getState().sim.on) simNavigate(screen.id, target, 'replace')
    },
    [screen.id, simNavigate]
  )
  const onHeaderBack = useCallback(() => {
    if (useProjectStore.getState().sim.on) simBack(screen.id)
  }, [screen.id, simBack])

  const frameShadow = useMemo(() => {
    if (simOn) return `0 0 0 2px var(--color-accent), 0 12px 32px rgb(0 0 0 / 0.45)`
    if (selectedNodeId) return '0 1px 0 0 rgb(0 0 0 / 0.4), 0 12px 32px rgb(0 0 0 / 0.35)'
    if (highlighted) return `0 0 0 2px ${SELECTION_COLOR}, 0 12px 32px rgb(0 0 0 / 0.45)`
    return '0 1px 0 0 rgb(0 0 0 / 0.4), 0 12px 32px rgb(0 0 0 / 0.35)'
  }, [simOn, selectedNodeId, highlighted])

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`${screen.name} artboard, ${preset.label}, ${platform}`}
      className="absolute select-none"
      style={{ left: screen.x, top: screen.y, width: preset.width, height: preset.height }}
      data-screen-artboard={screen.id}
    >
      {/* Device frame */}
      <div
        className="relative h-full w-full overflow-hidden bg-white outline-none transition-shadow duration-100"
        style={{ borderRadius: preset.radius, boxShadow: frameShadow }}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onSurfacePointerMove}
        onPointerUp={onSurfacePointerUp}
        onPointerCancel={onSurfacePointerUp}
      >
        {/* Content region: insets → nav chrome (+ strips) → RNW tree → nav chrome → insets. */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden"
          style={{ borderRadius: preset.radius, background: screen.background }}
        >
          {screen.safeArea.top && <div aria-hidden className="flex-none" style={{ height: preset.statusBar }} />}

          {tabsConfig && tabsOnTop && (
            <div className="relative flex-none" style={{ pointerEvents: simOn ? undefined : 'none' }}>
              <TabBarPreview config={tabsConfig} platform={platform} activeScreenId={shownScreen.id} onSelect={onTabSelect} />
              {!simOn && <NavChromeStrip onPointerDown={(e) => onNavStripPointerDown(e, 'tabbar')} />}
            </div>
          )}

          {stackConfig?.headerShown && (
            <div className="relative flex-none">
              <StackHeaderPreview config={stackConfig} platform={platform} title={shownScreen.name} onBack={onHeaderBack} />
              {!simOn && <NavChromeStrip onPointerDown={(e) => onNavStripPointerDown(e, 'header')} />}
            </div>
          )}

          {/* Live RNW tree — root nodes position inside this wrapper. */}
          <div className="relative min-h-0 flex-1" data-screen-content={screen.id}>
            <AnimatePresence initial={false}>
              <motion.div
                key={shownScreen.id}
                className="absolute inset-0 flex"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.15 }}
              >
                <ScreenTreePreview screen={shownScreen} nodes={nodes} platform={platform} />
              </motion.div>
            </AnimatePresence>

            {!simOn && !hasNodes && (
              <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center p-3">
                <p className="max-w-[80%] text-center text-[12px] leading-relaxed text-black/25">
                  Select a tool below, then click to place
                </p>
              </div>
            )}
          </div>

          {tabsConfig && !tabsOnTop && (
            <div className="relative flex-none" style={{ pointerEvents: simOn ? undefined : 'none' }}>
              <TabBarPreview config={tabsConfig} platform={platform} activeScreenId={shownScreen.id} onSelect={onTabSelect} />
              {!simOn && <NavChromeStrip onPointerDown={(e) => onNavStripPointerDown(e, 'tabbar')} />}
            </div>
          )}

          {screen.safeArea.bottom && <div aria-hidden className="flex-none" style={{ height: preset.bottomBar }} />}
        </div>

        {/* Platform chrome (decorative, above content, below the edit pane). */}
        <StatusBar preset={preset} platform={platform} />
        {preset.notch === 'island' && platform === 'ios' && (
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-[11px] z-[5] h-[34px] w-[120px] -translate-x-1/2 rounded-full bg-black" />
        )}
        {preset.notch === 'punch' && platform === 'android' && (
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-[10px] z-[5] size-[12px] -translate-x-1/2 rounded-full bg-black" />
        )}
        {preset.notch === 'bezel' && platform === 'ios' && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] flex justify-center pb-[6px]">
            <div className="h-[5px] w-[120px] rounded-full bg-black" />
          </div>
        )}
        {platform === 'android' && preset.bottomBar > 0 && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] flex justify-center pb-[10px]">
            <div className="h-[4px] w-[96px] rounded-full bg-black/40" />
          </div>
        )}
        {platform === 'ios' && preset.bottomBar >= 34 && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] flex justify-center pb-[8px]">
            <div className="h-[5px] w-[140px] rounded-full bg-black/80" />
          </div>
        )}

        {/* Edit pane — transparent hit layer over the content region (edit mode). */}
        {!simOn && (
          <div
            {...nodeEdit.paneProps}
            data-canvas-hit-through
            className="absolute inset-0 z-10 cursor-default"
            style={{ touchAction: 'none' }}
          />
        )}
      </div>

      {/* ── screen-space chrome (portaled into ChromeLayer) ── */}
      {chromeTarget && (
        <ArtboardLabelRow
          target={chromeTarget}
          screen={screen}
          preset={preset}
          platform={platform}
          highlighted={highlighted}
          simOn={simOn}
          onPointerDown={onSurfacePointerDown}
          onPointerMove={onSurfacePointerMove}
          onPointerUp={onSurfacePointerUp}
        />
      )}
      {chromeTarget && !simOn && selectedNodeId
        ? createPortal(
            <SelectionOverlay
              screen={screen}
              nodeId={selectedNodeId}
              guides={nodeEdit.guides}
              resizeLive={nodeEdit.resizeLive}
              onHandlePointerDown={nodeEdit.onHandlePointerDown}
              handleMoveProps={nodeEdit.handleMoveProps}
            />,
            chromeTarget
          )
        : null}
      {chromeTarget && !simOn && nodeEdit.editing && nodeEdit.editing.screenId === screen.id ? (
        createPortal(
          <InlineTextEditor
            screen={screen}
            nodeId={nodeEdit.editing.nodeId}
            onClose={() => nodeEdit.setEditing(null)}
          />,
          chromeTarget
        )
      ) : null}
    </div>
  )
})

/** Read sim.on inside pointer handlers without a re-render dependency. */
function simOnRef(): boolean {
  return useProjectStore.getState().sim.on
}
