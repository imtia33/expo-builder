'use client'
/*
 * Project bounds for zoom commands (Shift+1 zoom-to-fit, ⌘1 etc.) — reading
 * the project store. v3: bounds ENCOMPASS GROUP FRAMES — every root group
 * with a derived bounds contributes its frame rect (groupBounds = union of
 * the subtree's artboards + GROUP_FRAME_PAD, which already covers the label
 * margin); screens NOT covered by a group frame (standalone screens, and
 * screens of groups whose frame has no bounds) contribute their artboard
 * rect including the label-row margin above the frame.
 */

import type { CanvasBounds } from '@/lib/canvas/viewport-store'
import { descendantGroupIds, groupBounds, rootGroups, useProjectStore } from '@/lib/project/store'
import type { ProjectData, Screen } from '@/lib/project/types'

import { deviceById } from './device-presets'

/** Label row height above each frame (canvas units) — standalone screens only. */
const LABEL_MARGIN = 28

/** The ROOT group id of `groupId` (walking parentId up), or null. */
function rootGroupIdOf(data: ProjectData, groupId: string | null): string | null {
  let cur = groupId
  while (cur) {
    const g = data.groups.find((x) => x.id === cur)
    if (!g) return null
    if (g.parentId === null) return g.id
    cur = g.parentId
  }
  return null
}

/** Extend an accumulator rect with `r` (null-safe). */
function extend(acc: CanvasBounds | null, r: CanvasBounds): CanvasBounds {
  if (!acc) return { ...r }
  const maxX = Math.max(acc.x + acc.width, r.x + r.width)
  const maxY = Math.max(acc.y + acc.height, r.y + r.height)
  return {
    x: Math.min(acc.x, r.x),
    y: Math.min(acc.y, r.y),
    width: maxX - Math.min(acc.x, r.x),
    height: maxY - Math.min(acc.y, r.y)
  }
}

/** One screen's artboard rect, including the label-row margin (canvas units). */
function screenRectWithMargin(sc: Screen): CanvasBounds {
  const d = deviceById(sc.deviceId)
  return { x: sc.x, y: sc.y - LABEL_MARGIN, width: d.width, height: d.height + LABEL_MARGIN }
}

/** True when `sc` is covered by the root group frame `rootId`'s bounds. */
function coveredByFrame(data: ProjectData, sc: Screen, rootId: string): boolean {
  if (sc.groupId == null) return false
  return sc.groupId === rootId || descendantGroupIds(data, rootId).includes(sc.groupId)
}

export function projectBoundsAll(): CanvasBounds | null {
  const { data } = useProjectStore.getState()
  if (data.screens.length === 0) return null

  let acc: CanvasBounds | null = null
  // Root group frames first; remember the screens they already cover.
  const covered = new Set<string>()
  for (const g of rootGroups(data)) {
    const frame = groupBounds(data, g.id)
    if (!frame) continue
    acc = extend(acc, frame)
    for (const sc of data.screens) {
      if (coveredByFrame(data, sc, g.id)) covered.add(sc.id)
    }
  }
  // Screens outside every frame: standalone artboards with label margin.
  for (const sc of data.screens) {
    if (covered.has(sc.id)) continue
    acc = extend(acc, screenRectWithMargin(sc))
  }
  return acc
}

export function projectBoundsActive(): CanvasBounds | null {
  const { data, activeScreenId } = useProjectStore.getState()
  const sc = data.screens.find((s) => s.id === activeScreenId)
  if (!sc) return null
  // Active screen inside a group → fit the whole (root) group frame.
  const rootId = rootGroupIdOf(data, sc.groupId)
  if (rootId) {
    const frame = groupBounds(data, rootId)
    if (frame) return frame
  }
  return screenRectWithMargin(sc)
}
