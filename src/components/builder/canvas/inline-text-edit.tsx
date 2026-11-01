'use client'

/*
 * InlineTextEditor — canvas text editing for text-content nodes (spec §4).
 *
 * Double-clicking a text node opens this overlay: a contentEditable div
 * positioned exactly over the rendered node (screen-space chrome layer, same
 * viewport math as SelectionOverlay) with the RNW node's computed typography
 * mirrored (sizes scaled by zoom). While the session is open the underlying
 * RNW text is hidden so the two never double-render.
 *
 * Interaction contract (spec §4):
 *   - Enter edit mode without moving the element (no drag starts).
 *   - Native caret + word/character selection via contentEditable.
 *   - Escape cancels the edit (original text restored, no history entry).
 *   - Clicking outside (blur) or Enter commits — exactly ONE history entry
 *     per session (a single setNodeProps outside any gesture).
 *   - Text selection is DOM-native and independent of canvas selection.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { getEntry } from '@/expoforge/registry'
import { useCanvasViewport } from '@/lib/canvas/viewport-store'
import { useProjectStore } from '@/lib/project/store'
import type { Screen } from '@/lib/project/types'

import { ARTBOARD_ATTR, nodeSelector } from './element-at-point'
import { useNodeMeasure } from './measure'

/** CSS props mirrored from the rendered RNW text onto the editor. */
interface MirroredTypography {
  fontFamily: string
  fontSizePx: number
  fontWeight: string
  lineHeightPx: number | null
  letterSpacingPx: number | null
  color: string
  textAlign: string
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"')
}

/** Read the rendered node's typography (layout px ≈ dp; transform-independent). */
function mirrorTypography(screenId: string, nodeId: string): MirroredTypography | null {
  const artboard = document.querySelector<HTMLElement>(`[${ARTBOARD_ATTR}="${cssEscape(screenId)}"]`)
  const nodeEl = artboard?.querySelector<HTMLElement>(nodeSelector(nodeId))
  if (!nodeEl || typeof getComputedStyle !== 'function') return null
  const cs = getComputedStyle(nodeEl)
  const lh = cs.lineHeight.endsWith('px') ? parseFloat(cs.lineHeight) : null
  const ls = cs.letterSpacing.endsWith('px') ? parseFloat(cs.letterSpacing) : null
  return {
    fontFamily: cs.fontFamily,
    fontSizePx: parseFloat(cs.fontSize) || 14,
    fontWeight: cs.fontWeight,
    lineHeightPx: Number.isFinite(lh) ? lh : null,
    letterSpacingPx: Number.isFinite(ls) && ls !== 0 ? ls : null,
    color: cs.color,
    textAlign: cs.textAlign === 'start' || cs.textAlign === '-webkit-auto' ? 'left' : cs.textAlign
  }
}

export interface InlineTextEditorProps {
  screen: Screen
  nodeId: string
  /** Close the session (after commit or cancel). */
  onClose: () => void
}

export function InlineTextEditor({ screen, nodeId, onClose }: InlineTextEditorProps) {
  const node = useProjectStore((s) => s.data.nodes[nodeId])
  const setNodeProps = useProjectStore((s) => s.setNodeProps)
  const rect = useNodeMeasure(screen.id, nodeId)
  const panX = useCanvasViewport((s) => s.panX)
  const panY = useCanvasViewport((s) => s.panY)
  const zoom = useCanvasViewport((s) => s.zoom)
  const editorRef = useRef<HTMLDivElement>(null)
  const [typo, setTypo] = useState<MirroredTypography | null>(null)
  const closedRef = useRef(false)

  /* The registry 'text' field this node edits (JSX children, e.g. content). */
  const entry = node ? getEntry(node.type) : undefined
  const textField = entry?.props.find((p) => p.type === 'text')
  const original = node && textField ? String(node.props[textField.key] ?? textField.default ?? '') : ''

  const close = () => {
    if (closedRef.current) return
    closedRef.current = true
    onClose()
  }

  const commit = (next: string) => {
    if (!node || !textField) return
    const trimmedChanged = next !== original
    if (trimmedChanged) {
      // '' = UNSET (registry default takes over) — same contract as the
      // inspector's text fields.
      setNodeProps(node.id, { [textField.key]: next === '' ? undefined : next })
    }
  }

  /* Seed: mirror typography, hide the underlying RNW text, focus + select.
   * DOM measurement + focus is the canonical useLayoutEffect case (same
   * justification as useNodeMeasure): it must read the JUST-RENDERED layout
   * before paint so the editor never appears at a stale position. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    setTypo(mirrorTypography(screen.id, nodeId))
    const artboard = document.querySelector<HTMLElement>(`[${ARTBOARD_ATTR}="${cssEscape(screen.id)}"]`)
    const nodeEl = artboard?.querySelector<HTMLElement>(nodeSelector(nodeId))
    if (nodeEl) nodeEl.style.visibility = 'hidden'
    const el = editorRef.current
    if (el) {
      el.textContent = original
      el.focus()
      // Select-all on entry (builder convention: type to replace, arrow to refine).
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(el)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
    return () => {
      if (nodeEl) nodeEl.style.visibility = ''
    }
    // Seed exactly once per session (screen/node identity), not on every keystroke.
  }, [screen.id, nodeId])
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Restore visibility even if the node unmounts mid-edit (deletion). */
  useEffect(() => {
    return () => {
      const artboard = document.querySelector<HTMLElement>(`[${ARTBOARD_ATTR}="${cssEscape(screen.id)}"]`)
      const nodeEl = artboard?.querySelector<HTMLElement>(nodeSelector(nodeId))
      if (nodeEl) nodeEl.style.visibility = ''
    }
  }, [screen.id, nodeId])

  if (!node || !rect || !textField) return null

  const left = (screen.x + rect.left) * zoom + panX
  const top = (screen.y + rect.top) * zoom + panY
  const width = rect.width * zoom

  return (
    <div
      ref={editorRef}
      role="textbox"
      aria-label={`Edit ${entry?.name ?? 'text'} content`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      className="absolute z-30 whitespace-pre-wrap outline-none"
      style={{
        left,
        top,
        width,
        minHeight: rect.height * zoom,
        fontFamily: typo?.fontFamily,
        fontSize: (typo?.fontSizePx ?? 14) * zoom,
        fontWeight: typo?.fontWeight as never,
        lineHeight: typo?.lineHeightPx != null ? `${typo.lineHeightPx * zoom}px` : undefined,
        letterSpacing: typo?.letterSpacingPx != null ? `${typo.letterSpacingPx * zoom}px` : undefined,
        color: typo?.color,
        textAlign: (typo?.textAlign ?? 'left') as never,
        background: 'rgba(0, 122, 255, 0.06)',
        boxShadow: '0 0 0 1.5px rgba(0, 122, 255, 0.9)',
        cursor: 'text',
        WebkitUserSelect: 'text',
        userSelect: 'text'
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => {
        if (closedRef.current) return
        commit(editorRef.current?.textContent ?? '')
        close()
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') {
          e.preventDefault()
          close() // cancel: no commit, no history entry
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          commit(editorRef.current?.textContent ?? '')
          close()
        }
      }}
    />
  )
}
