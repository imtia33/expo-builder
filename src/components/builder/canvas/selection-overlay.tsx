'use client'

/*
 * SelectionOverlay — screen-space chrome for the selected node (v3 rework),
 * Phase-1 alignment with open-pencil's canvas chrome values (§7 of the study,
 * packages/core/src/constants.ts):
 *
 *   - outline: 1px screen-px #3B82F6 (SELECTION_COLOR, stroke 1/zoom in Skia)
 *   - handles: 6×6px WHITE-FILLED SQUARES stroked 1px in the selection color
 *     at the 4 edges + 4 corners (HANDLE_HALF_SIZE = 3); hit radius ~8px here
 *     (open-pencil uses 6 — DOM hit areas are padded for comfortable grabbing)
 *   - size pill: 18px tall, radius 4px, 6px x-padding, filled selection color,
 *     white 10px text (SIZE_* constants), under the selection while resizing
 *   - position pill (move): same pill above the selection while dragging
 *   - hover outline (NodeHoverOutline): 1px selection-color rect, no handles
 *
 * v3 architecture note (unchanged): node rects are measured in artboard-local
 * dp by useNodeMeasure (DOM-truth, scroll/transform-safe). This component
 * converts them with `screenPoint = (screen.x + rect.left) * zoom + pan` and
 * multiplies sizes by zoom — the OUTLINE tracks the node at every zoom while
 * handles, guides, pills stay constant screen px (crisp at 25%–400%).
 *
 * No rotation handle: the data model has no transform rotation (RN layouts in
 * the reference apps don't rotate containers), so the 24px-above rotation
 * stalk from open-pencil is intentionally not ported.
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

/** Visual handle size in screen px (open-pencil HANDLE_HALF_SIZE = 3 → 6×6). */
const HANDLE_SQUARE_PX = 6
/** Hit area in screen px (larger than the square for easy grabbing). */
const HANDLE_HIT_PX = 8
/** Selection outline weight in screen px (open-pencil: 1px screen stroke). */
const OUTLINE_PX = 1
/** Guide line weight in screen px. */
const GUIDE_PX = 1
/** Overlay text (chips/pills) in screen px (open-pencil SIZE text = 10px). */
const CHIP_FONT_PX = 10
/** open-pencil size pill: 18px tall, radius 4, 6px x-padding, accent fill. */
const PILL_HEIGHT_PX = 18
const PILL_RADIUS_PX = 4
const PILL_PADDING_X_PX = 6

/** Shared pill chrome (size + position readouts) — open-pencil SIZE_* style. */
function measurePillStyle(): React.CSSProperties {
  return {
    height: PILL_HEIGHT_PX,
    padding: `0 ${PILL_PADDING_X_PX}px`,
    borderRadius: PILL_RADIUS_PX,
    background: SELECTION_COLOR,
    color: '#fff',
    fontSize: CHIP_FONT_PX,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums'
  }
}

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
  /** Live position readout while moving (dp, artboard-local). */
  moveLive: { left: number; top: number } | null
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
  moveLive,
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
  const positionLabel = moveLive ? `${moveLive.left}, ${moveLive.top}` : null

  /* Guide geometry: container-local dp positions interpreted artboard-local
   * (v2 semantics), converted with the same viewport math as the outline. */
  const guideX = (pos: number) => (screen.x + pos) * zoom + panX
  const guideY = (pos: number) => (screen.y + pos) * zoom + panY
  const guideLeft = (pos: number) => guideX(pos) - GUIDE_PX / 2
  const guideTop = (pos: number) => guideY(pos) - GUIDE_PX / 2
  const guideSpan = (from: number, to: number) => Math.max(GUIDE_PX, (to - from) * zoom)

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* Outline (measured rect) — 1px screen stroke, tracks the node at every zoom. */}
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

      {/* Resize handles — 6×6px white squares, 1px selection stroke,
          constant on-screen (open-pencil drawHandle). */}
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
            className="rounded-[1px]"
            style={{
              width: HANDLE_SQUARE_PX,
              height: HANDLE_SQUARE_PX,
              background: '#fff',
              boxShadow: `0 0 0 ${OUTLINE_PX}px ${SELECTION_COLOR}`
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

      {/* Position pill during move (open-pencil shows x,y while dragging). */}
      {positionLabel && !hint && (
        <div
          className="absolute left-1/2 flex -translate-x-1/2 -translate-y-full items-center whitespace-nowrap"
          style={{ top: top - 6, ...measurePillStyle() }}
        >
          {positionLabel}
        </div>
      )}

      {/* Size pill during resize — accent-filled, white 10px text (open-pencil SIZE_*). */}
      {sizeLabel && (
        <div
          className={cn('absolute left-1/2 flex -translate-x-1/2 items-center whitespace-nowrap')}
          style={{ top: top + height + 6, ...measurePillStyle() }}
        >
          {sizeLabel}
        </div>
      )}
    </div>
  )
}

/* ── hover outline ──────────────────────────────────────────────────────── */

/**
 * 1px selection-color outline over the node currently hovered on the canvas
 * (open-pencil hover outline). Rendered per artboard in edit mode, never for
 * the already-selected node (the SelectionOverlay owns that rect).
 */
export function NodeHoverOutline({ screen, nodeId }: { screen: Screen; nodeId: string }) {
  const rect = useNodeMeasure(screen.id, nodeId)
  const panX = useCanvasViewport((s) => s.panX)
  const panY = useCanvasViewport((s) => s.panY)
  const zoom = useCanvasViewport((s) => s.zoom)

  if (!rect) return null
  const left = (screen.x + rect.left) * zoom + panX
  const top = (screen.y + rect.top) * zoom + panY

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left,
        top,
        width: rect.width * zoom,
        height: rect.height * zoom,
        outline: `${OUTLINE_PX}px solid ${SELECTION_COLOR}`,
        outlineOffset: 0
      }}
    />
  )
}
