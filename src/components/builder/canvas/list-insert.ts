'use client'
/*
 * List insertion seeding (Phase 2) — "design ONE item, repeat with dynamic
 * data", delivered out of the box.
 *
 * A freshly inserted flatlist/sectionlist gets ONE item-template child (a
 * card View + a Text bound to `{item.title}`) so the canvas immediately
 * shows real repeating rows fed by the list's data source. SectionList also
 * gets a header child (bound to `{section.header}`) so section headers render
 * per section from the start.
 *
 * Everything seeded is ordinary model content: real nodes, real styles, real
 * bindings — restyle, re-bind, or delete freely. The template root is IN-FLOW
 * (position: relative, width 100%): list rows come from the list's flex
 * layout, not from absolute placement (documented in the entry previewNote).
 *
 * Called from placeComponent inside its gesture, so list + template land as
 * ONE undo entry.
 */
import { isListEntryType } from '@/lib/lists/bindings'
import { useProjectStore } from '@/lib/project/store'

/** In-flow style for the template card: fills the row, no absolute geometry.
 * height is cleared (the view entry's insert default 120 must not leak in) —
 * minHeight keeps the card from collapsing. */
const TEMPLATE_CARD_STYLE: Record<string, unknown> = {
  position: 'relative',
  left: undefined,
  top: undefined,
  width: '100%',
  height: undefined,
  minHeight: 64,
  backgroundColor: '#F3F4F6',
  borderRadius: 8,
  paddingTop: 12,
  paddingRight: 12,
  paddingBottom: 12,
  paddingLeft: 12
}

/** In-flow style for the bound Text inside the card. */
const TEMPLATE_TEXT_STYLE: Record<string, unknown> = {
  position: 'relative',
  left: undefined,
  top: undefined,
  width: undefined,
  fontSize: 15,
  color: '#111827'
}

/** In-flow style for a section header row. */
const HEADER_STYLE: Record<string, unknown> = {
  position: 'relative',
  left: undefined,
  top: undefined,
  width: '100%',
  height: undefined,
  paddingTop: 8,
  paddingRight: 12,
  paddingBottom: 8,
  paddingLeft: 12
}

const HEADER_TEXT_STYLE: Record<string, unknown> = {
  position: 'relative',
  left: undefined,
  top: undefined,
  width: undefined,
  fontSize: 13,
  fontWeight: '600' as const,
  color: '#6B7280'
}

/**
 * Seed the item template (+ section header for sectionlist) under a freshly
 * inserted list node. No-op for non-lists and for lists that already have
 * children (re-placement, future re-seed guards).
 */
export function seedListItemTemplate(listNodeId: string): void {
  const store = useProjectStore.getState()
  const list = store.data.nodes[listNodeId]
  if (!list || !isListEntryType(list.type)) return
  const screenId = list.screenId

  // Only seed a genuinely fresh list (no children yet).
  const hasChildren = Object.values(store.data.nodes).some((n) => n.parentId === listNodeId)
  if (hasChildren) return

  const boundText = (parent: string, content: string, style: Record<string, unknown>): void => {
    const id = store.insertNode({ screenId, type: 'text', parentId: parent, rect: { left: 0, top: 0, width: 180 }, props: { content } })
    store.setNodeStyle(id, style)
  }

  // Item template: card View + bound Text.
  const cardId = store.insertNode({ screenId, type: 'view', parentId: listNodeId, rect: { left: 0, top: 0, width: 200 } })
  store.setNodeStyle(cardId, TEMPLATE_CARD_STYLE)
  boundText(cardId, '{item.title}', TEMPLATE_TEXT_STYLE)

  // SectionList: header row + bound Text, playing the section-header role.
  if (list.type === 'sectionlist') {
    const headerId = store.insertNode({ screenId, type: 'view', parentId: listNodeId, rect: { left: 0, top: 0, width: 200 } })
    store.setNodeListRole(headerId, 'header')
    store.setNodeStyle(headerId, HEADER_STYLE)
    boundText(headerId, '{section.header}', HEADER_TEXT_STYLE)
  }
}
