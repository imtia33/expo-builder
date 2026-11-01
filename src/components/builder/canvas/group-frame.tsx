'use client'
/*
 * GroupFrames — Figma-Section-style boundary frames for root groups (v3).
 *
 * Rendered inside the screen-space chrome layer (NOT the scaled artboard
 * layer): the frame rectangle is the group's derived canvas bounds
 * (groupBounds = union of the subtree's artboards + GROUP_FRAME_PAD,
 * Phase 0 store helpers) converted with the viewport math
 * `screen = bounds * zoom + pan`, so the border and title stay 1px/constant
 * at every zoom.
 *
 * Interaction contract:
 *   - Only the TITLE chip and thin edge strips along the border are
 *     interactive (pointer-events). The transparent interior is inert so
 *     member artboards stay directly manipulable.
 *   - pointerdown (edit mode, not panning) begins a gesture; each move
 *     applies the REMAINING accumulated delta via moveGroupCanvas (one undo
 *     entry for the whole drag); pointerup without movement selects the
 *     group instead.
 *   - Collapsed groups (ui.expanded[id] === false — the same state the tree
 *     panel uses) render a compact dashed frame; screens stay visible and
 *     editable (RNW content is never hidden).
 *   - In sim mode the frame stays visible but inert (screens are not
 *     draggable while simulating; selection happens in the tree panel).
 */

import { useCallback, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import { useCanvasViewport } from '@/lib/canvas/viewport-store'
import {
  descendantGroupIds,
  groupBounds,
  rootGroups,
  useProjectStore
} from '@/lib/project/store'
import type { ScreenGroup } from '@/lib/project/types'
import { SlotIcon } from '@/components/builder/icons/slots'
import type { IconSlot } from '@/components/builder/icons/slots'

import { isCanvasPanning } from './input-mode'

/** Screen-px movement below which a pointer sequence counts as a click. */
const CLICK_SLOP_PX = 4
/* Visual constants (screen px, Tailwind arbitrary values below): frame
 * corner radius 10, grab-edge thickness 10, edge inset 10 (== radius). */

interface GroupDragState {
  pointerId: number
  startX: number
  startY: number
  /** dp delta already applied to the store (applied = total at last move). */
  appliedX: number
  appliedY: number
  moved: boolean
}

export interface GroupFrameProps {
  group: ScreenGroup
  /** Frame bounds in screen px (groupBounds × viewport). */
  rect: { left: number; top: number; width: number; height: number }
  /** Group/decendant-group/member-screen/nav selection inside the frame. */
  active: boolean
  collapsed: boolean
  simOn: boolean
}

/** One frame: boundary + title chip + grab edges. */
function GroupFrame({ group, rect, active, collapsed, simOn }: GroupFrameProps) {
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  const drag = useRef<GroupDragState | null>(null)
  const groupId = group.id

  /* ── drag / click gesture (title chip + border strips) ─────────────── */

  const onGrabPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || isCanvasPanning()) return
      const store = useProjectStore.getState()
      if (store.sim.on) return
      // One gesture per pointer (leak guard, docs/12 §1.2).
      if (drag.current) return
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      store.beginGesture(e.pointerId)
      drag.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, appliedX: 0, appliedY: 0, moved: false }
      setDragging(true)
    },
    []
  )

  const onGrabPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current
      if (!d || d.pointerId !== e.pointerId) return
      const { zoom } = useCanvasViewport.getState()
      // Apply the REMAINING total delta (accumulated across the gesture) so
      // member screens always track the pointer target, not rounding drift.
      const totalX = (e.clientX - d.startX) / zoom
      const totalY = (e.clientY - d.startY) / zoom
      const incX = totalX - d.appliedX
      const incY = totalY - d.appliedY
      d.appliedX = totalX
      d.appliedY = totalY
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) >= CLICK_SLOP_PX) d.moved = true
      if (incX !== 0 || incY !== 0) useProjectStore.getState().moveGroupCanvas(groupId, incX, incY)
    },
    [groupId]
  )

  const onGrabPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current
      if (!d || d.pointerId !== e.pointerId) return
      drag.current = null
      setDragging(false)
      const store = useProjectStore.getState()
      store.endGesture(e.pointerId)
      // A click (no drag) on title/border selects the group.
      if (!d.moved && e.type === 'pointerup') store.select({ kind: 'group', groupId })
    },
    [groupId]
  )

  /* In sim mode the frame stays visible but fully inert (no handlers, no
   * hover) — screens are not draggable while simulating. */
  const grabProps = simOn
    ? {}
    : {
        onPointerDown: onGrabPointerDown,
        onPointerMove: onGrabPointerMove,
        onPointerUp: onGrabPointerUp,
        onPointerCancel: onGrabPointerUp,
        onPointerEnter: () => setHovered(true),
        onPointerLeave: () => setHovered(false)
      }

  const cursor = simOn ? 'default' : dragging ? 'grabbing' : 'grab'
  const navSlot: IconSlot =
    group.nav.kind === 'tabs' ? 'canvas.group.tabs' : group.nav.kind === 'stack' ? 'canvas.group.stack' : 'canvas.group.none'

  return (
    <div className="absolute" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
      {/* Boundary — subtle rounded rect (radius 10); stronger tint when the
       * frame holds the selection or the pointer is over its grab surfaces. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 rounded-[10px] border',
          collapsed ? 'border-dashed' : '',
          active ? 'border-white/35' : hovered ? 'border-white/25' : 'border-white/10'
        )}
      />

      {/* Grab edges — the border line only (pointer-events-auto: the chrome
       * layer root is none); the transparent interior stays inert so member
       * artboards remain directly manipulable. */}
      <div
        {...grabProps}
        className="pointer-events-auto absolute left-[10px] right-[10px] top-0 h-[10px]"
        style={{ cursor }}
        aria-hidden
      />
      <div
        {...grabProps}
        className="pointer-events-auto absolute bottom-0 left-[10px] right-[10px] h-[10px]"
        style={{ cursor }}
        aria-hidden
      />
      <div
        {...grabProps}
        className="pointer-events-auto absolute bottom-[10px] left-0 top-[10px] w-[10px]"
        style={{ cursor }}
        aria-hidden
      />
      <div
        {...grabProps}
        className="pointer-events-auto absolute bottom-[10px] right-0 top-[10px] w-[10px]"
        style={{ cursor }}
        aria-hidden
      />

      {/* Title chip — group name + nav-kind icon, straddling the top border. */}
      <div
        {...grabProps}
        className={cn(
          'pointer-events-auto absolute -top-[11px] left-[16px] flex select-none items-center gap-1.5 rounded-md bg-canvas px-2 py-[3px] text-[11px] leading-none',
          active || dragging ? 'text-surface' : hovered ? 'text-surface/80' : 'text-muted'
        )}
        style={{ cursor }}
      >
        <SlotIcon slot={navSlot} size={12} aria-hidden className={active || dragging ? 'text-surface' : 'text-muted'} />
        <span className="font-semibold">{group.name}</span>
      </div>
    </div>
  )
}

/**
 * One frame per ROOT group with a non-null derived bounds. Subscribes to
 * the viewport (positions in screen px) and the project store (bounds,
 * selection tint, collapse state, sim) — a handful of divs, never the RNW
 * artboards (they live in the separate scaled layer).
 */
export function GroupFrames() {
  const panX = useCanvasViewport((s) => s.panX)
  const panY = useCanvasViewport((s) => s.panY)
  const zoom = useCanvasViewport((s) => s.zoom)
  const data = useProjectStore((s) => s.data)
  const selection = useProjectStore((s) => s.selection)
  const expanded = useProjectStore((s) => s.ui.expanded)
  const simOn = useProjectStore((s) => s.sim.on)

  return (
    <>
      {rootGroups(data).map((g) => {
        const b = groupBounds(data, g.id)
        if (!b) return null
        // The frame highlights when the selection lives inside it: the group
        // or a descendant group, any of its subtree's screens (screen/node),
        // or its navigator chrome (nav).
        const subtreeIds = new Set([g.id, ...descendantGroupIds(data, g.id)])
        let active = false
        if (selection?.kind === 'group' || selection?.kind === 'nav') {
          active = subtreeIds.has(selection.groupId)
        } else if (selection?.kind === 'screen' || selection?.kind === 'node') {
          active = data.screens.some((s) => s.groupId != null && subtreeIds.has(s.groupId) && s.id === selection.screenId)
        }
        return (
          <GroupFrame
            key={g.id}
            group={g}
            rect={{ left: b.x * zoom + panX, top: b.y * zoom + panY, width: b.width * zoom, height: b.height * zoom }}
            active={active}
            collapsed={expanded[g.id] === false}
            simOn={simOn}
          />
        )
      })}
    </>
  )
}
