/*
 * Builds a demo project by driving the REAL store actions (same code paths the
 * UI uses), then prints the persisted-state JSON for injection into the browser.
 */
import { readFileSync, writeFileSync } from 'fs'
import { useProjectStore, screensInBucket } from '../src/lib/project/store'
import { getEntry } from '../src/expoforge/registry'

const store = useProjectStore.getState()

/* ── Main tabs group ── */
const mainId = store.createGroup({ name: 'Main', navKind: 'tabs', screenCount: 3, screenNames: ['Home', 'Explore', 'Profile'] })
const mainScreens = screensInBucket(useProjectStore.getState().data, mainId)
const home = mainScreens.find((s) => s.name === 'Home')!
const explore = mainScreens.find((s) => s.name === 'Explore')!
const profile = mainScreens.find((s) => s.name === 'Profile')!

/* Tab icons: defaults are already house/compass/user-circle — relabel nicely. */
store.patchTabItem(mainId, home.id, { label: 'Home', icon: 'ph:house' })
store.patchTabItem(mainId, explore.id, { label: 'Explore', icon: 'ph:compass' })
store.patchTabItem(mainId, profile.id, { label: 'Profile', icon: 'ph:user-circle' })

/* ── Auth stack group ── */
const authId = store.createGroup({ name: 'Auth', navKind: 'stack', screenCount: 2, screenNames: ['Sign In', 'Create Account'] })
const authScreens = screensInBucket(useProjectStore.getState().data, authId)
const signIn = authScreens.find((s) => s.name === 'Sign In')!

/* ── Home content ── */
const st = useProjectStore.getState()
const d = st.data

function addNode(screenId: string, type: string, rect: { left: number; top: number; width?: number; height?: number }, props: Record<string, unknown>, style: Record<string, unknown>) {
  const id = useProjectStore.getState().insertNode({ screenId, type, parentId: null, rect })
  useProjectStore.getState().setNodeProps(id, props)
  useProjectStore.getState().setNodeStyle(id, style)
  return id
}

const W = 354 // content width - 2*24 gutter (402 - 48)

addNode(home.id, 'text', { left: 24, top: 48, width: W }, { content: 'Welcome back', numberOfLines: 0 }, { fontSize: 30, fontWeight: '700', color: '#111111', letterSpacing: -0.5 })
addNode(home.id, 'text', { left: 24, top: 92, width: W }, { content: 'Sign in to continue building', numberOfLines: 0 }, { fontSize: 15, color: '#6B7280' })
addNode(home.id, 'textinput', { left: 24, top: 152, width: W, height: 48 }, { placeholder: 'Email', keyboardType: 'email-address' }, { borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', paddingHorizontal: 16, fontSize: 16 })
addNode(home.id, 'textinput', { left: 24, top: 212, width: W, height: 48 }, { placeholder: 'Password', secureTextEntry: true }, { borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', paddingHorizontal: 16, fontSize: 16 })
addNode(home.id, 'button', { left: 24, top: 292, width: W, height: 52 }, { title: 'Sign In', variant: 'solid' }, { borderRadius: 14, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' })
addNode(home.id, 'text', { left: 24, top: 364, width: W }, { content: 'New here? Create an account', numberOfLines: 0 }, { fontSize: 14, color: '#007AFF', textAlign: 'center' })

/* Explore + Profile + auth screens: quiet single-title placeholders */
addNode(explore.id, 'text', { left: 24, top: 48, width: W }, { content: 'Explore', numberOfLines: 0 }, { fontSize: 28, fontWeight: '700', color: '#111111' })
addNode(explore.id, 'text', { left: 24, top: 88, width: W }, { content: 'Discover projects from the community', numberOfLines: 0 }, { fontSize: 15, color: '#6B7280' })
addNode(profile.id, 'text', { left: 24, top: 48, width: W }, { content: 'Profile', numberOfLines: 0 }, { fontSize: 28, fontWeight: '700', color: '#111111' })
addNode(profile.id, 'text', { left: 24, top: 88, width: W }, { content: 'Your account and settings', numberOfLines: 0 }, { fontSize: 15, color: '#6B7280' })
addNode(signIn.id, 'text', { left: 24, top: 48, width: W }, { content: 'Sign in to your account', numberOfLines: 0 }, { fontSize: 24, fontWeight: '700', color: '#111111' })
addNode(signIn.id, 'text', { left: 24, top: 88, width: W }, { content: 'This screen sits in the Auth stack group.', numberOfLines: 0 }, { fontSize: 15, color: '#6B7280' })

/* ── Final view state ── */
useProjectStore.getState().setExpanded(mainId, true)
useProjectStore.getState().setExpanded(authId, true)
useProjectStore.getState().setExpanded(home.id, true)
useProjectStore.getState().select({ kind: 'screen', screenId: home.id })
useProjectStore.getState().setActiveScreen(home.id)

/* ── Sanity: run codegen over the demo ── */
const { generateProjectFiles } = await import('../src/lib/codegen')
const files = generateProjectFiles(useProjectStore.getState().data)
console.log('codegen files:', [...files.keys()].sort().join(' | '))

/* ── Output persisted-state shape (what zustand persist would store) ── */
const s = useProjectStore.getState()
const payload = {
  state: {
    data: s.data,
    ui: s.ui,
    selection: s.selection,
    activeScreenId: s.activeScreenId
  },
  version: 2
}
writeFileSync('/tmp/demo-state.json', JSON.stringify(payload))
console.log('screens:', s.data.screens.map((x) => `${x.name}@(${Math.round(x.x)},${Math.round(x.y)})`).join('  '))
console.log('nodes:', Object.keys(s.data.nodes).length)
console.log('demo state written to /tmp/demo-state.json')

/* keep bun from tree-shaking unused import */
void getEntry('view')
void readFileSync
void W
