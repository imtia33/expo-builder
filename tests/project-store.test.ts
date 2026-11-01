/*
 * Project store undo/redo tests — the exact sequences from the spec (§3 Undo
 * and Redo System, §21 acceptance): every meaningful operation is
 * independently reversible; a leaked gesture can never swallow entries;
 * restored states are exact (copy-on-write regression tests).
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { resetProjectHistory, useProjectStore } from '@/lib/project/store'
import type { ProjectData } from '@/lib/project/types'

function resetStore() {
  resetProjectHistory()
  const empty: ProjectData = { name: 'Test app', groups: [], screens: [], nodes: {} }
  useProjectStore.setState({
    data: empty,
    ui: { expanded: {}, lastDeviceId: 'iphone-17-pro', platform: 'ios' },
    selection: null,
    activeScreenId: null,
    sim: { on: false, history: {} },
    past: [],
    future: [],
    revision: 0
  })
}

const s = () => useProjectStore.getState()

beforeEach(resetStore)

describe('the reported bug: move must be its own undo entry', () => {
  it('create screen → add container → add button → move button → undo reverses ONLY the move', () => {
    const screenId = s().addScreen({ name: 'Home' })
    const containerId = s().insertNode({ screenId, type: 'view', rect: { left: 20, top: 20, width: 300, height: 200 } })
    const buttonId = s().insertNode({ screenId, type: 'button', parentId: containerId, rect: { left: 10, top: 10, width: 120, height: 44 } })
    const before = { ...s().data.nodes[buttonId].style }

    // A drag: gesture + live moves (coalesced) + release.
    s().beginGesture(1)
    s().setNodeStyle(buttonId, { left: 42, top: 87 })
    s().setNodeStyle(buttonId, { left: 45, top: 90 })
    s().endGesture(1)

    expect(s().data.nodes[buttonId].style.left).toBe(45)
    expect(s().past.length).toBe(4) // screen + container + button + ONE move entry

    s().undo()

    // ONLY the move reversed: position back, everything else intact.
    expect(s().data.nodes[buttonId].style).toEqual(before)
    expect(s().data.nodes[buttonId]).toBeDefined()
    expect(s().data.nodes[containerId]).toBeDefined()
    expect(s().data.screens.length).toBe(1)
  })

  it('undo again removes the button; again removes the container; screen survives', () => {
    const screenId = s().addScreen()
    const containerId = s().insertNode({ screenId, type: 'view' })
    const buttonId = s().insertNode({ screenId, type: 'button', parentId: containerId })

    s().undo()
    expect(s().data.nodes[buttonId]).toBeUndefined()
    expect(s().data.nodes[containerId]).toBeDefined()

    s().undo()
    expect(s().data.nodes[containerId]).toBeUndefined()
    expect(s().data.screens.length).toBe(1) // screen still exists (spec §21)

    s().undo()
    expect(s().data.screens.length).toBe(0)
  })

  it('redo restores both directions', () => {
    const screenId = s().addScreen()
    const nodeId = s().insertNode({ screenId, type: 'view' })
    s().undo()
    expect(s().data.nodes[nodeId]).toBeUndefined()
    s().redo()
    expect(s().data.nodes[nodeId]).toBeDefined()
    expect(s().data.nodes[nodeId].style.position).toBe('absolute')
  })
})

describe('gesture semantics', () => {
  it('a full drag (many live commits) is ONE undo entry', () => {
    const screenId = s().addScreen()
    const nodeId = s().insertNode({ screenId, type: 'view' })
    const entriesBefore = s().past.length

    s().beginGesture(3)
    for (let i = 0; i < 50; i++) s().setNodeStyle(nodeId, { left: i, top: i })
    s().endGesture(3)

    expect(s().past.length).toBe(entriesBefore + 1)
    s().undo()
    expect(s().data.nodes[nodeId].style.left).toBe(24) // insertNode default
  })

  it('selection changes never create history entries', () => {
    const screenId = s().addScreen()
    const nodeId = s().insertNode({ screenId, type: 'view' })
    const entries = s().past.length
    s().select({ kind: 'node', nodeId, screenId })
    s().setActiveScreen(screenId)
    s().setExpanded(screenId, true)
    expect(s().past.length).toBe(entries)
  })

  it('typing is grouped sensibly: one entry per edit session', () => {
    const screenId = s().addScreen()
    const nodeId = s().insertNode({ screenId, type: 'text' })
    const entries = s().past.length

    // Inspector text fields and the inline canvas editor hold a DRAFT and
    // commit once per session (blur/Enter). A session that updates the store
    // continuously (e.g. a live-preview editor) wraps in a gesture:
    s().beginGesture() // edit session opens
    s().setNodeProps(nodeId, { content: 'H' })
    s().setNodeProps(nodeId, { content: 'He' })
    s().setNodeProps(nodeId, { content: 'Hello' })
    s().endGesture() // session closes

    expect(s().past.length).toBe(entries + 1) // ONE entry for the whole session
    expect(s().data.nodes[nodeId].props.content).toBe('Hello')
    s().undo()
    expect(s().data.nodes[nodeId].props.content).toBeUndefined()
  })

  it('a leaked gesture cannot swallow later history entries (regression)', () => {
    const screenId = s().addScreen()
    // Simulate the leak: a gesture opens (pointerdown) whose end is lost.
    s().beginGesture(99)
    // The window watchdog (installed in the browser; manual in tests) fires:
    s().releaseGestures()

    const nodeId = s().insertNode({ screenId, type: 'view' })
    const entries = s().past.length
    expect(entries).toBeGreaterThan(0) // the insert PUSHED — not swallowed
    s().undo()
    expect(s().data.nodes[nodeId]).toBeUndefined()
  })
})

describe('restored states are exact (copy-on-write regressions)', () => {
  it('undo after deleteNode restores sibling orders exactly', () => {
    const screenId = s().addScreen()
    const a = s().insertNode({ screenId, type: 'view' }) // order 0
    const b = s().insertNode({ screenId, type: 'view' }) // order 1
    const c = s().insertNode({ screenId, type: 'view' }) // order 2
    expect([a, b, c].map((id) => s().data.nodes[id].order)).toEqual([0, 1, 2])

    s().deleteNode(b)
    expect(s().data.nodes[c].order).toBe(1) // dense reindex after delete

    s().undo()
    const orders = [a, b, c].map((id) => s().data.nodes[id].order)
    expect(orders).toEqual([0, 1, 2]) // EXACT restore (was corrupted by in-place mutation)
  })

  it('undo after moveNode restores both buckets exactly', () => {
    const screenId = s().addScreen()
    const a = s().insertNode({ screenId, type: 'view' })
    const b = s().insertNode({ screenId, type: 'view' })
    const c = s().insertNode({ screenId, type: 'view' })
    s().moveNode(c, null, 0) // c to front
    expect([a, b, c].map((id) => s().data.nodes[id].order)).toEqual([1, 2, 0])

    s().undo()
    expect([a, b, c].map((id) => s().data.nodes[id].order)).toEqual([0, 1, 2])
  })

  it('undo after deleteScreen restores sibling screen orders exactly', () => {
    const g = s().createGroup({ name: 'Main', navKind: 'none', screenCount: 3 })
    const screens = s().data.screens.filter((x) => x.groupId === g).sort((x, y) => x.order - y.order)
    expect(screens.map((x) => x.order)).toEqual([0, 1, 2])

    s().deleteScreen(screens[1].id)
    const after = s().data.screens.filter((x) => x.groupId === g).sort((x, y) => x.order - y.order)
    expect(after.map((x) => x.order)).toEqual([0, 1])

    s().undo()
    const restored = s().data.screens.filter((x) => x.groupId === g).sort((x, y) => x.order - y.order)
    expect(restored.map((x) => x.order)).toEqual([0, 1, 2])
  })

  it('screens are deep-equal after an undo round-trip', () => {
    const screenId = s().addScreen({ name: 'Original' })
    s().renameScreen(screenId, 'Renamed')
    const renamed = s().data.screens.find((x) => x.id === screenId)
    s().undo()
    const restored = s().data.screens.find((x) => x.id === screenId)
    expect(restored?.name).toBe('Original')
    expect(restored?.route).toBe('original')
    expect(renamed?.route).toBe('renamed') // the post-state object was not mutated
  })
})

describe('snapshots are references, not clones (memory contract)', () => {
  it('an untouched node object is shared between pre and post states', () => {
    const screenId = s().addScreen()
    const a = s().insertNode({ screenId, type: 'view' })
    const nodeBefore = s().data.nodes[a]
    const dataBefore = s().data
    s().insertNode({ screenId, type: 'view' })
    // The old data graph's node `a` must be the SAME object (structural sharing).
    expect(dataBefore.nodes[a]).toBe(nodeBefore)
    expect(s().data.nodes[a]).toBe(nodeBefore) // untouched → not cloned
    s().undo()
    expect(s().data.nodes[a]).toBe(nodeBefore)
  })
})
