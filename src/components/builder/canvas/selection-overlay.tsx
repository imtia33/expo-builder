'use client'
/*
 * SelectionOverlay — screen-space chrome for the selected node (v3 rework).
 *
 * v2 rendered this overlay INSIDE the pan/zoom transformed layer, dividing
 * every size by zoom so handles/guides kept a constant on-screen size —
 * which also meant the whole overlay rasterized through the (previously
 * will-change-cached) scaled layer: blurry chrome at high zoom. v3 moves it
 * into the unscaled screen-space chrome layer (rendered via a portal from
 * ScreenArtboard, see canvas/chrome-layer.tsx):
 *
 *   - Node rects are still measured in artboard-local dp by useNodeMeasure
 *     (DOM-truth, scroll/transform-safe — unchanged). This component
 *     converts them with the viewport math
 *     `screenPoint = (screen.x + rect.left) * zoom + pan`, and multiplies
 *     sizes by zoom — so the OUTLINE tracks the node at every zoom while
 *     handles, guides, pills and hint text stay constant screen px (crisp
 *     at 25%–400%).
 *   - Guide positions keep the v2 semantics: guides are drawn at the node's
 *     coordinate-container-local positions, interpreted in artboard-local
 *     space (the v2 overlay rendered them at the same effective point).
 *
 * Gesture wiring is unchanged: resize handles still call
 * onHandlePointerDown / handleMoveProps from useNodeEdit — only the DIVS
 * moved (screen space).
 */

import { cn } from '@/lib/utils'
import { useCanvasViewport } from '@/lib/canvas/viewport-store'
import { useProjectStore } from '@/lib/project/store'
import { SELECTION_COLOR, SNAP_COLOR } from '../screens/canvas-constants'
import type { Screen } from '@/lib/project/types'

import { useNodeMeasure } from './measure'
import type { ResizeHandleId, ResizeLive } from './node-edit'
import type { SnapGuides } from './snap'

/** Visual handle size in screen px. */
const HANDLE_DOT_PX = 4
/** Hit area in screen px (larger than the dot for easy grabbing). */
const HANDLE_HIT_PX = 7
/** Selection outline weight in screen px. */
const OUTLINE_PX = 2
/** Guide line weight in screen px. */
const GUIDE_PX = 1
/** Overlay text (chips/pills) in screen px. */
const CHIP_FONT_PX = 10

interface HandleDef {
  id: ResizeHandleId
  x: number
  y: number
  cursor: string
  label: string
}

export interface SelectionOverlayProps {
  /** The owning artboard's screen (canvas origin for the coordinate conversion). */
  screen: Screen
  nodeId: string
  /** Magenta snap guides from the active gesture (move or resize). */
  guides: SnapGuides | null
  /** Live size readout while resizing. */
  resizeLive: ResizeLive | null
  onHandlePointerDown: (e: React.PointerEvent<HTMLDivElement>, handle: ResizeHandleId, nodeId: string) => void
  /** Shared pointermove/up props for handle elements. */
  handleMoveProps: {
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void
  }
}

export function SelectionOverlay({
  screen,
  nodeId,
  guides,
  resizeLive,
  onHandlePointerDown,
  handleMoveProps
}: SelectionOverlayProps) {
  const node = useProjectStore((s) => s.data.nodes[nodeId])
  const rect = useNodeMeasure(screen.id, nodeId)
  /* Viewport subscription: repositions this overlay (a handful of divs) —
   * never re-renders the RNW artboards (separate subtree via the portal). */
  const panX = useCanvasViewport((s) => s.panX)
  const panY = useCanvasViewport((s) => s.panY)
  const zoom = useCanvasViewport((s) => s.zoom)

  if (!node || !rect) return null

  const isAbsolute = node.style.position === 'absolute'
  const editable = isAbsolute && !node.locked
  const hasExplicitHeight = typeof node.style.height === 'number'

  /* Artboard-local dp → screen px (canvasToScreen of the artboard origin +
   * the measured offset, sizes scaled by zoom). */
  const left = (screen.x + rect.left) * zoom + panX
  const top = (screen.y + rect.top) * zoom + panY
  const width = rect.width * zoom
  const height = rect.height * zoom

  const handles: HandleDef[] = []
  if (editable) {
    const cx = left + width / 2
    const cy = top + height / 2
    // Auto-height nodes (e.g. Text) only resize horizontally.
    const push = (id: ResizeHandleId, x: number, y: number, cursor: string, label: string) =>
      handles.push({ id, x, y, cursor, label })
    push('e', left + width, cy, 'ew-resize', 'Resize width')
    push('w', left, cy, 'ew-resize', 'Resize width')
    if (hasExplicitHeight) {
      push('n', cx, top, 'ns-resize', 'Resize height')
      push('s', cx, top + height, 'ns-resize', 'Resize height')
      push('ne', left + width, top, 'nesw-resize', 'Resize')
      push('nw', left, top, 'nwse-resize', 'Resize')
      push('se', left + width, top + height, 'nwse-resize', 'Resize')
      push('sw', left, top + height, 'nesw-resize', 'Resize')
    }
  }

  const hint =
    !isAbsolute && !node.locked
      ? 'Switch to Absolute in Layout to move freely'
      : node.locked
        ? 'Locked — unlock in the Layers panel to edit'
        : null

  const sizeLabel = resizeLive
    ? resizeLive.height === null
      ? `${resizeLive.width}`
      : `${resizeLive.width} × ${resizeLive.height}`
    : null

  /* Guide geometry: container-local dp positions interpreted artboard-local
   * (v2 semantics), converted with the same viewport math as the outline. */
  const guideX = (pos: number) => (screen.x + pos) * zoom + panX
  const guideY = (pos: number) => (screen.y + pos) * zoom + panY
  const guideLeft = (pos: number) => guideX(pos) - GUIDE_PX / 2
  const guideTop = (pos: number) => guideY(pos) - GUIDE_PX / 2
  const guideSpan = (from: number, to: number) => Math.max(GUIDE_PX, (to - from) * zoom)

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* Outline (measured rect) — tracks the node at every zoom. */}
      <div
        className="absolute"
        style={{
          left,
          top,
          width,
          height,
          outline: `${OUTLINE_PX}px solid ${SELECTION_COLOR}`,
          outlineOffset: 0
        }}
      />

      {/* Snap guides — magenta 1px lines spanning moving rect ∪ target. */}
      {guides?.v.map((g, i) => (
        <div
          key={`v${i}`}
          className="absolute"
          style={{
            left: guideLeft(g.pos),
            top: guideY(g.from),
            width: GUIDE_PX,
            height: guideSpan(g.from, g.to),
            background: SNAP_COLOR
          }}
        />
      ))}
      {guides?.h.map((g, i) => (
        <div
          key={`h${i}`}
          className="absolute"
          style={{
            left: guideX(g.from),
            top: guideTop(g.pos),
            height: GUIDE_PX,
            width: guideSpan(g.from, g.to),
            background: SNAP_COLOR
          }}
        />
      ))}

      {/* Resize handles — 4px dots on 7px hit areas, constant on-screen. */}
      {handles.map((h) => (
        <div
          key={h.id}
          role="separator"
          aria-label={h.label}
          className="pointer-events-auto absolute flex items-center justify-center"
          style={{
            left: h.x - HANDLE_HIT_PX / 2,
            top: h.y - HANDLE_HIT_PX / 2,
            width: HANDLE_HIT_PX,
            height: HANDLE_HIT_PX,
            cursor: h.cursor,
            touchAction: 'none'
          }}
          onPointerDown={(e) => onHandlePointerDown(e, h.id, nodeId)}
          {...handleMoveProps}
        >
          <div
            className="rounded-full"
            style={{
              width: HANDLE_DOT_PX,
              height: HANDLE_DOT_PX,
              background: '#fff',
              boxShadow: `0 0 0 1px ${SELECTION_COLOR}`
            }}
          />
        </div>
      ))}

      {/* Flow-positioning hint — one line, above the selection. */}
      {hint && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded"
          style={{
            top: top - 4,
            fontSize: CHIP_FONT_PX,
            lineHeight: 1.2,
            padding: '2px 5px',
            background: 'rgba(30,30,30,0.92)',
            color: '#f0f0f0',
            boxShadow: '0 0 0 1px #3a3a3a'
          }}
        >
          {hint}
        </div>
      )}

      {/* Size pill during resize. */}
      {sizeLabel && (
        <div
          className={cn('absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded')}
          style={{
            top: top + height + 4,
            fontSize: CHIP_FONT_PX,
            lineHeight: 1.2,
            padding: '2px 5px',
            background: 'rgba(30,30,30,0.92)',
            color: '#f0f0f0',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {sizeLabel}
        </div>
      )}
    </div>
  )
}
