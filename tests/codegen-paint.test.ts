/*
 * End-to-end codegen paint tests (Phase 1): gradient fills → LinearGradient
 * wrapper; theme tokens → colors.x + useTheme wiring; the project theme files
 * (constants/theme.ts + hooks/useTheme.ts) are always emitted with a palette.
 */
import { describe, expect, it } from 'vitest'

import { generateProjectFiles } from '@/lib/codegen/files'
import type { ProjectData } from '@/lib/project/types'

function projectData(): ProjectData {
  return {
    name: 'Paint test',
    groups: [],
    screens: [
      {
        id: 's1',
        name: 'Home',
        route: 'home',
        groupId: null,
        order: 0,
        deviceId: 'iphone-17-pro',
        x: 0,
        y: 0,
        safeArea: { top: true, bottom: true },
        background: { token: 'background' }
      }
    ],
    nodes: {
      v1: {
        id: 'v1',
        screenId: 's1',
        parentId: null,
        type: 'view',
        order: 0,
        props: {},
        style: {
          position: 'absolute',
          left: 10,
          top: 20,
          width: 100,
          height: 80,
          backgroundColor: { type: 'linear-gradient', angle: 0, stops: [{ color: '#A855F7', position: 0 }, { color: '#EC4899', position: 1 }] }
        }
      },
      v2: {
        id: 'v2',
        screenId: 's1',
        parentId: null,
        type: 'view',
        order: 1,
        props: {},
        style: { position: 'absolute', left: 10, top: 120, width: 100, height: 40, backgroundColor: { token: 'primary' } }
      },
      t1: {
        id: 't1',
        screenId: 's1',
        parentId: null,
        type: 'text',
        order: 2,
        props: { content: 'Hello' },
        style: { position: 'absolute', left: 10, top: 180, color: { token: 'text' } }
      }
    },
    theme: { colors: { primary: { light: '#2563EB', dark: '#3B82F6' }, text: { light: '#111827', dark: '#F5F5F5' }, background: { light: '#FFFFFF', dark: '#09090B' } } }
  }
}

describe('codegen paint end-to-end', () => {
  const files = generateProjectFiles(projectData())

  it('emits the plain-TS theme files alongside the app tree', () => {
    expect(files.has('constants/theme.ts')).toBe(true)
    expect(files.has('hooks/useTheme.ts')).toBe(true)
    expect(files.get('hooks/useTheme.ts')).toContain("import { COLORS } from '@/constants/theme'")
    const constants = files.get('constants/theme.ts')!
    expect(constants).toContain('primary:')
    expect(constants).toContain("'#2563EB'")
    expect(constants).toContain("'#3B82F6'")
  })

  it('wraps gradient-filled containers in LinearGradient', () => {
    const screen = files.get('app/home.tsx')!
    expect(screen).toContain("import { LinearGradient } from 'expo-linear-gradient'")
    expect(screen).toContain("colors={['#A855F7', '#EC4899']}")
    // 0° builder angle = left→right → start {x:0,y:0.5} end {x:1,y:0.5}
    expect(screen).toContain('start={{ x: 0, y: 0.5 }}')
    expect(screen).toContain('end={{ x: 1, y: 0.5 }}')
    // the wrapper keeps the placement style but drops the paint key
    expect(screen).not.toContain('backgroundColor: {')
  })

  it('emits token references as colors.x with the useTheme hook line', () => {
    const screen = files.get('app/home.tsx')!
    expect(screen).toContain("import { useTheme } from '@/hooks/useTheme'")
    expect(screen).toContain('const { colors } = useTheme()')
    expect(screen).toContain('backgroundColor: colors.primary')
    expect(screen).toContain('color: colors.text')
    // screen background token resolves too
    expect(screen).toContain('backgroundColor: colors.background')
  })

  it('uses SafeAreaView from react-native-safe-area-context (never RN core)', () => {
    const screen = files.get('app/home.tsx')!
    expect(screen).toContain("import { SafeAreaView } from 'react-native-safe-area-context'")
    expect(screen).not.toContain("SafeAreaView } from 'react-native'")
  })
})
