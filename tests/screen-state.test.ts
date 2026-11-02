/*
 * Phase 4, slice 2 — screen state: the shared resolver, store plumbing
 * (setScreenState + simSetState), interaction set-state actions, and
 * end-to-end codegen ({state.x} bindings + usage-gated useState emission).
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { resetProjectHistory, useProjectStore } from '@/lib/project/store'
import type { ProjectData, ScreenStateEntry } from '@/lib/project/types'
import { renderScreenFile } from '@/lib/codegen/screens'
import {
  coerceInitial,
  isStateBinding,
  normalizeStateEntries,
  parseStateBinding,
  resolveStateValues,
  setterName,
  stateEntry,
  stateExpression,
  stateNameOk,
  statePreviewValue
} from '@/lib/state/screen-state'
import { resolveInteraction } from '@/lib/interactions/resolve'

function resetStore() {
  resetProjectHistory()
  const empty: ProjectData = { name: 'Phase 4b test', groups: [], screens: [], nodes: {} }
  useProjectStore.setState({
    data: empty,
    ui: { expanded: {}, lastDeviceId: 'iphone-17-pro', platform: 'ios', themeMode: 'light' },
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

/** Screen 1 with a Text (bindable content) + Button, plus declared state. */
function statefulProject(entries: ScreenStateEntry[], content = '{state.count}') {
  const homeId = s().addScreen({ name: 'Home' })
  s().addScreen({ name: 'Detail' })
  const textId = s().insertNode({
    screenId: homeId,
    type: 'text',
    props: { content },
    rect: { left: 24, top: 80, width: 200, height: 40 }
  })
  const buttonId = s().insertNode({
    screenId: homeId,
    type: 'button',
    props: { title: 'Count' },
    rect: { left: 24, top: 140, width: 160, height: 48 }
  })
  s().setScreenState(homeId, entries)
  return { homeId, textId, buttonId }
}

/* ── Resolver ─────────────────────────────────────────────────────────────── */

describe('state helpers', () => {
  it('parses {state.x} bindings only as whole strings', () => {
    expect(parseStateBinding('{state.busy}')).toEqual({ name: 'busy' })
    expect(parseStateBinding('{state.a.b}')).toBeNull() // single segment only
    expect(parseStateBinding('{item.title}')).toBeNull()
    expect(parseStateBinding('count: {state.count}')).toBeNull() // whole string
    expect(parseStateBinding(undefined)).toBeNull()
    expect(isStateBinding('{state.busy}')).toBe(true)
    expect(isStateBinding('{state.a.b}')).toBe(false)
  })

  it('validates names against identifiers + the emitted-identifier blocklist', () => {
    expect(stateNameOk('busy')).toBe(true)
    expect(stateNameOk('value2')).toBe(true)
    expect(stateNameOk('_x')).toBe(true)
    expect(stateNameOk('2x')).toBe(false)
    expect(stateNameOk('my state')).toBe(false)
    expect(stateNameOk('router')).toBe(false) // emitted by useRouter
    expect(stateNameOk('colors')).toBe(false) // emitted by useTheme
  })

  it('derives setters and coerces initials', () => {
    expect(setterName('busy')).toBe('setBusy')
    expect(setterName('x')).toBe('setX')
    expect(coerceInitial('boolean', 'true')).toBe(true)
    expect(coerceInitial('boolean', true)).toBe(true)
    expect(coerceInitial('number', '7')).toBe(7)
    expect(coerceInitial('number', 'junk')).toBe(0)
    expect(coerceInitial('string', 5)).toBe('5')
  })

  it('normalizeStateEntries drops invalid/duplicate entries', () => {
    const out = normalizeStateEntries([
      { id: 'a', name: 'busy', type: 'boolean', initial: false },
      { id: 'b', name: 'busy', type: 'string', initial: '' }, // duplicate name
      { id: 'c', name: 'router', type: 'string', initial: '' }, // blocked
      { id: 'd', name: 'ok', type: 'number', initial: '3' },
      'junk',
      null
    ])
    expect(out).toEqual([
      { id: 'a', name: 'busy', type: 'boolean', initial: false },
      { id: 'd', name: 'ok', type: 'number', initial: 3 }
    ])
  })

  it('preview substitution resolves from effective values; unknown stays raw', () => {
    expect(statePreviewValue('{state.busy}', { busy: true })).toBe('true')
    expect(statePreviewValue('{state.busy}', {})).toBe('{state.busy}')
    expect(statePreviewValue('plain', { busy: true })).toBe('plain')
    expect(stateExpression('{state.busy}')).toBe('busy')
    expect(stateExpression('plain')).toBeNull()
  })

  it('resolveStateValues overlays sim values on declared initials', () => {
    const screen = {
      state: [
        { id: 'a', name: 'busy', type: 'boolean' as const, initial: false },
        { id: 'b', name: 'label', type: 'string' as const, initial: 'Hi' }
      ]
    }
    expect(resolveStateValues(screen as never, undefined)).toEqual({ busy: false, label: 'Hi' })
    expect(resolveStateValues(screen as never, { busy: true, ghost: 1 })).toEqual({ busy: true, label: 'Hi' })
    expect(stateEntry(screen as never, 'busy')?.type).toBe('boolean')
    expect(stateEntry(screen as never, 'nope')).toBeNull()
  })
})

/* ── Interaction resolution (set-state arm) ───────────────────────────────── */

describe('resolveInteraction set-state', () => {
  const screens = [
    {
      id: 'home',
      name: 'Home',
      route: 'home',
      groupId: null,
      order: 0,
      deviceId: 'iphone-17-pro',
      x: 0,
      y: 0,
      safeArea: { top: true, bottom: true },
      background: '#FFFFFF',
      state: [
        { id: 'a', name: 'busy', type: 'boolean' as const, initial: false },
        { id: 'b', name: 'count', type: 'number' as const, initial: 0 }
      ]
    }
  ]

  it('accepts matching-type values and boolean toggles', () => {
    expect(resolveInteraction({ kind: 'set-state', name: 'busy', value: 'toggle' }, screens, 'home')).toEqual({
      kind: 'set-state',
      name: 'busy',
      value: 'toggle'
    })
    expect(resolveInteraction({ kind: 'set-state', name: 'busy', value: true }, screens, 'home')).not.toBeNull()
    expect(resolveInteraction({ kind: 'set-state', name: 'count', value: 3 }, screens, 'home')).not.toBeNull()
  })

  it('rejects undeclared names, wrong screens, and type mismatches', () => {
    expect(resolveInteraction({ kind: 'set-state', name: 'ghost', value: true }, screens, 'home')).toBeNull()
    expect(resolveInteraction({ kind: 'set-state', name: 'busy', value: true }, screens, 'other-screen')).toBeNull()
    expect(resolveInteraction({ kind: 'set-state', name: 'count', value: 'toggle' }, screens, 'home')).toBeNull()
    expect(resolveInteraction({ kind: 'set-state', name: 'count', value: '5' }, screens, 'home')).toBeNull()
    expect(resolveInteraction({ kind: 'set-state', name: 'busy', value: 1 }, screens, 'home')).toBeNull()
  })
})

/* ── Store ────────────────────────────────────────────────────────────────── */

describe('screen state store', () => {
  it('setScreenState declares entries (one undo entry) and drops the key when empty', () => {
    const { homeId } = statefulProject([{ id: 'a', name: 'count', type: 'number', initial: 0 }])
    const home = s().data.screens.find((x) => x.id === homeId)!
    expect(home.state).toEqual([{ id: 'a', name: 'count', type: 'number', initial: 0 }])
    s().undo()
    expect(s().data.screens.find((x) => x.id === homeId)!.state).toBeUndefined()
    s().redo()
    expect(s().data.screens.find((x) => x.id === homeId)!.state?.length).toBe(1)
    s().setScreenState(homeId, [])
    expect(s().data.screens.find((x) => x.id === homeId)!.state).toBeUndefined()
  })

  it('simSetState writes live values (toggle flips) only in sim, never undoable', () => {
    const { homeId } = statefulProject([{ id: 'a', name: 'busy', type: 'boolean', initial: false }])
    s().setSim(true)
    s().simSetState(homeId, 'busy', 'toggle')
    expect(s().sim.values?.[homeId]).toEqual({ busy: true }) // false → true
    s().simSetState(homeId, 'busy', 'toggle')
    expect(s().sim.values?.[homeId]).toEqual({ busy: false }) // true → false
    s().simSetState(homeId, 'busy', false)
    s().simSetState(homeId, 'ghost', true) // undeclared → ignored
    expect(s().sim.values?.[homeId]).toEqual({ busy: false })
    const before = s().past.length
    s().undo() // undoes the setScreenState commit, NOT the sim writes
    expect(s().past.length).toBe(before - 1)
  })
})

/* ── Codegen ──────────────────────────────────────────────────────────────── */

describe('screen state codegen', () => {
  it('{state.count} text binds to the useState variable; declaration usage-gated', () => {
    const { homeId } = statefulProject([
      { id: 'a', name: 'count', type: 'number', initial: 0 },
      { id: 'b', name: 'unused', type: 'string', initial: 'x' } // declared but never referenced
    ])
    const home = s().data.screens.find((x) => x.id === homeId)!
    const file = renderScreenFile(s().data, home)
    expect(file).toContain("import { useState } from 'react'")
    expect(file).toContain('const [count, setCount] = useState(0);')
    expect(file).not.toContain('unused') // usage-gated: never referenced, never emitted
    expect(file).toContain('{count}') // the expression child inside <Text>
  })

  it('set-state action emits the setter call (literal + toggle)', () => {
    const { homeId, buttonId } = statefulProject([{ id: 'a', name: 'busy', type: 'boolean', initial: false }])
    s().setNodeInteraction(buttonId, 'onPress', { kind: 'set-state', name: 'busy', value: 'toggle' })
    const home = s().data.screens.find((x) => x.id === homeId)!
    let file = renderScreenFile(s().data, home)
    expect(file).toContain('onPress={() => { setBusy(!busy); }}')
    expect(file).toContain('const [busy, setBusy] = useState(false);')

    s().setNodeInteraction(buttonId, 'onPress', { kind: 'set-state', name: 'busy', value: true })
    file = renderScreenFile(s().data, home)
    expect(file).toContain('onPress={() => { setBusy(true); }}')
    expect(file).not.toContain('expo-router') // no nav handlers → no router import
  })

  it('string + number literals quote correctly', () => {
    const { homeId, buttonId } = statefulProject([{ id: 'a', name: 'label', type: 'string', initial: 'Hi' }])
    s().setNodeInteraction(buttonId, 'onPress', { kind: 'set-state', name: 'label', value: "It's on" })
    const home = s().data.screens.find((x) => x.id === homeId)!
    const file = renderScreenFile(s().data, home)
    expect(file).toContain(`onPress={() => { setLabel('It\\'s on'); }}`)
    expect(file).toContain(`const [label, setLabel] = useState('Hi');`)
  })

  it('undeclared {state.x} stays literal; screen without state emits no react import', () => {
    const { homeId } = statefulProject([], '{state.ghost}')
    const home = s().data.screens.find((x) => x.id === homeId)!
    const file = renderScreenFile(s().data, home)
    expect(file).toContain('{state.ghost}') // literal text — the honest signal
    expect(file).not.toContain("from 'react'")
  })

  it('set-state on a node whose screen lost the entry emits nothing (dangling)', () => {
    const { homeId, buttonId } = statefulProject([{ id: 'a', name: 'busy', type: 'boolean', initial: false }])
    s().setNodeInteraction(buttonId, 'onPress', { kind: 'set-state', name: 'busy', value: 'toggle' })
    s().setScreenState(homeId, []) // entry deleted after wiring
    const home = s().data.screens.find((x) => x.id === homeId)!
    const file = renderScreenFile(s().data, home)
    expect(file).not.toContain('setBusy')
    expect(file).not.toContain("from 'react'")
    // wiring survives in the model
    expect(s().data.nodes[buttonId].interactions?.onPress).toBeDefined()
  })

  it('button title binds {state.busy} on BOTH the composite label and the RN-Button title attr', () => {
    const { homeId, buttonId } = statefulProject([{ id: 'a', name: 'busy', type: 'boolean', initial: false }], 'x')
    // Button title = {state.busy} (set directly, like the Title field does).
    s().setNodeProps(buttonId, { title: '{state.busy}' })
    const home = s().data.screens.find((x) => x.id === homeId)!

    // Composite (pressable, default): expression child inside the label Text.
    let file = renderScreenFile(s().data, home)
    expect(file).toContain('const [busy, setBusy] = useState(false);')
    expect(file).toContain('{busy}')

    // RN Button: the `title` attribute becomes the expression.
    s().setNodeImpl(buttonId, 'rnbutton')
    file = renderScreenFile(s().data, home)
    expect(file).toContain('title={busy}')
    expect(file).not.toContain("title={'{state.busy}'}") // never the raw string
  })

  it('every generated file parses as valid JSX/TS', async () => {
    const { parse } = await import('@babel/parser')
    const { homeId, buttonId } = statefulProject([
      { id: 'a', name: 'count', type: 'number', initial: 0 },
      { id: 'b', name: 'busy', type: 'boolean', initial: false }
    ])
    s().setNodeInteraction(buttonId, 'onPress', { kind: 'set-state', name: 'busy', value: 'toggle' })
    const home = s().data.screens.find((x) => x.id === homeId)!
    expect(() => parse(renderScreenFile(s().data, home), { sourceType: 'module', plugins: ['jsx', 'typescript'] })).not.toThrow()
  })
})
