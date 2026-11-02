'use client'
/*
 * Figma-like component placement (insert tools + palette drops).
 *
 * A placement click resolves, in order:
 *   1. the element actually aimed at (see element-at-point.ts — the capture
 *      layer and every edit pane are see-through for this call);
 *   2. the owning artboard — no artboard means the click landed on bare
 *      canvas: a standalone screen is created at the click point (one undo
 *      entry together with the insert) and the component is centered in it;
 *   3. the target container: walking innermost→outward from the hit element,
 *      the nearest node whose registry entry accepts children; none means
 *      the screen root (parentId null, coordinates in the content region);
 *   4. local coordinates in the container's space (getBoundingClientRect of
 *      the container's DOM element, divided by zoom), with the default
 *      insert box centered on the click (clamped inside the container).
 */

import { getEntry } from '@/expoforge/registry'
import { useCanvasViewport } from '@/lib/canvas/viewport-store'
import { useProjectStore } from '@/lib/project/store'
import { deviceById } from '@/components/builder/screens/device-presets'
import { seedListItemTemplate } from './list-insert'

import {
  artboardElementOf,
  contentElementOf,
  elementAtPoint,
  nodeIdOf,
  screenIdOfArtboard
} from './element-at-point'

export interface PlacementOutcome {
  ok: boolean
  /** The screen the component landed in (created or existing). */
  screenId?: string
}

/**
 * Resolve the innermost accepting container for a hit inside an artboard:
 * walking from the hit element outward, the nearest node whose registry
 * entry has `children: 'any'`. A leaf hit falls through to its first
 * container ancestor; no node at all means the screen root.
 */
function resolveContainer(hit: HTMLElement, artboardEl: HTMLElement): { parentId: string | null; el: HTMLElement } {
  const nodes = useProjectStore.getState().data.nodes
  let cur: HTMLElement | null = hit
  while (cur && cur !== artboardEl) {
    const nodeId = nodeIdOf(cur)
    if (nodeId) {
      const node = nodes[nodeId]
      const entry = node ? getEntry(node.type) : undefined
      if (node && entry?.children === 'any') return { parentId: node.id, el: cur }
    }
    cur = cur.parentElement
  }
  const content = contentElementOf(artboardEl)
  return { parentId: null, el: content ?? artboardEl }
}

/** A viewport point in an element's local dp space (plus the element's size). */
function toLocal(el: HTMLElement, clientX: number, clientY: number): { x: number; y: number; width: number; height: number } {
  const zoom = useCanvasViewport.getState().zoom
  const rect = el.getBoundingClientRect()
  return {
    x: (clientX - rect.left) / zoom,
    y: (clientY - rect.top) / zoom,
    width: rect.width / zoom,
    height: rect.height / zoom
  }
}

/** What the placement path needs to know about the inserted component. */
export interface PlaceComponentSpec {
  type: string
  /** Implementation variant (Phase 2: view → 'safe-area', button impls). */
  impl?: string
  /** Insert-time prop overrides (Phase 2 list forms: horizontal, grid…). */
  props?: Record<string, unknown>
}

/**
 * Place one component at a viewport point. `canvasPoint` is the click in
 * canvas space (used when a NEW screen must be created on bare canvas).
 * Returns whether an insert happened; selection + activeScreen are set by
 * the store's insertNode.
 */
export function placeComponent(
  spec: PlaceComponentSpec,
  clientX: number,
  clientY: number,
  canvasPoint: { x: number; y: number }
): PlacementOutcome {
  const store = useProjectStore.getState()
  if (store.sim.on) return { ok: false }

  const entry = getEntry(spec.type)
  if (!entry) {
    console.warn(`[canvas] cannot place unknown component type: ${spec.type}`)
    return { ok: false }
  }

  const hit = elementAtPoint(clientX, clientY)
  const artboardEl = artboardElementOf(hit)
  if (!artboardEl || !hit) {
    // Bare canvas: create a standalone screen + centered component as ONE undo entry.
    store.beginGesture()
    try {
      const screenId = store.addScreen({ at: canvasPoint })
      const created = useProjectStore.getState().data.screens.find((s) => s.id === screenId)
      const device = deviceById(created?.deviceId ?? store.ui.lastDeviceId)
      const w = entry.insert.width
      const h = entry.insert.height
      const listId = store.insertNode({
        screenId,
        type: spec.type,
        impl: spec.impl,
        props: spec.props,
        parentId: null,
        rect: {
          left: Math.max(0, Math.round((device.width - w) / 2)),
          top: Math.max(0, Math.round((device.height - (h ?? 0)) / 2)),
          width: w,
          height: h
        }
      })
      seedListItemTemplate(listId)
      return { ok: true, screenId }
    } finally {
      store.endGesture()
    }
  }

  const screenId = screenIdOfArtboard(artboardEl)
  const container = resolveContainer(hit, artboardEl)
  const local = toLocal(container.el, clientX, clientY)
  const w = entry.insert.width
  const h = entry.insert.height
  const left = clamp(local.x - w / 2, 0, Math.max(0, local.width - w))
  const top = h === undefined ? Math.max(0, local.y) : clamp(local.y - h / 2, 0, Math.max(0, local.height - h))

  // One gesture: the insert + any list-template seeding (Phase 2) land as ONE
  // undo entry; a single-commit gesture is identical to before (no change in
  // undo granularity for plain components).
  store.beginGesture()
  let nodeId: string
  try {
    nodeId = store.insertNode({
      screenId,
      type: spec.type,
      impl: spec.impl,
      props: spec.props,
      parentId: container.parentId,
      rect: { left: Math.round(left), top: Math.round(top), width: w, height: h }
    })
    seedListItemTemplate(nodeId)
  } finally {
    store.endGesture()
  }
  return { ok: true, screenId }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
