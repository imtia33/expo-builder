/*
 * Phase 5 — regression verification (spec §acceptance):
 *   1. Existing (pre-Phase-2) projects keep working: nodes without impl resolve
 *      to exactly their pre-Phase-2 emission; the full file set generates.
 *   2. Every generated file parses as valid JSX/TS (@babel/parser).
 *
 * The Phase 5 live checks (existing projects open; new component types work
 * in editor AND simulation; tab switching no longer flickers; popovers
 * stable) were verified in-browser during Phases 2/3 — see the WORKLOG
 * entries; this file covers the code-level guarantees.
 */
import { describe, expect, it } from 'vitest'
import { parse } from '@babel/parser'

import { generateProjectFiles } from '@/lib/codegen/files'
import type { ProjectData, ProjectNode } from '@/lib/project/types'

/** A project shaped like a PRE-Phase-2 project: no impls, no listRole, the
 *  v1 prop habits (button variant/hitSlop, image expo surface, plain views). */
function prePhase2Project(): ProjectData {
  const node = (partial: Partial<ProjectNode> & Pick<ProjectNode, 'id' | 'type' | 'order'>): ProjectNode => ({
    id: partial.id,
    screenId: 's1',
    parentId: partial.parentId ?? null,
    type: partial.type,
    order: partial.order,
    props: partial.props ?? {},
    style: partial.style ?? { position: 'absolute', left: 16, top: 24, width: 200, height: 80 }
  })
  return {
    name: 'Pre-phase-2 project',
    groups: [
      {
        id: 'g1',
        name: 'Main',
        dirName: 'main',
        order: 0,
        parentId: null,
        nav: { kind: 'none' }
      }
    ],
    screens: [
      {
        id: 's1',
        name: 'Home',
        route: 'home',
        groupId: 'g1',
        order: 0,
        deviceId: 'iphone-17-pro',
        x: 0,
        y: 0,
        safeArea: { top: true, bottom: true },
        background: { token: 'background' }
      }
    ],
    nodes: {
      v1: node({ id: 'v1', type: 'view', order: 0, style: { position: 'absolute', left: 16, top: 40, width: 320, height: 480 } }),
      t1: node({ id: 't1', type: 'text', order: 1, parentId: 'v1', props: { content: 'Welcome back', numberOfLines: 1 }, style: { position: 'absolute', left: 8, top: 8, width: 200, fontSize: 16, color: { token: 'text' } } }),
      b1: node({
        id: 'b1',
        type: 'button',
        order: 2,
        parentId: 'v1',
        props: { title: 'Continue', variant: 'secondary', disabled: false, hitSlop: 8 },
        style: { position: 'absolute', left: 8, top: 48, width: 140, height: 44, borderRadius: 12 }
      }),
      im1: node({
        id: 'im1',
        type: 'image',
        order: 3,
        parentId: 'v1',
        props: { source: 'https://example.com/a.png', contentFit: 'contain', tint: '#111827' },
        style: { position: 'absolute', left: 8, top: 112, width: 120, height: 90 }
      }),
      sv1: node({ id: 'sv1', type: 'scrollview', order: 4, props: { horizontal: true, showsScrollIndicator: false }, style: { position: 'absolute', left: 16, top: 220, width: 320, height: 120 } }),
      sw1: node({ id: 'sw1', type: 'switch', order: 5, parentId: 'v1', props: { value: true, trackColorTrue: '#2563EB' }, style: { position: 'absolute', left: 8, top: 210 } }),
      dv1: node({ id: 'dv1', type: 'divider', order: 6, parentId: 'v1', props: { axis: 'vertical', thickness: 2, color: '#E5E7EB' }, style: { position: 'absolute', left: 240, top: 8, height: 200 } }),
      lg1: node({ id: 'lg1', type: 'lineargradient', order: 7, props: { startColor: '#A855F7', endColor: '#EC4899', angle: 45 }, style: { position: 'absolute', left: 16, top: 360, width: 320, height: 96 } }),
      bl1: node({ id: 'bl1', type: 'blurview', order: 8, parentId: 'lg1', props: { intensity: 60, tint: 'system' }, style: { position: 'absolute', left: 8, top: 8, width: 200, height: 60 } }),
      ti1: node({ id: 'ti1', type: 'textinput', order: 9, parentId: 'v1', props: { placeholder: 'Email', keyboardType: 'email-address' }, style: { position: 'absolute', left: 8, top: 260, width: 240, height: 40 } }),
      ai1: node({ id: 'ai1', type: 'activityindicator', order: 10, parentId: 'v1', props: { size: 'large', color: '#2563EB' }, style: { position: 'absolute', left: 8, top: 320 } })
    },
    theme: {
      colors: {
        background: { light: '#FFFFFF', dark: '#09090B' },
        text: { light: '#111827', dark: '#F5F5F5' }
      }
    }
  }
}

describe('Phase 5: pre-Phase-2 project backward compatibility', () => {
  const files = generateProjectFiles(prePhase2Project())

  it('generates the full file set (root layout, group screen, theme files)', () => {
    expect([...files.keys()].sort()).toEqual([
      'app/(main)/home.tsx',
      'app/_layout.tsx',
      'constants/theme.ts',
      'hooks/useTheme.ts'
    ])
  })

  it('view without impl stays the plain react-native View; the screen-level wrapper is the only SafeAreaView', () => {
    const screen = files.get('app/(main)/home.tsx')!
    expect(screen).toMatch(/import \{[^}]*View[^}]*\} from 'react-native'/)
    expect(screen).toContain("import { SafeAreaView } from 'react-native-safe-area-context'")
    expect(screen).toContain("<SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>")
    // Exactly ONE SafeAreaView import line — no node-level second one.
    expect(screen.match(/SafeAreaView/g)?.length).toBe(3) // import + open + close tags
  })

  it('button without impl keeps the Pressable composite + variant preset + hitSlop', () => {
    const screen = files.get('app/(main)/home.tsx')!
    expect(screen).toContain('<Pressable')
    // secondary variant preset box + the node's style wins per key.
    expect(screen).toContain("backgroundColor: '#F3F4F6'")
    expect(screen).toContain('borderRadius: 12') // node style over the preset's 8
    expect(screen).toContain('hitSlop={8}')
    expect(screen).toContain('Continue') // the label
  })

  it('image without impl keeps the expo-image surface (real package API: contentFit prop, tint → tintColor)', () => {
    const screen = files.get('app/(main)/home.tsx')!
    expect(screen).toContain("import { Image } from 'expo-image'")
    expect(screen).toContain('contentFit="contain"')
    expect(screen).toContain('tintColor="#111827"')
    expect(screen).toContain('source="https://example.com/a.png"')
  })

  it('screen background token resolves to colors.x with useTheme (unchanged)', () => {
    const screen = files.get('app/(main)/home.tsx')!
    expect(screen).toContain("import { useTheme } from '@/hooks/useTheme'")
    expect(screen).toContain('backgroundColor: colors.background')
    expect(screen).toContain('color: colors.text')
  })

  it('the pre-Phase-2 habit props still emit through their mappings', () => {
    const screen = files.get('app/(main)/home.tsx')!
    // ScrollView fanout + horizontal; showsScrollIndicator absent entirely.
    expect(screen).toContain('horizontal={true}')
    expect(screen).toContain('showsHorizontalScrollIndicator={false}')
    expect(screen).toContain('showsVerticalScrollIndicator={false}')
    expect(screen).not.toContain('showsScrollIndicator')
    // Switch trackColor composition (undefined side dropped by printValue).
    expect(screen).toContain("trackColor={{ true: '#2563EB' }}")
    // Divider vertical axis visual.
    expect(screen).toContain('width: 2')
    // LinearGradient wrapper.
    expect(screen).toContain("import { LinearGradient } from 'expo-linear-gradient'")
    expect(screen).toContain("colors={['#A855F7', '#EC4899']}")
    // BlurView tint mapping (system -> default).
    expect(screen).toContain("import { BlurView } from 'expo-blur'")
    expect(screen).toContain('tint="default"')
    // TextInput.
    expect(screen).toContain('keyboardType="email-address"')
    expect(screen).toContain('placeholder="Email"')
    // ActivityIndicator props.
    expect(screen).toContain('size="large"')
  })
})

describe('Phase 5: generated code parses as valid JSX/TS', () => {
  const files = generateProjectFiles(prePhase2Project())

  it('every file parses with @babel/parser', () => {
    for (const [path, content] of files) {
      expect(() => {
        parse(content, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
      }, `parse failed for ${path}`).not.toThrow()
    }
  })
})
