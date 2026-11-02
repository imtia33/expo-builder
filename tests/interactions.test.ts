/*
 * Phase 4, slice 1 (P0-1 event wiring) — interactions: the shared resolver,
 * store plumbing (setNodeInteraction + undo), and end-to-end codegen of
 * wired buttons (all four implementations) incl. list item templates.
 *
 * Codegen assertions are exact emitted-source strings through
 * generateProjectFiles, same style as phase2/codegen-paint suites.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { resetProjectHistory, useProjectStore } from '@/lib/project/store'
import type { ProjectData, Screen, ScreenGroup } from '@/lib/project/types'
import { generateProjectFiles } from '@/lib/codegen/files'
import { renderScreenFile } from '@/lib/codegen/screens'
import { screenHref } from '@/lib/codegen/interactions'
import { fireInteraction, resolveInteraction, type PreviewNav } from '@/lib/interactions/resolve'
import { seedListItemTemplate } from '@/components/builder/canvas/list-insert'
import type { InteractionAction } from '@/lib/project/types'

/* ────────────────────────────────────────────────────────────────────────────
 * Fixtures
 * ──────────────────────────────────────────────────────────────────────────── */

function resetStore() {
  resetProjectHistory()
  const empty: ProjectData = { name: 'Phase 4 test', groups: [], screens: [], nodes: {} }
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

const SCREENS: Screen[] = [
  { id: 'home', name: 'Home', route: 'home', groupId: 'g1', order: 0, deviceId: 'iphone-17-pro', x: 0, y: 0, safeArea: { top: true, bottom: true }, background: '#FFFFFF' },
  { id: 'detail', name: 'Detail', route: 'detail', groupId: 'g1', order: 1, deviceId: 'iphone-17-pro', x: 0, y: 0, safeArea: { top: true, bottom: true }, background: '#FFFFFF' },
  { id: 'login', name: 'Login', route: 'login', groupId: null, order: 0, deviceId: 'iphone-17-pro', x: 0, y: 0, safeArea: { top: true, bottom: true }, background: '#FFFFFF' }
]

/** Home screen with one wired button (set via the store, like the inspector does). */
function wiredProject(action: InteractionAction | null) {
  const homeId = s().addScreen({ name: 'Home' })
  const detailId = s().addScreen({ name: 'Detail' })
  const buttonId = s().insertNode({
    screenId: homeId,
    type: 'button',
    props: { title: 'Open detail' },
    rect: { left: 24, top: 100, width: 160, height: 48 }
  })
  const resolved =
    action?.kind === 'navigate' ? { ...action, screenId: action.screenId === '__detail__' ? detailId : action.screenId } : action
  s().setNodeInteraction(buttonId, 'onPress', resolved)
  return { homeId, detailId, buttonId }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Resolver — the one validation surface for preview + inspector + codegen
 * ──────────────────────────────────────────────────────────────────────────── */

describe('resolveInteraction', () => {
  it('validates navigate actions against the screen list', () => {
    expect(resolveInteraction({ kind: 'navigate', screenId: 'detail', mode: 'push' }, SCREENS)).toEqual({
      kind: 'navigate',
      screenId: 'detail',
      mode: 'push'
    })
    expect(resolveInteraction({ kind: 'navigate', screenId: 'gone', mode: 'push' }, SCREENS)).toBeNull()
    expect(resolveInteraction({ kind: 'navigate', screenId: '', mode: 'push' }, SCREENS)).toBeNull()
  })

  it('back always resolves; unknown/absent actions are unwired', () => {
    expect(resolveInteraction({ kind: 'back' }, SCREENS)).toEqual({ kind: 'back' })
    expect(resolveInteraction({ kind: 'back' }, [])).toEqual({ kind: 'back' })
    expect(resolveInteraction(undefined, SCREENS)).toBeNull()
    expect(resolveInteraction({ kind: 'teleport' } as never, SCREENS)).toBeNull()
  })

  it('screenHref: group-prefixed hrefs match the layout emitters, standalone screens do not', () => {
    const main: ScreenGroup = {
      id: 'g1',
      name: 'Main',
      dirName: 'main',
      order: 0,
      parentId: null,
      nav: { kind: 'none' }
    }
    expect(screenHref(SCREENS[1], { groups: [main] })).toBe('/main/detail')
    expect(screenHref(SCREENS[2], { groups: [main] })).toBe('/login')
  })

  it('fireInteraction drives the sim runtime and tolerates dangling targets', () => {
    const calls: string[] = []
    const nav: PreviewNav = {
      navigate: (target, mode) => calls.push(`navigate:${target}:${mode}`),
      back: () => calls.push('back')
    }
    const data = { screens: SCREENS }
    fireInteraction('onPress', { interactions: { onPress: { kind: 'navigate', screenId: 'detail', mode: 'push' } } }, data, nav)
    fireInteraction('onPress', { interactions: { onPress: { kind: 'navigate', screenId: 'gone', mode: 'push' } } }, data, nav)
    fireInteraction('onPress', { interactions: { onPress: { kind: 'back' } } }, data, nav)
    fireInteraction('onPress', {}, data, nav)
    expect(calls).toEqual(['navigate:detail:push', 'back'])
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * Store — setNodeInteraction (wiring, unwiring, validation, undo)
 * ──────────────────────────────────────────────────────────────────────────── */

describe('setNodeInteraction', () => {
  it('wires and unwires a declared hook (registry-validated)', () => {
    const { buttonId } = wiredProject({ kind: 'navigate', screenId: '__detail__', mode: 'push' })
    const node = s().data.nodes[buttonId]
    expect(node.interactions).toEqual({ onPress: { kind: 'navigate', screenId: expect.any(String), mode: 'push' } })

    s().setNodeInteraction(buttonId, 'onPress', null)
    expect(s().data.nodes[buttonId].interactions).toBeUndefined()
  })

  it('refuses hooks the registry does not declare', () => {
    const homeId = s().addScreen({ name: 'Home' })
    const viewId = s().insertNode({ screenId: homeId, type: 'view', rect: { left: 0, top: 0, width: 100, height: 100 } })
    s().setNodeInteraction(viewId, 'onPress', { kind: 'back' })
    expect(s().data.nodes[viewId].interactions).toBeUndefined()

    const buttonId = s().insertNode({
      screenId: homeId,
      type: 'button',
      rect: { left: 0, top: 0, width: 120, height: 44 }
    })
    s().setNodeInteraction(buttonId, 'onLongPress', { kind: 'back' })
    expect(s().data.nodes[buttonId].interactions).toBeUndefined()
  })

  it('one undo entry per wiring change', () => {
    const { buttonId } = wiredProject({ kind: 'back' })
    s().undo()
    expect(s().data.nodes[buttonId].interactions).toBeUndefined()
    s().redo()
    expect(s().data.nodes[buttonId].interactions).toEqual({ onPress: { kind: 'back' } })
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * Codegen — wired buttons emit real expo-router handlers
 * ──────────────────────────────────────────────────────────────────────────── */

describe('interaction codegen', () => {
  it('navigate (push) → useRouter import + component-scope router + inline handler', () => {
    const { homeId, detailId } = wiredProject({ kind: 'navigate', screenId: '__detail__', mode: 'push' })
    const home = s().data.screens.find((x) => x.id === homeId)!
    const file = renderScreenFile(s().data, home)
    expect(file).toContain("import { useRouter } from 'expo-router'")
    expect(file).toContain('const router = useRouter();')
    expect(file).toContain(`onPress={() => { router.push('/detail'); }}`)
    // the handler lives on the button, inside the home screen's tree
    expect(file).toContain('<Pressable')
    expect(file).toContain('>Open detail</Text>')
    expect(detailId).toBeTruthy()
  })

  it('navigate (replace) and back actions', () => {
    const replace = wiredProject({ kind: 'navigate', screenId: '__detail__', mode: 'replace' })
    const homeR = s().data.screens.find((x) => x.id === replace.homeId)!
    expect(renderScreenFile(s().data, homeR)).toContain(`onPress={() => { router.replace('/detail'); }}`)

    resetStore()
    const back = wiredProject({ kind: 'back' })
    const homeB = s().data.screens.find((x) => x.id === back.homeId)!
    expect(renderScreenFile(s().data, homeB)).toContain('onPress={() => { router.back(); }}')
  })

  it('grouped target screens use the group-prefixed href', () => {
    const groupId = s().createGroup({ name: 'Main', navKind: 'stack', screenCount: 2, screenNames: ['Home', 'Detail'] })
    const home = s().data.screens.find((x) => x.groupId === groupId && x.name === 'Home')!
    const detail = s().data.screens.find((x) => x.groupId === groupId && x.name === 'Detail')!
    s().insertNode({ screenId: home.id, type: 'button', props: { title: 'Open' }, rect: { left: 0, top: 0, width: 120, height: 44 } })
    const buttonId = Object.values(s().data.nodes).find((n) => n.screenId === home.id && n.type === 'button')!
    s().setNodeInteraction(buttonId.id, 'onPress', { kind: 'navigate', screenId: detail.id, mode: 'push' })
    const file = renderScreenFile(s().data, home)
    expect(file).toContain(`router.push('/main/detail')`)
  })

  it('rnbutton: the placeholder TODO is replaced by the wired action', () => {
    const { homeId } = wiredProject({ kind: 'navigate', screenId: '__detail__', mode: 'push' })
    const buttonId = Object.values(s().data.nodes).find((n) => n.type === 'button')!
    s().setNodeImpl(buttonId.id, 'rnbutton')
    const home = s().data.screens.find((x) => x.id === homeId)!
    const file = renderScreenFile(s().data, home)
    expect(file).toContain(`onPress={() => { router.push('/detail'); }}`)
    expect(file).not.toContain('TODO: wire an action')
    expect(file).toContain('<Button')
  })

  it('wired button inside a list item template emits the handler inside renderItem', () => {
    const homeId = s().addScreen({ name: 'Home' })
    const detailId = s().addScreen({ name: 'Detail' })
    const listId = s().insertNode({ screenId: homeId, type: 'flatlist', rect: { left: 0, top: 0, width: 340, height: 400 } })
    seedListItemTemplate(listId)
    const templateCard = Object.values(s().data.nodes).find((n) => n.parentId === listId && n.type === 'view')!
    const buttonId = s().insertNode({
      screenId: homeId,
      type: 'button',
      parentId: templateCard.id,
      props: { title: 'Open' },
      rect: { left: 12, top: 12, width: 100, height: 36 }
    })
    s().setNodeInteraction(buttonId, 'onPress', { kind: 'navigate', screenId: detailId, mode: 'push' })
    const home = s().data.screens.find((x) => x.id === homeId)!
    const file = renderScreenFile(s().data, home)
    const renderItemAt = file.indexOf('renderItem=')
    expect(renderItemAt).toBeGreaterThan(-1)
    const handlerAt = file.indexOf(`onPress={() => { router.push('/detail'); }}`)
    expect(handlerAt).toBeGreaterThan(renderItemAt)
  })

  it('unwired screens stay exactly as before: no expo-router import', () => {
    const homeId = s().addScreen({ name: 'Home' })
    s().insertNode({
      screenId: homeId,
      type: 'button',
      props: { title: 'Inert' },
      rect: { left: 0, top: 0, width: 120, height: 44 }
    })
    const files = generateProjectFiles(s().data)
    const homeFile = [...files.entries()].find(([path]) => path.endsWith('/home.tsx'))![1]
    expect(homeFile).not.toContain('expo-router')
    expect(homeFile).not.toContain('onPress')
  })

  it('dangling target (screen deleted after wiring) emits NOTHING — no dead code', () => {
    const { homeId, detailId, buttonId } = wiredProject({ kind: 'navigate', screenId: '__detail__', mode: 'push' })
    s().deleteScreen(detailId)
    const home = s().data.screens.find((x) => x.id === homeId)!
    expect(home).toBeTruthy()
    const file = renderScreenFile(s().data, home)
    expect(file).not.toContain('expo-router')
    expect(file).not.toContain('router.push')
    // the wiring survives in the model (re-picking a screen restores it)
    expect(s().data.nodes[buttonId].interactions?.onPress).toBeDefined()
  })

  it('every generated file of a wired project parses as valid JSX/TS', async () => {
    const { parse } = await import('@babel/parser')
    wiredProject({ kind: 'navigate', screenId: '__detail__', mode: 'push' })
    // sprinkle the other action kinds + implementations across screens
    const detail = s().data.screens.find((x) => x.name === 'Detail')!
    const backBtn = s().insertNode({
      screenId: detail.id,
      type: 'button',
      impl: 'rnbutton',
      props: { title: 'Back' },
      rect: { left: 24, top: 40, width: 120, height: 44 }
    })
    s().setNodeInteraction(backBtn, 'onPress', { kind: 'back' })
    const files = generateProjectFiles(s().data)
    expect(files.size).toBeGreaterThan(0)
    for (const [path, content] of files) {
      expect(() => {
        parse(content, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
      }, `parse failed for ${path}`).not.toThrow()
    }
  })
})
